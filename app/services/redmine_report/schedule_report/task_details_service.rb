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
          scope = visible_scope.where("#{Issue.table_name}.lft > ? AND #{Issue.table_name}.rgt < ?", issue.lft, issue.rgt)
          if issue.respond_to?(:root_id) && issue.root_id
            scope = scope.where(root_id: issue.root_id)
          end
          scope.order(:lft, :id)
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
          parent_id: issue.parent_id,
          subject: issue.subject.to_s,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601,
          done_ratio: issue.done_ratio.to_i,
          issue_url: "/issues/#{issue.id}",
          status_name: issue.status&.name.to_s,
          status_is_closed: issue.status&.is_closed? || false,
          assignee_name: issue.assigned_to&.name.to_s,
          priority_name: issue.priority&.name.to_s,
          priority_id: issue.priority_id.to_i,
          description: issue.description.to_s,
          comments: serialize_comments(issue)
        }
      end

      def serialize_comments(issue)
        return [] unless issue.respond_to?(:journals)

        issue.journals
             .select { |journal| !journal.respond_to?(:visible_notes?) || journal.visible_notes?(@user) }
             .select { |journal| journal.respond_to?(:notes) && journal.notes.to_s.strip != '' }
             .sort_by { |journal| journal.respond_to?(:created_on) ? (journal.created_on || Time.at(0)) : Time.at(0) }
             .last(5)
             .reverse
             .map do |journal|
          {
            id: journal.id,
            author_name: (journal.respond_to?(:user) ? journal.user&.name : nil).to_s,
            notes: journal.notes.to_s,
            created_on: journal.respond_to?(:created_on) ? journal.created_on&.iso8601 : nil
          }
        end
      rescue StandardError
        []
      end

      def error(code, message, status, retryable = nil)
        payload = { ok: false, code: code, message: message, status: status }
        payload[:retryable] = retryable unless retryable.nil?
        payload
      end
    end
  end
end
