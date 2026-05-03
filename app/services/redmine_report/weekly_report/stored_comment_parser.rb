# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    # Parses Weekly saved-comment journal notes into structured sections.
    #
    # Supports headers:
    #   [Weekly][YYYY-Www] project_id=<id> version_id=<id> revision=<n> generated_at=<iso>
    #   [Weekly][YYYY-Www] project_id=<id> version_id=<id> generated_at=<iso>
    #
    # Sections:
    #   ## 今週の主要実績
    #   ## 来週の予定・アクション
    #   ## 課題・リスク
    #   ## 決定事項
    #   ## 課題・リスク・決定事項  (backward-compatible combined section)
    class StoredCommentParser
      WEEKLY_HEADER_PATTERN = /\[Weekly\]\[(?<week>[^\]]+)\]\s+project_id=(?<project_id>\d+)\s+version_id=(?<version_id>\d+)(?:\s+revision=(?<revision>\d+))?(?:\s+generated_at=(?<generated_at>\S+))?/

      SECTION_PATTERNS = {
        highlights_this_week: /^##\s*(?:📈\s*)?今週の主要実績\s*$/,
        next_week_actions:    /^##\s*(?:🚀\s*)?来週の予定・アクション\s*$/,
        risks_decisions:      /^##\s*(?:⚠️\s*)?課題・リスク・決定事項\s*$/,
        risks:                /^##\s*課題・リスク\s*$/,
        decisions:            /^##\s*決定事項\s*$/
      }.freeze

      ParsedComment = Struct.new(
        :week,
        :project_id,
        :version_id,
        :revision,
        :generated_at,
        :highlights_this_week,
        :next_week_actions,
        :risks,
        :decisions,
        keyword_init: true
      )

      # Parses a single journal note body.
      # Returns a ParsedComment or nil if it is not a Weekly comment.
      def parse(note)
        body = note.to_s
        match = body.match(WEEKLY_HEADER_PATTERN)
        return nil unless match

        sections = extract_sections(body)

        ParsedComment.new(
          week: match[:week],
          project_id: match[:project_id].to_i,
          version_id: match[:version_id].to_i,
          revision: match[:revision] ? match[:revision].to_i : nil,
          generated_at: parse_time(match[:generated_at]),
          highlights_this_week: sections[:highlights_this_week],
          next_week_actions: sections[:next_week_actions],
          risks: sections[:risks],
          decisions: sections[:decisions]
        )
      end

      # Returns section content as arrays of row strings (list items).
      # Normalizes empty sections to ["該当なし"].
      def parse_rows(note)
        parsed = parse(note)
        return nil unless parsed

        {
          week: parsed.week,
          project_id: parsed.project_id,
          version_id: parsed.version_id,
          revision: parsed.revision,
          generated_at: parsed.generated_at,
          highlights_this_week: rows_from(parsed.highlights_this_week),
          next_week_actions: rows_from(parsed.next_week_actions),
          risks: rows_from(parsed.risks),
          decisions: rows_from(parsed.decisions)
        }
      end

      private

      def extract_sections(markdown)
        lines = markdown.to_s.lines.map(&:rstrip)
        raw = {
          highlights_this_week: [],
          next_week_actions: [],
          risks_decisions: [],
          risks: [],
          decisions: []
        }

        current = nil
        lines.each do |line|
          section_key = detect_section(line)
          if section_key
            current = section_key
            next
          end

          next unless current
          next if line.strip.empty?
          next if line.start_with?('[Weekly][')
          next if line.start_with?('## ')

          raw[current] << line
        end

        # Merge combined section into separate risks/decisions if split sections are empty
        normalize_risk_decision_sections(raw)
      end

      def detect_section(line)
        SECTION_PATTERNS.each do |key, pattern|
          return key if line.match?(pattern)
        end
        nil
      end

      def normalize_risk_decision_sections(raw)
        risks = raw[:risks]
        decisions = raw[:decisions]
        combined = raw[:risks_decisions]

        if risks.empty? && decisions.empty? && combined.any?
          # Combined section: split evenly or assign all to risks
          risks = combined
          decisions = []
        end

        {
          highlights_this_week: raw[:highlights_this_week].join("\n").strip.presence,
          next_week_actions: raw[:next_week_actions].join("\n").strip.presence,
          risks: risks.join("\n").strip.presence,
          decisions: decisions.join("\n").strip.presence
        }
      end

      def rows_from(text)
        return ['該当なし'] if text.blank?

        text.lines.map(&:strip).reject(&:blank?).map do |line|
          # Strip leading "- " or "* " prefix
          line.sub(/\A[-*]\s*/, '')
        end.reject(&:blank?).presence || ['該当なし']
      end

      def parse_time(value)
        return nil if value.blank?

        Time.iso8601(value)
      rescue ArgumentError
        nil
      end
    end
  end
end
