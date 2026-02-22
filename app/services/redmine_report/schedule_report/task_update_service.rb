# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskUpdateService
      ALLOWED_FIELDS = %w[subject tracker_id status_id priority_id assigned_to_id done_ratio].freeze

      def initialize(root_project:, user:, issue_class: Issue)
        @root_project = root_project
        @user = user
        @issue_class = issue_class
      end

      def call(issue_id:, fields:)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id unless resolved_issue_id.is_a?(Integer)

        filtered = filter_fields(fields)
        return error('INVALID_INPUT', 'No valid fields provided', :unprocessable_entity) if filtered.empty?

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        return error('FORBIDDEN', 'Issue is not editable', :forbidden) unless issue.editable?(@user)

        filtered.each do |key, value|
          issue.public_send(:"#{key}=", value)
        end

        return error('VALIDATION_ERROR', issue.errors.full_messages.join(', '), :unprocessable_entity) unless issue.save

        { ok: true, issue: serialize_issue(issue) }
      end

      private

      def visible_scope
        @visible_scope ||= @issue_class.visible(@user).where(project_id: allowed_project_ids)
      end

      def allowed_project_ids
        @allowed_project_ids ||= [@root_project.id] + @root_project.descendants.pluck(:id)
      end

      def parse_issue_id(raw_issue_id)
        Integer(raw_issue_id)
      rescue ArgumentError, TypeError
        error('INVALID_INPUT', 'issue_id must be an integer', :unprocessable_entity)
      end

      def filter_fields(fields)
        return {} unless fields.is_a?(Hash)

        fields.each_with_object({}) do |(key, value), acc|
          next unless ALLOWED_FIELDS.include?(key.to_s)

          acc[key.to_s] = coerce_value(key.to_s, value)
        end
      end

      def coerce_value(key, value)
        case key
        when 'tracker_id', 'status_id', 'priority_id', 'done_ratio'
          value.present? ? Integer(value) : nil
        when 'assigned_to_id'
          value.present? ? Integer(value) : nil
        else
          value.presence
        end
      rescue ArgumentError, TypeError
        nil
      end

      def serialize_issue(issue)
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

      def serialize_comments(issue)
        return [] unless issue.respond_to?(:journals)

        issue.journals
             .select { |journal| !journal.respond_to?(:visible_notes?) || journal.visible_notes?(@user) }
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

      def error(code, message, status, retryable = nil)
        payload = { ok: false, code: code, message: message, status: status }
        payload[:retryable] = retryable unless retryable.nil?
        payload
      end
    end
  end
end
