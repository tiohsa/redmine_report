# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class VisibilityScope
      SelectionResult = Struct.new(
        :display_root_issue_ids,
        :total_candidates,
        :excluded_not_visible,
        :excluded_invalid_hierarchy,
        keyword_init: true
      )

      def initialize(user:, project:, include_subprojects: true)
        @user = user
        @project = project
        @include_subprojects = include_subprojects
      end

      def project_ids
        return [@project.id] unless @include_subprojects
        [@project.id] + @project.descendants.pluck(:id)
      end

      def issues
        Issue.visible(@user).where(project_id: project_ids)
      end

      def select_visible_top_level_parents(candidate_issues)
        resolved = root_issue_resolver.resolve_many(candidate_issues)
        root_ids = resolved[:root_ids]
        invalid_count = resolved[:invalid_count]

        unique_root_ids = root_ids.uniq
        visible_root_ids = Issue.visible(@user).where(id: unique_root_ids).pluck(:id)
        excluded_not_visible = unique_root_ids.size - visible_root_ids.size

        SelectionResult.new(
          display_root_issue_ids: visible_root_ids,
          total_candidates: candidate_issues.size,
          excluded_not_visible: excluded_not_visible,
          excluded_invalid_hierarchy: invalid_count
        )
      end

      private

      def root_issue_resolver
        @root_issue_resolver ||= RootIssueResolver.new(issue_class: Issue)
      end
    end
  end
end
