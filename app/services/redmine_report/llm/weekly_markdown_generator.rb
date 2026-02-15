# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

module RedmineReport
  module Llm
    class WeeklyMarkdownGenerator
      class Error < StandardError; end
      class InvalidLlmPayload < Error; end

      RETRYABLE_HTTP_CODES = [408, 429, 500, 502, 503, 504].freeze
      MAX_RETRIES = 2
      READ_TIMEOUT_SECONDS = 60

      def prepare(context:, top_topics_limit: 10)
        build_prompt(context: context, top_topics_limit: top_topics_limit)
      end

      def call(context:, top_topics_limit: 10, prompt: nil)
        prompt ||= build_prompt(context: context, top_topics_limit: top_topics_limit)
        provider = (ENV['LLM_PROVIDER'] || 'openai').to_s.downcase

        text = with_retries do
          case provider
          when 'gemini'
            call_gemini(prompt)
          when 'azure'
            call_azure(prompt)
          else
            call_openai(prompt)
          end
        end

        cleaned_markdown, sections = parse_sections(text)
        {
          sections: sections,
          markdown: cleaned_markdown
        }
      end

      private

      def build_prompt(context:, top_topics_limit:)
        ticket_payload = extract_ticket_payload(context)

        <<~PROMPT
          # Role
          あなたはRedmineのデータを解析し、プロジェクトの状況をビジネス視点で要約する「戦略的プロジェクト管理アシスタント」です。

          # Task
          入力されたJSONデータを分析し、以下のフォーマットで週次報告書を作成してください。
          単なるデータの転記ではなく、チケットの進捗（progress_delta）、ステータス変更、およびコメント内容から「今何が起きているか」を業務文脈で推論して記述してください。

          # Output Format

          ## 今週の主要実績
          - 進捗があったチケット（progress_delta > 0）や完了したものを中心に、業務的な成果として要約する。
          - 形式：[具体的な成果内容]（根拠: #チケットID）

          ## 来週の予定・アクション
          - 未完了チケット（WIP）や期日が近いチケットのネクストステップを記述する。
          - 形式：[具体的なタスク/MTG予定]（根拠: #チケットID）

          ## 課題・リスク・決定事項
          チケットの優先度、B層（継続リスク）、およびコメント内のネガティブ/ポジティブな反応から抽出してください。

          - **【リスク】**：将来的な懸念事項。影響範囲と対策案を併記。
            - 右側に「高/中/低」の優先度を付帯。
          - **【課題】**：現在発生している問題点。
            - 右側に「高/中/低」の優先度を付帯。
          - **【決定】**：合意が取れた事項や確定した方針。
            - 右側に「済」のステータスを付帯。

          # Constraints
          - JSONそのものや、余計な説明文（「レポートを作成しました」等）は出力しない。
          - 自信度を5段階評価（★）で末尾に記載すること。
          - 日本語で回答すること。
          - 重要トピックは最大#{top_topics_limit}件に収めること。

          # Input Data (JSON)
          #{JSON.pretty_generate(ticket_payload)}
        PROMPT
      end

      def extract_ticket_payload(context)
        return context if context.is_a?(Array)

        return context[:tickets] if context.is_a?(Hash) && context.key?(:tickets)

        []
      end

      def with_retries
        attempts = 0

        begin
          attempts += 1
          yield
        rescue Error, Net::ReadTimeout, Net::OpenTimeout, Timeout::Error, SocketError, Errno::ECONNRESET => e
          retryable = retryable_error?(e)
          if retryable && attempts <= MAX_RETRIES + 1
            Rails.logger.warn("[RedmineReport] weekly LLM retry=#{attempts} reason=#{e.class}")
            sleep(0.2 * attempts)
            retry
          end

          raise Error, "Weekly LLM generation failed: #{e.message}"
        end
      end

      def retryable_error?(error)
        return true unless error.is_a?(Error)

        code = error.message[/HTTP (\d{3})/, 1]
        return true if code.nil?

        RETRYABLE_HTTP_CODES.include?(code.to_i)
      end

      def call_openai(prompt)
        api_key = ENV['OPENAI_API_KEY']
        raise Error, 'OPENAI_API_KEY is not set' if api_key.to_s.empty?

        model = ENV['LLM_MODEL'] || 'gpt-4o-mini'
        uri = URI('https://api.openai.com/v1/chat/completions')
        headers = {
          'Content-Type' => 'application/json',
          'Authorization' => "Bearer #{api_key}"
        }
        body = {
          model: model,
          messages: [
            { role: 'system', content: 'You are a Japanese project reporting assistant. Output markdown only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }

        json = post_json(uri, headers, body)
        json.dig('choices', 0, 'message', 'content').to_s
      end

      def call_gemini(prompt)
        api_key = ENV['GEMINI_API_KEY']
        raise Error, 'GEMINI_API_KEY is not set' if api_key.to_s.empty?

        model = ENV['LLM_MODEL'] || 'gemini-1.5-flash'
        uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{model}:generateContent?key=#{api_key}")
        headers = { 'Content-Type' => 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2
          }
        }

        json = post_json(uri, headers, body)
        json.dig('candidates', 0, 'content', 'parts', 0, 'text').to_s
      end

      def call_azure(prompt)
        api_key = ENV['AZURE_OPENAI_API_KEY']
        endpoint = ENV['AZURE_OPENAI_ENDPOINT']
        deployment = ENV['AZURE_OPENAI_DEPLOYMENT']
        api_version = ENV['AZURE_OPENAI_API_VERSION'] || '2024-02-01'
        raise Error, 'Missing AZURE_OPENAI configuration' unless api_key && endpoint && deployment

        base_uri = endpoint.end_with?('/') ? endpoint : "#{endpoint}/"
        uri = URI("#{base_uri}openai/deployments/#{deployment}/chat/completions?api-version=#{api_version}")
        headers = {
          'Content-Type' => 'application/json',
          'api-key' => api_key
        }
        body = {
          messages: [
            { role: 'system', content: 'You are a Japanese project reporting assistant. Output markdown only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2
        }

        json = post_json(uri, headers, body)
        json.dig('choices', 0, 'message', 'content').to_s
      end

      def post_json(uri, headers, body)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.read_timeout = READ_TIMEOUT_SECONDS

        request = Net::HTTP::Post.new(uri)
        headers.each { |k, v| request[k] = v }
        request.body = body.to_json

        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          Rails.logger.error("[RedmineReport] weekly LLM API error: HTTP #{response.code}")
          raise Error, "HTTP #{response.code}"
        end

        JSON.parse(response.body)
      rescue JSON::ParserError => e
        raise Error, "Invalid JSON response: #{e.message}"
      end

      def parse_sections(text)
        cleaned = text.to_s.gsub(/^```markdown\s*/i, '').gsub(/^```\s*/i, '').gsub(/```\s*$/, '').strip
        raise Error, 'LLM returned empty response' if cleaned.empty?
        sections = {
          major_achievements: extract_section_items(cleaned, /##\s*今週の主要実績/),
          next_actions: extract_section_items(cleaned, /##\s*来週の予定・アクション/),
          risks: extract_section_items(cleaned, /##\s*課題・リスク・決定事項|##\s*課題・リスク/),
          decisions: extract_decisions(cleaned)
        }
        [cleaned, sections]
      end

      def extract_section_items(markdown, heading_pattern)
        lines = markdown.lines.map(&:rstrip)
        start = lines.index { |line| line.match?(heading_pattern) }
        return [] unless start

        collected = []
        lines[(start + 1)..-1].each do |line|
          break if line.start_with?('## ')
          next unless line.strip.start_with?('-')

          item = line.strip.sub(/\A-\s*/, '')
          collected << item unless item.empty?
        end
        collected
      end

      def extract_decisions(markdown)
        markdown.lines.filter_map do |line|
          stripped = line.strip
          next unless stripped.start_with?('-')
          next unless stripped.include?('【決定】')

          stripped.sub(/\A-\s*/, '')
        end
      end
    end
  end
end
