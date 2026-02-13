# frozen_string_literal: true

require 'net/http'
require 'json'
require 'uri'

module RedmineReport
  module Llm
    class ReportGenerator
      def initialize(project:, filters:)
        @project = project
        @filters = filters
        @provider = build_provider
      end

      def call
        aggregation = RedmineReport::ScheduleReport::Aggregator.new(
          issues: fetch_issues,
          project: @project,
          filters: @filters
        ).call

        prompt = build_prompt(aggregation)
        response_text = @provider.generate(prompt)
        parse_response(response_text)
      end

      private

      def build_provider
        provider_name = ENV['LLM_PROVIDER'] || 'openai'
        case provider_name.to_s.downcase
        when 'gemini'
          GeminiProvider.new
        when 'azure'
          AzureProvider.new
        else
          OpenaiProvider.new
        end
      end

      def fetch_issues
        RedmineReport::ScheduleReport::VisibilityScope.new(
          user: User.current,
          project: @project,
          include_subprojects: @filters.include_subprojects
        ).issues
      end

      def build_prompt(aggregation)
        bars = aggregation[:bars]
        total_tasks = bars.size
        completed_tasks = bars.count { |b| b[:progress_rate] == 100 }
        delayed_tasks = bars.count { |b| b[:is_delayed] }
        
        task_list = bars.map do |b|
          "- #{b[:category_name]}: #{b[:progress_rate]}% (Start: #{b[:start_date]}, End: #{b[:end_date]}) #{b[:is_delayed] ? '[DELAYED]' : ''}"
        end.join("\n")

        <<~PROMPT
          You are a project manager assistant. Generate a weekly status report based on the following project data:
          
          Project: #{@project.name}
          Total Tasks: #{total_tasks}
          Completed: #{completed_tasks}
          Delayed: #{delayed_tasks}
          
          Task Details:
          #{task_list}

          Please generate a report in JSON format with the following structure:
          {
            "progress": [ {"text": "...", "type": "normal" | "highlight"} ],
            "next_steps": [ {"text": "...", "type": "normal"} ],
            "risks": [ {"text": "...", "badge": "High" | "Medium" | "Low", "badgeColor": "..."} ]
          }

          - "progress": List 3-5 key achievements this week.
          - "next_steps": List 3-5 planned activities for next week.
          - "risks": List any risks or issues, especially regarding delayed tasks. Use "badge" to indicate severity.
          - Language: Japanese
        PROMPT
      end

      def parse_response(json_text)
        # Clean up markdown code blocks if present
        clean_json = json_text.gsub(/^```json\s*\n?/, '').gsub(/\n?```$/, '').strip
        JSON.parse(clean_json)
      rescue JSON::ParserError => e
        Rails.logger.error("[RedmineReport] Failed to parse LLM response: #{e.message}\nResponse: #{json_text}")
        {
          progress: [{ text: "レポートの生成に失敗しました（JSONパースエラー）。", type: "normal" }],
          next_steps: [],
          risks: []
        }
      end

      class Error < StandardError; end

      # --- Providers ---

      class BaseProvider
        def generate(prompt)
          raise NotImplementedError
        end

        protected

        def post_request(uri, headers, body)
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = true
          http.read_timeout = 60

          request = Net::HTTP::Post.new(uri)
          headers.each { |k, v| request[k] = v }
          request.body = body.to_json

          response = http.request(request)
          
          unless response.is_a?(Net::HTTPSuccess)
            Rails.logger.error("[RedmineReport] LLM API Error: #{response.code} - #{response.body}")
            raise Error, "LLM API request failed: #{response.code}"
          end

          JSON.parse(response.body)
        end
      end

      class OpenaiProvider < BaseProvider
        def generate(prompt)
          api_key = ENV['OPENAI_API_KEY']
          model = ENV['LLM_MODEL'] || 'gpt-3.5-turbo'
          
          raise Error, "OPENAI_API_KEY is not set" unless api_key

          uri = URI('https://api.openai.com/v1/chat/completions')
          headers = {
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer #{api_key}"
          }
          body = {
            model: model,
            messages: [
              { role: 'system', content: 'You are a helpful project management assistant. Output valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7
          }

          result = post_request(uri, headers, body)
          result.dig('choices', 0, 'message', 'content')
        end
      end

      class GeminiProvider < BaseProvider
        def generate(prompt)
          api_key = ENV['GEMINI_API_KEY']
          model = ENV['LLM_MODEL'] || 'gemini-1.5-flash'
          
          raise Error, "GEMINI_API_KEY is not set" unless api_key

          # Google AI SDK format
          uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{model}:generateContent?key=#{api_key}")
          headers = { 'Content-Type' => 'application/json' }
          body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: "application/json"
            }
          }

          result = post_request(uri, headers, body)
          result.dig('candidates', 0, 'content', 'parts', 0, 'text')
        end
      end

      class AzureProvider < BaseProvider
        def generate(prompt)
          api_key = ENV['AZURE_OPENAI_API_KEY']
          endpoint = ENV['AZURE_OPENAI_ENDPOINT'] # e.g. https://NAME.openai.azure.com/
          deployment = ENV['AZURE_OPENAI_DEPLOYMENT']
          api_version = ENV['AZURE_OPENAI_API_VERSION'] || '2024-02-01'
          
          raise Error, "Missing AZURE_OPENAI configuration" unless api_key && endpoint && deployment

          base_uri = endpoint.end_with?('/') ? endpoint : "#{endpoint}/"
          uri = URI("#{base_uri}openai/deployments/#{deployment}/chat/completions?api-version=#{api_version}")
          
          headers = {
            'Content-Type' => 'application/json',
            'api-key' => api_key
          }
          body = {
            messages: [
              { role: 'system', content: 'You are a helpful project management assistant. Output valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7
          }

          result = post_request(uri, headers, body)
          result.dig('choices', 0, 'message', 'content')
        end
      end
    end
  end
end
