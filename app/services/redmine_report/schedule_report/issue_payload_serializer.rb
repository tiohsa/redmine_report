# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class IssuePayloadSerializer
      def initialize(user:)
        @user = user
      end

      def call(issue)
        {
          issue_id: issue.id,
          parent_id: issue.parent_id,
          subject: issue.subject.to_s,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601,
          done_ratio: issue.done_ratio.to_i,
          issue_url: "/issues/#{issue.id}",
          tracker_name: issue.tracker&.name.to_s,
          tracker_id: issue.tracker_id,
          status_name: issue.status&.name.to_s,
          status_id: issue.status_id,
          status_is_closed: issue.status&.is_closed? || false,
          assignee_name: issue.assigned_to&.name.to_s,
          assignee_id: issue.assigned_to_id,
          priority_name: issue.priority&.name.to_s,
          priority_id: issue.priority_id.to_i,
          description: issue.description.to_s,
          comments: serialize_comments(issue)
        }
      end

      private

      attr_reader :user

      def serialize_comments(issue)
        return [] unless issue.respond_to?(:journals)

        issue.journals
             .select { |journal| !journal.respond_to?(:visible_notes?) || journal.visible_notes?(user) }
             .select { |journal| journal.respond_to?(:notes) && journal.notes.to_s.strip != '' }
             .sort_by { |journal| journal.respond_to?(:created_on) ? (journal.created_on || Time.at(0)) : Time.at(0) }
             .last(5)
             .reverse
             .map do |journal|
          {
            id: journal.id,
            author_name: (journal.respond_to?(:user) ? journal.user&.name : nil).to_s,
            notes: journal.notes.to_s,
            created_on: journal.respond_to?(:created_on) ? journal.created_on&.iso8601 : nil
          }
        end
      rescue StandardError
        []
      end
    end
  end
end
