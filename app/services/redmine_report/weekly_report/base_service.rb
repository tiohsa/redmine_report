# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class BaseService
      def initialize(project:, user:)
        @project = project
        @user = user
        @validator = RequestValidator.new
      end

      private

      attr_reader :project, :user, :validator

      def ensure_project!(project_id)
        raise RequestValidator::ValidationError, 'project_id mismatch' unless project_id == project.id
      end

      def find_version!(version_id)
        version = project.versions.find_by(id: version_id)
        raise RequestValidator::ValidationError, 'version_id not found in selected project' unless version

        version
      end

      def ensure_project_and_find_version!(project_id:, version_id:)
        ensure_project!(project_id)
        find_version!(version_id)
      end
    end
  end
end
