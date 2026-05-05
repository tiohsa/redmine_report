# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskMastersService
      def initialize(project:, user:)
        @project = project
        @user = user
      end

      def call
        ServiceResult.success(
          trackers: safe_serialize { serialize_trackers },
          statuses: safe_serialize { serialize_statuses },
          priorities: safe_serialize { serialize_priorities },
          members: safe_serialize { serialize_members }
        )
      end

      private

      attr_reader :project

      def serialize_trackers
        project.trackers.map { |t| { id: t.id, name: t.name } }
      end

      def serialize_statuses
        IssueStatus.sorted.map { |s| { id: s.id, name: s.name, is_closed: s.is_closed? } }
      end

      def serialize_priorities
        IssuePriority.active.map { |p| { id: p.id, name: p.name } }
      end

      def serialize_members
        members = project.members
                          .includes(:user)
                          .select { |m| m.user.present? && m.user.active? }
                          .map { |m| { id: m.user.id, name: m.user.name } }
        [{ id: nil, name: '' }] + members
      end

      def safe_serialize
        yield
      rescue StandardError
        []
      end
    end
  end
end
