# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class GenerateService
      def initialize(project:, user:)
        @project = project
        @user = user
        @validator = RequestValidator.new
      end

      def prepare(payload)
        validated = @validator.validate_generate!(payload)
        ensure_project!(validated[:project_id])
        version = find_version!(validated[:version_id])

        context = ContextBuilder.new(
          project: @project,
          version: version,
          week_from: validated[:week_from],
          week_to: validated[:week_to],
          top_tickets_limit: validated[:top_tickets_limit]
        ).call

        llm = RedmineReport::Llm::WeeklyMarkdownGenerator.new
        prompt = llm.prepare(context: context, top_topics_limit: validated[:top_topics_limit])

        {
          header_preview: {
            project_id: @project.id,
            version_id: version.id,
            week: week_key(validated[:week_from]),
            generated_at: Time.current.iso8601
          },
          kpi: context[:kpi],
          prompt: prompt,
          tickets: context[:tickets]
        }
      end

      def call(payload)
        validated = @validator.validate_generate!(payload)
        ensure_project!(validated[:project_id])
        version = find_version!(validated[:version_id])
        @requested_prompt = payload[:prompt].to_s.strip.presence

        context = ContextBuilder.new(
          project: @project,
          version: version,
          week_from: validated[:week_from],
          week_to: validated[:week_to],
          top_tickets_limit: validated[:top_tickets_limit]
        ).call

        {
          header_preview: {
            project_id: @project.id,
            version_id: version.id,
            week: week_key(validated[:week_from]),
            generated_at: Time.current.iso8601
          },
          kpi: context[:kpi],
          markdown: build_markdown(context, validated[:top_topics_limit]),
          llm_response: @last_sections || {},
          tickets: context[:tickets]
        }
      end

      private

      def ensure_project!(project_id)
        raise RequestValidator::ValidationError, 'project_id mismatch' unless project_id == @project.id
      end

      def find_version!(version_id)
        version = @project.versions.find_by(id: version_id)
        raise RequestValidator::ValidationError, 'version_id not found in selected project' unless version

        version
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
