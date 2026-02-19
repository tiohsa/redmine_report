# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class HierarchyLevelResolver
      def call(project)
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
