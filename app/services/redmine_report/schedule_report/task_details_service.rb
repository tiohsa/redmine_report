# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskDetailsService < BaseIssueService
      def call(issue_id:)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id if resolved_issue_id.is_a?(ServiceResult)

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        issues = [issue] + child_scope(issue).to_a
        options_builder = IssueEditOptionsBuilder.new(user: user)
        success(
          issues: issues.map { |item| serialize_issue(item) },
          issue_edit_options: issues.index_with { |item| options_builder.call(item) }.transform_keys(&:id)
        )
      end

      private

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
    end
  end
end
