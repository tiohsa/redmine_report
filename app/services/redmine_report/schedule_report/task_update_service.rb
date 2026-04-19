# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class TaskUpdateService < BaseIssueService
      ALLOWED_FIELDS = %w[subject tracker_id status_id priority_id assigned_to_id done_ratio description notes].freeze

      def call(issue_id:, fields:)
        resolved_issue_id = parse_issue_id(issue_id)
        return resolved_issue_id if resolved_issue_id.is_a?(ServiceResult)

        filtered = filter_fields(fields)
        return error('INVALID_INPUT', 'No valid fields provided', :unprocessable_entity) if filtered.empty?

        issue = visible_scope.find_by(id: resolved_issue_id)
        return error('NOT_FOUND', 'Issue not found', :not_found) unless issue

        return error('FORBIDDEN', 'Issue is not editable', :forbidden) unless issue.editable?(@user)

        filtered.each do |key, value|
          if key == 'notes'
            issue.init_journal(@user, value) if value.present?
          else
            issue.public_send(:"#{key}=", value)
          end
        end

        return error('VALIDATION_ERROR', issue.errors.full_messages.join(', '), :unprocessable_entity) unless issue.save

        success(issue: serialize_issue(issue))
      end

      private

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
        when 'description', 'notes'
          value.presence
        else
          value.presence
        end
      rescue ArgumentError, TypeError
        nil
      end
    end
  end
end
