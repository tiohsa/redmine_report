# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class BaseIssueService
      def initialize(root_project:, user:, issue_class: Issue)
        @root_project = root_project
        @user = user
        @issue_class = issue_class
      end

      private

      attr_reader :root_project, :user, :issue_class

      def visible_scope
        @visible_scope ||= issue_class.visible(user).where(project_id: allowed_project_ids)
      end

      def allowed_project_ids
        @allowed_project_ids ||= [root_project.id] + root_project.descendants.pluck(:id)
      end

      def parse_issue_id(raw_issue_id)
        Integer(raw_issue_id)
      rescue ArgumentError, TypeError
        invalid_input('issue_id must be an integer')
      end

      def issue_serializer
        @issue_serializer ||= IssuePayloadSerializer.new(user: user)
      end

      def serialize_issue(issue)
        issue_serializer.call(issue)
      end

      def success(payload = {})
        ServiceResult.success(payload)
      end

      def error(code, message, status, retryable = nil, payload: {})
        ServiceResult.error(code: code, message: message, status: status, retryable: retryable, payload: payload)
      end

      def invalid_input(message)
        error('INVALID_INPUT', message, :unprocessable_entity)
      end
    end
  end
end
