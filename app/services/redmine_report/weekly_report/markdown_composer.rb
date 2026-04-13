# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class MarkdownComposer
      def initialize(context:, top_topics_limit:, prompt: nil, llm: RedmineReport::Llm::WeeklyMarkdownGenerator.new, logger: Rails.logger)
        @context = context
        @top_topics_limit = top_topics_limit
        @prompt = prompt
        @llm = llm
        @logger = logger
      end

      def call
        llm_result = generate_with_llm || { markdown: '', sections: {} }
        return normalize_llm_result(llm_result) if header_preserved?(markdown_from(llm_result))

        {
          markdown: attach_header(markdown_from(llm_result)),
          sections: sections_from(llm_result)
        }
      rescue StandardError => e
        @logger.warn("[schedule_report] weekly LLM fallback: #{e.class}: #{e.message}")
        fallback_result
      end

      private

      def generate_with_llm
        @llm.call(
          context: @context,
          top_topics_limit: @top_topics_limit,
          prompt: @prompt
        )
      end

      def normalize_llm_result(llm_result)
        {
          markdown: markdown_from(llm_result),
          sections: sections_from(llm_result)
        }
      end

      def header_preserved?(markdown)
        markdown.to_s.start_with?('[Weekly][')
      end

      def attach_header(markdown)
        "#{header_line}\n#{markdown}".strip
      end

      def header_line
        "[Weekly][#{week_key}] project_id=#{@context[:project][:id]} version_id=#{@context[:version][:id]} generated_at=#{generated_at}"
      end

      def generated_at
        Time.current.strftime('%Y-%m-%dT%H:%M:%S%:z')
      end

      def week_key
        @context[:week][:from].strftime('%G-W%V')
      end

      def fallback_result
        tickets = @context[:tickets]
        achievements = tickets.select { |ticket| ticket[:layer] == 'A_WEEKLY_CHANGE' }.first(@top_topics_limit)
        risks = tickets.select do |ticket|
          ticket[:layer] == 'B_CONTINUOUS_RISK' || (ticket[:due_date].present? && ticket[:due_date] < Date.current)
        end.first(@top_topics_limit)

        sections = {
          major_achievements: achievements.map { |ticket| "##{ticket[:id]} #{ticket[:title]}" },
          next_actions: achievements.map { |ticket| "##{ticket[:id]} #{next_action(ticket)}" },
          risks: risks.map { |ticket| "##{ticket[:id]} #{risk_line(ticket)}" },
          decisions: achievements.map { |ticket| "##{ticket[:id]} 継続対応（根拠: #{evidence_excerpt(ticket)})" }
        }

        markdown = <<~MD
          #{header_line}
          - 完了: #{@context[:kpi][:completed]}
          - WIP: #{@context[:kpi][:wip]}
          - 遅延: #{@context[:kpi][:overdue]}
          - 高優先度未完了: #{@context[:kpi][:high_priority_open]}

          ## 今週の主要実績
          #{list_or_placeholder(achievements) { |ticket| "- ##{ticket[:id]} #{ticket[:title]}" }}

          ## 来週の予定・アクション
          #{list_or_placeholder(achievements) { |ticket| "- ##{ticket[:id]} #{next_action(ticket)}" }}

          ## 課題・リスク
          #{list_or_placeholder(risks) { |ticket| "- ##{ticket[:id]} #{risk_line(ticket)}" }}

          ## 決定事項
          #{list_or_placeholder(achievements) { |ticket| "- ##{ticket[:id]} 継続対応（根拠: #{evidence_excerpt(ticket)})" }}
        MD

        {
          markdown: markdown.strip,
          sections: sections
        }
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

      def markdown_from(result)
        result[:markdown].presence || result['markdown'].to_s
      end

      def sections_from(result)
        result[:sections] || result['sections'] || {}
      end
    end
  end
end
