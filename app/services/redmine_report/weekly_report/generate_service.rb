# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class GenerateService < BaseService
      def initialize(project:, user:)
        super
      end

      def prepare(payload)
        validated, version, context = resolve_context(payload)
        prompt = weekly_llm.prepare(context: context, top_topics_limit: validated[:top_topics_limit])
        build_response(validated: validated, version: version, context: context, prompt: prompt)
      end

      def call(payload)
        validated, version, context = resolve_context(payload)
        @requested_prompt = payload[:prompt].to_s.strip.presence
        markdown = build_markdown(context, validated[:top_topics_limit])
        build_response(
          validated: validated,
          version: version,
          context: context,
          markdown: markdown,
          llm_response: @last_sections || {}
        )
      end

      private

      def resolve_context(payload)
        validated = validator.validate_generate!(payload)
        version = ensure_project_and_find_version!(
          project_id: validated[:project_id],
          version_id: validated[:version_id]
        )
        context = ContextBuilder.new(
          project: project,
          version: version,
          week_from: validated[:week_from],
          week_to: validated[:week_to],
          top_tickets_limit: validated[:top_tickets_limit]
        ).call

        [validated, version, context]
      end

      def build_response(validated:, version:, context:, prompt: nil, markdown: nil, llm_response: nil)
        response = {
          header_preview: build_header_preview(validated, version),
          kpi: context[:kpi],
          tickets: context[:tickets]
        }
        response[:prompt] = prompt if prompt
        response[:markdown] = markdown if markdown
        response[:llm_response] = llm_response if llm_response
        response
      end

      def build_header_preview(validated, version)
        {
          project_id: project.id,
          version_id: version.id,
          week: week_key(validated[:week_from]),
          generated_at: Time.current.iso8601
        }
      end

      def weekly_llm
        @weekly_llm ||= RedmineReport::Llm::WeeklyMarkdownGenerator.new
      end

      def week_key(date)
        date.strftime('%G-W%V')
      end

      def build_markdown(context, limit)
        week = week_key(context[:week][:from])
        header = "[Weekly][#{week}] project_id=#{context[:project][:id]} version_id=#{context[:version][:id]} generated_at=#{Time.current.strftime('%Y-%m-%dT%H:%M:%S%:z')}"
        llm_result = generate_with_llm(context, limit, @requested_prompt)
        @last_sections = llm_result[:sections]
        llm_markdown = llm_result[:markdown]
        return llm_markdown if llm_markdown.start_with?('[Weekly][')

        "#{header}\n#{llm_markdown}".strip
      rescue StandardError => e
        Rails.logger.warn("[schedule_report] weekly LLM fallback: #{e.class}: #{e.message}")
        markdown, sections = fallback_markdown(context, limit)
        @last_sections = sections
        markdown
      end

      def fallback_markdown(context, limit)
        week = week_key(context[:week][:from])
        generated_at = Time.current.strftime('%Y-%m-%dT%H:%M:%S%:z')
        tickets = context[:tickets]
        achievements = tickets.select { |t| t[:layer] == 'A_WEEKLY_CHANGE' }.first(limit)
        risks = tickets.select do |t|
          t[:layer] == 'B_CONTINUOUS_RISK' || (t[:due_date].present? && t[:due_date] < Date.current)
        end.first(limit)

        sections = {
          major_achievements: achievements.map { |t| "##{t[:id]} #{t[:title]}" },
          next_actions: achievements.map { |t| "##{t[:id]} #{next_action(t)}" },
          risks: risks.map { |t| "##{t[:id]} #{risk_line(t)}" },
          decisions: achievements.map { |t| "##{t[:id]} 継続対応（根拠: #{evidence_excerpt(t)})" }
        }

        markdown = <<~MD
          [Weekly][#{week}] project_id=#{context[:project][:id]} version_id=#{context[:version][:id]} generated_at=#{generated_at}
          - 完了: #{context[:kpi][:completed]}
          - WIP: #{context[:kpi][:wip]}
          - 遅延: #{context[:kpi][:overdue]}
          - 高優先度未完了: #{context[:kpi][:high_priority_open]}

          ## 今週の主要実績
          #{list_or_placeholder(achievements) { |t| "- ##{t[:id]} #{t[:title]}" }}

          ## 来週の予定・アクション
          #{list_or_placeholder(achievements) { |t| "- ##{t[:id]} #{next_action(t)}" }}

          ## 課題・リスク
          #{list_or_placeholder(risks) { |t| "- ##{t[:id]} #{risk_line(t)}" }}

          ## 決定事項
          #{list_or_placeholder(achievements) { |t| "- ##{t[:id]} 継続対応（根拠: #{evidence_excerpt(t)})" }}
        MD

        [markdown, sections]
      end

      def generate_with_llm(context, limit, prompt)
        RedmineReport::Llm::WeeklyMarkdownGenerator.new.call(
          context: context,
          top_topics_limit: limit,
          prompt: prompt
        )
      end

      def list_or_placeholder(items)
        return '- 該当なし' if items.empty?

        items.map { |item| yield(item) }.join("\n")
      end

      def next_action(ticket)
        first_comment = ticket[:comments_this_week].first
        first_comment ? first_comment[:excerpt] : '継続対応を実施'
      end

      def risk_line(ticket)
        "#{ticket[:title]} (継続リスク)"
      end

      def evidence_excerpt(ticket)
        comment = ticket[:comments_this_week].first
        return 'コメントなし' unless comment

        comment[:excerpt].to_s
      end

    end
  end
end
