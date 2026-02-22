# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskDateUpdateService
      MISSING = Object.new

      def initialize(root_project:, user:, issue_class: Issue)
        @root_project = root_project
        @user = user
        @issue_class = issue_class
      end

      def call(issue_id:, start_date: MISSING, due_date: MISSING)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id unless resolved_issue_id.is_a?(Integer)

        parsed_attrs = parse_date_attrs(start_date: start_date, due_date: due_date)
        return parsed_attrs unless parsed_attrs[:ok]

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        return error('FORBIDDEN', 'Issue is not editable', :forbidden) unless issue.editable?(@user)

        parsed_attrs[:attrs].each do |key, value|
          issue.public_send("#{key}=", value)
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

      def parse_date_attrs(start_date:, due_date:)
        attrs = {}
        if start_date != MISSING && start_date.present?
          parsed = parse_iso_date(start_date, 'start_date')
          return parsed unless parsed[:ok]
          attrs['start_date'] = parsed[:value]
        elsif start_date != MISSING
          attrs['start_date'] = nil
        end

        if due_date != MISSING && due_date.present?
          parsed = parse_iso_date(due_date, 'due_date')
          return parsed unless parsed[:ok]
          attrs['due_date'] = parsed[:value]
        elsif due_date != MISSING
          attrs['due_date'] = nil
        end

        return error('INVALID_INPUT', 'start_date or due_date is required', :unprocessable_entity) if attrs.empty?

        { ok: true, attrs: attrs }
      end

      def parse_iso_date(value, field_name)
        parsed = Date.iso8601(value.to_s)
        { ok: true, value: parsed }
      rescue ArgumentError
        error('INVALID_INPUT', "#{field_name} must be a valid ISO date", :unprocessable_entity)
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
