# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class RequestValidator
      class ValidationError < StandardError; end
      DEFAULT_TOP_TOPICS_LIMIT = 10
      DEFAULT_TOP_TICKETS_LIMIT = 30

      def validate_generate!(payload)
        project_id = to_i(payload[:project_id])
        version_id = to_i(payload[:version_id])
        week_from = to_date(payload[:week_from])
        week_to = to_date(payload[:week_to])

        raise ValidationError, 'project_id is required' unless project_id
        raise ValidationError, 'version_id is required' unless version_id
        raise ValidationError, 'week_from is required' unless week_from
        raise ValidationError, 'week_to is required' unless week_to
        raise ValidationError, 'week_from must be before week_to' if week_from > week_to

        {
          project_id: project_id,
          version_id: version_id,
          week_from: week_from,
          week_to: week_to,
          top_topics_limit: clamp_limit(payload[:top_topics_limit], DEFAULT_TOP_TOPICS_LIMIT),
          top_tickets_limit: clamp_limit(payload[:top_tickets_limit], DEFAULT_TOP_TICKETS_LIMIT)
        }
      end

      def validate_save!(payload)
        validated = validate_generate!(payload)
        destination_issue_id = to_i(payload[:destination_issue_id])
        markdown = payload[:markdown].to_s
        week = payload[:week].to_s.strip

        raise ValidationError, 'destination_issue_id is required' unless destination_issue_id
        raise ValidationError, 'markdown is required' if markdown.empty?
        raise ValidationError, 'week is required' if week.empty?

        validated.merge(
          destination_issue_id: destination_issue_id,
          markdown: markdown,
          week: week,
          generated_at: fallback_time(payload[:generated_at])
        )
      end

      private

      def clamp_limit(value, max)
        [to_i(value) || max, max].min
      end

      def fallback_time(value)
        value.presence || Time.current.iso8601
      end

      def to_i(value)
        return nil if value.nil?
        return nil if value.to_s.strip.empty?

        Integer(value)
      rescue ArgumentError, TypeError
        nil
      end

      def to_date(value)
        return nil if value.nil?
        return nil if value.to_s.strip.empty?

        Date.parse(value.to_s)
      rescue ArgumentError
        nil
      end
    end
  end
end
