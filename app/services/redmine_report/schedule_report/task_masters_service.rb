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
          trackers: serialize_trackers,
          statuses: serialize_statuses,
          priorities: serialize_priorities,
          members: serialize_members
        )
      rescue StandardError => e
        ServiceResult.error(code: 'UPSTREAM_FAILURE', message: e.message, status: :service_unavailable)
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
                          .includes(user: [])
                          .select { |m| m.user.present? && m.user.active? }
                          .map { |m| { id: m.user.id, name: m.user.name } }
        [{ id: nil, name: '' }] + members
      end
    end
  end
end
