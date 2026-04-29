# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class IssueEditOptionsBuilder
      EDITABLE_FIELDS = %i[tracker_id priority_id status_id assigned_to_id].freeze

      def initialize(user:)
        @user = user
      end

      def call(issue)
        editable = issue.editable?(@user)
        {
          editable: editable,
          fields: EDITABLE_FIELDS.index_with { editable },
          trackers: serialize_trackers(issue),
          statuses: serialize_statuses(issue),
          priorities: serialize_priorities(issue),
          members: serialize_members(issue)
        }
      end

      private

      def serialize_trackers(issue)
        ([issue.tracker] + Array(issue.project&.trackers)).compact.uniq.map { |tracker| { id: tracker.id, name: tracker.name } }
      end

      def serialize_statuses(issue)
        ([issue.status] + Array(issue.new_statuses_allowed_to(@user))).compact.uniq.map do |status|
          { id: status.id, name: status.name, is_closed: status.is_closed? }
        end
      end

      def serialize_priorities(issue)
        ([issue.priority] + IssuePriority.active.to_a).compact.uniq.map { |priority| { id: priority.id, name: priority.name } }
      end

      def serialize_members(issue)
        users = issue.respond_to?(:assignable_users) ? issue.assignable_users : []
        [{ id: nil, name: '' }] + Array(users).compact.uniq.map { |member| { id: member.id, name: member.name } }
      end
    end
  end
end
