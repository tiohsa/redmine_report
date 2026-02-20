# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskDetailsService
      def initialize(root_project:, user:, issue_class: Issue)
        @root_project = root_project
        @user = user
        @issue_class = issue_class
      end

      def call(issue_id:)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id unless resolved_issue_id.is_a?(Integer)

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        issues = [issue] + child_scope(issue).to_a
        { ok: true, issues: issues.map { |item| serialize_issue(item) } }
      end

      private

      def visible_scope
        @visible_scope ||= @issue_class.visible(@user).where(project_id: allowed_project_ids)
      end

      def child_scope(issue)
        if issue.respond_to?(:lft) && issue.respond_to?(:rgt) && issue.lft && issue.rgt
          visible_scope.where("#{Issue.table_name}.lft > ? AND #{Issue.table_name}.rgt < ?", issue.lft, issue.rgt).order(:lft, :id)
        else
          visible_scope.where(parent_id: issue.id).order(:lft, :id)
        end
      end

      def allowed_project_ids
        @allowed_project_ids ||= [@root_project.id] + @root_project.descendants.pluck(:id)
      end

      def parse_issue_id(raw_issue_id)
        Integer(raw_issue_id)
      rescue ArgumentError, TypeError
        error('INVALID_INPUT', 'issue_id must be an integer', :unprocessable_entity)
      end

      def serialize_issue(issue)
        {
          issue_id: issue.id,
          subject: issue.subject.to_s,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601,
          issue_url: "/issues/#{issue.id}"
        }
      end

      def error(code, message, status, retryable = nil)
        payload = { ok: false, code: code, message: message, status: status }
        payload[:retryable] = retryable unless retryable.nil?
        payload
      end
    end
  end
end
