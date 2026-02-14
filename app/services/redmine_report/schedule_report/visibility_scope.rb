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
        root_ids = []
        invalid_count = 0

        candidate_issues.each do |issue|
          root_id = resolve_root_issue_id(issue)
          if root_id
            root_ids << root_id
          else
            invalid_count += 1
          end
        end

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

      def resolve_root_issue_id(issue)
        return issue.root_id if issue.respond_to?(:root_id) && issue.root_id.present?

        visited = {}
        node = issue
        depth = 0

        while node
          node_id = node.id
          return nil if node_id.nil? || visited[node_id]
          visited[node_id] = true

          parent_id = node.respond_to?(:parent_id) ? node.parent_id : nil
          return node_id unless parent_id

          node = Issue.find_by(id: parent_id)
          depth += 1
          return nil if depth > 100
        end

        nil
      end
    end
  end
end
