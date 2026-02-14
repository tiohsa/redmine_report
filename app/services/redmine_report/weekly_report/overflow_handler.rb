# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class OverflowHandler
      MAX_NOTE_LENGTH = 20_000

      def call(markdown:, header:)
        body = "#{header}\n#{markdown}".strip
        return { mode: 'NOTE_ONLY', note: body, part: nil, summary: markdown } if body.length <= MAX_NOTE_LENGTH

        summary = markdown.lines.first(20).join.strip
        summary = markdown[0, 2000] if summary.empty?
        {
          mode: 'NOTE_WITH_ATTACHMENT',
          note: "#{header}\n#{summary}",
          part: nil,
          summary: summary
        }
      end
    end
  end
end
