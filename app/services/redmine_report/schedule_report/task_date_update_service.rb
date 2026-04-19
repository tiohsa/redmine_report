# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskDateUpdateService < BaseIssueService
      MISSING = Object.new

      def call(issue_id:, start_date: MISSING, due_date: MISSING)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id if resolved_issue_id.is_a?(ServiceResult)

        parsed_attrs = parse_date_attrs(start_date: start_date, due_date: due_date)
        return parsed_attrs if parsed_attrs.is_a?(ServiceResult)

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        return error('FORBIDDEN', 'Issue is not editable', :forbidden) unless issue.editable?(@user)

        parsed_attrs[:attrs].each do |key, value|
          issue.public_send("#{key}=", value)
        end
        return error('VALIDATION_ERROR', issue.errors.full_messages.join(', '), :unprocessable_entity) unless issue.save

        success(issue: serialize_issue(issue))
      end

      private

      def parse_date_attrs(start_date:, due_date:)
        attrs = {}
        if start_date != MISSING && start_date.present?
          parsed = parse_iso_date(start_date, 'start_date')
          return parsed if parsed.is_a?(ServiceResult)
          attrs['start_date'] = parsed[:value]
        elsif start_date != MISSING
          attrs['start_date'] = nil
        end

        if due_date != MISSING && due_date.present?
          parsed = parse_iso_date(due_date, 'due_date')
          return parsed if parsed.is_a?(ServiceResult)
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
        invalid_input("#{field_name} must be a valid ISO date")
      end
    end
  end
end
