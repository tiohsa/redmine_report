# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class RevisionResolver
      WEEKLY_HEADER_PATTERN = /\[Weekly\]\[(?<week>[^\]]+)\]\s+project_id=(?<project_id>\d+)\s+version_id=(?<version_id>\d+)\s+revision=(?<revision>\d+)/

      def next_revision(issue:, project_id:, version_id:, week:)
        journals = issue.journals.includes(:details)
        count = journals.count do |journal|
          note = journal.notes.to_s
          match = note.match(WEEKLY_HEADER_PATTERN)
          next false unless match

          match[:week] == week &&
            match[:project_id].to_i == project_id.to_i &&
            match[:version_id].to_i == version_id.to_i
        end
        count + 1
      end
    end
  end
end
