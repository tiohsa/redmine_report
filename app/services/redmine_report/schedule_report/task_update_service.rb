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
        validation_error = validate_fields(issue, filtered)
        return validation_error if validation_error

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

      def validate_fields(issue, fields)
        return validation_error('Tracker is not allowed for this project') if fields.key?('tracker_id') && !tracker_allowed?(issue, fields['tracker_id'])
        return validation_error('Status transition is not allowed') if fields.key?('status_id') && !status_allowed?(issue, fields['status_id'])
        return validation_error('Priority is not allowed') if fields.key?('priority_id') && !priority_allowed?(issue, fields['priority_id'])
        return validation_error('Assignee is not assignable') if fields.key?('assigned_to_id') && !assignee_allowed?(issue, fields['assigned_to_id'])

        nil
      end

      def validation_error(message)
        error('VALIDATION_ERROR', message, :unprocessable_entity)
      end

      def tracker_allowed?(issue, tracker_id)
        return false if tracker_id.nil?

        project_trackers = issue.respond_to?(:project) ? Array(issue.project&.trackers) : []
        allowed_ids = ([issue.tracker] + project_trackers).compact.map(&:id)
        allowed_ids << issue.tracker_id if issue.respond_to?(:tracker_id)
        allowed_ids.include?(tracker_id)
      end

      def status_allowed?(issue, status_id)
        return false if status_id.nil?

        statuses = issue.respond_to?(:new_statuses_allowed_to) ? Array(issue.new_statuses_allowed_to(@user)) : []
        allowed_ids = ([issue.status] + statuses).compact.map(&:id)
        allowed_ids << issue.status_id if issue.respond_to?(:status_id)
        allowed_ids.include?(status_id)
      end

      def priority_allowed?(issue, priority_id)
        return false if priority_id.nil?

        allowed_ids = ([issue.priority] + IssuePriority.active.to_a).compact.map(&:id)
        allowed_ids << issue.priority_id if issue.respond_to?(:priority_id)
        allowed_ids.include?(priority_id)
      end

      def assignee_allowed?(issue, assigned_to_id)
        return true if assigned_to_id.nil?

        users = issue.respond_to?(:assignable_users) ? Array(issue.assignable_users) : []
        allowed_ids = users.compact.map(&:id)
        allowed_ids << issue.assigned_to_id if issue.respond_to?(:assigned_to_id)
        allowed_ids.include?(assigned_to_id)
      end
    end
  end
end
