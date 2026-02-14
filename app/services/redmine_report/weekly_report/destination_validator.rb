# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class DestinationValidator
      Result = Struct.new(:valid, :reason_code, :reason_message, :status, :issue, keyword_init: true)

      def initialize(project:, user:)
        @project = project
        @user = user
      end

      def call(destination_issue_id:)
        issue_id = Integer(destination_issue_id)
        issue = Issue.find_by(id: issue_id)
        return result(false, 'NOT_FOUND', 'Destination issue was not found', :not_found) unless issue
        return result(false, 'FORBIDDEN', 'Destination issue is not visible', :forbidden) unless issue.visible?(@user)
        return result(false, 'PROJECT_MISMATCH', 'Destination issue must belong to selected project', :unprocessable_entity) unless issue.project_id == @project.id
        return result(false, 'FORBIDDEN', 'Destination issue is not editable', :forbidden) unless issue.editable?(@user)

        Result.new(valid: true, reason_code: 'OK', reason_message: 'Validated', status: :ok, issue: issue)
      rescue ArgumentError, TypeError
        result(false, 'INVALID_INPUT', 'destination_issue_id must be an integer', :unprocessable_entity)
      end

      private

      def result(valid, code, message, status)
        Result.new(valid: valid, reason_code: code, reason_message: message, status: status)
      end
    end
  end
end
