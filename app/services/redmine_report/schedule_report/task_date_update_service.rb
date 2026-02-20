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

        safe_names = issue.safe_attribute_names(@user).map(&:to_s)
        disallowed = parsed_attrs[:attrs].keys.reject { |key| safe_names.include?(key) }
        return error('FORBIDDEN', 'Issue is not editable', :forbidden) if disallowed.any?

        issue.safe_attributes = parsed_attrs[:attrs], @user
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
          subject: issue.subject.to_s,
          start_date: issue.start_date&.iso8601,
          due_date: issue.due_date&.iso8601,
          issue_url: "/issues/#{issue.id}"
        }
      end

      def error(code, message, status, retryable = nil)
        payload = { ok: false, code: code, message: message, status: status }
        payload[:retryable] = retryable unless retryable.nil?
        payload
      end
    end
  end
end
