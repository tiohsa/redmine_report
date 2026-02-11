# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class VisibilityScope
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
    end
  end
end
