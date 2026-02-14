# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class ProjectOptionsBuilder
      def initialize(user:, root_project:)
        @user = user
        @root_project = root_project
      end

      def call
        visible_projects.map do |project|
          {
            project_id: project.id,
            identifier: project.identifier,
            name: project.name,
            parent_project_id: project.parent_id,
            level: hierarchy_level(project),
            selectable: true
          }
        end
      end

      private

      def visible_projects
        ids = [@root_project.id] + @root_project.descendants.pluck(:id)
        Project.visible(@user).where(id: ids).sort_by(&:lft)
      end

      def hierarchy_level(project)
        level = 0
        node = project
        while node.parent_id
          level += 1
          node = node.parent
          break unless node
        end
        level
      end
    end
  end
end
