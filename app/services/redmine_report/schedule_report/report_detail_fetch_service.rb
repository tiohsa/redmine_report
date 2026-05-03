# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    # Fetches the latest Weekly report detail from the bound issue's journals.
    #
    # It reads journals from the destination_issue_id, parses Weekly comments,
    # filters by matching project_id/version_id from the supplied targets,
    # and selects the latest record.
    class ReportDetailFetchService
      def initialize(user:)
        @user = user
        @parser = RedmineReport::WeeklyReport::StoredCommentParser.new
      end

      def call(destination_issue_id:, targets:)
        return not_saved_response(0) if destination_issue_id.blank?

        issue_id = Integer(destination_issue_id)
        issue = Issue.find_by(id: issue_id)
        return error_response('NOT_FOUND', 'Destination issue was not found') unless issue
        return error_response('FORBIDDEN', 'Destination issue is not visible') unless issue.visible?(@user)

        target_keys = build_target_keys(targets)
        return not_saved_response(issue_id) if target_keys.empty?

        latest = find_latest_matching(issue, target_keys)
        return not_saved_response(issue_id) unless latest

        {
          status: 'AVAILABLE',
          saved_at: latest[:generated_at]&.iso8601,
          highlights_this_week: latest[:highlights_this_week],
          next_week_actions: latest[:next_week_actions],
          risks: latest[:risks],
          decisions: latest[:decisions],
          destination_issue_id: issue_id
        }
      rescue ArgumentError, TypeError
        error_response('INVALID_INPUT', 'destination_issue_id must be an integer')
      end

      private

      def build_target_keys(targets)
        return [] unless targets.is_a?(Array)

        targets.filter_map do |target|
          pid = target[:project_id] || target['project_id']
          vid = target[:version_id] || target['version_id']
          next nil unless pid && vid

          "#{pid.to_i}:#{vid.to_i}"
        end.uniq
      end

      def find_latest_matching(issue, target_keys)
        candidates = []

        issue.journals.each do |journal|
          parsed = @parser.parse_rows(journal.notes)
          next unless parsed

          key = "#{parsed[:project_id]}:#{parsed[:version_id]}"
          next unless target_keys.include?(key)

          candidates << parsed.merge(journal_created_on: journal.created_on)
        end

        return nil if candidates.empty?

        # Sort: generated_at DESC, revision DESC, journal_created_on DESC
        candidates.sort_by do |c|
          [
            c[:generated_at] || Time.at(0),
            c[:revision] || 0,
            c[:journal_created_on] || Time.at(0)
          ]
        end.last
      end

      def not_saved_response(issue_id)
        {
          status: 'NOT_SAVED',
          saved_at: nil,
          highlights_this_week: ['該当なし'],
          next_week_actions: ['該当なし'],
          risks: ['該当なし'],
          decisions: ['該当なし'],
          destination_issue_id: issue_id
        }
      end

      def error_response(code, message)
        {
          status: 'ERROR',
          error_code: code,
          message: message,
          saved_at: nil,
          highlights_this_week: [],
          next_week_actions: [],
          risks: [],
          decisions: [],
          destination_issue_id: 0
        }
      end
    end
  end
end
