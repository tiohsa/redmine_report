# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class AiResponseUpdateService < BaseService
      class DestinationInvalidError < StandardError
        attr_reader :code, :status

        def initialize(code:, status:, message:)
          @code = code
          @status = status
          super(message)
        end
      end

      SECTION_TITLES = {
        highlights_this_week: '今週の主要実績',
        next_week_actions: '来週の予定・アクション',
        risks_decisions: '課題・リスク・決定事項'
      }.freeze

      def initialize(project:, user:)
        super
        @destination_validator = DestinationValidator.new(project: project, user: user)
        @revision_resolver = RevisionResolver.new
        @overflow_handler = OverflowHandler.new
      end

      def call(payload)
        version = find_version!(to_integer(payload[:version_id], 'version_id'))
        destination_issue_id = to_integer(payload[:destination_issue_id], 'destination_issue_id')

        destination_result = @destination_validator.call(destination_issue_id: destination_issue_id)
        unless destination_result.valid
          raise DestinationInvalidError.new(
            code: destination_result.reason_code,
            status: Rack::Utils.status_code(destination_result.status),
            message: destination_result.reason_message
          )
        end

        saved_at = Time.current
        week = inline_week(saved_at)
        issue = destination_result.issue
        sections = normalize_sections(payload)
        revision = @revision_resolver.next_revision(
          issue: issue,
          project_id: project.id,
          version_id: version.id,
          week: week
        )
        header = "[Weekly][#{week}] project_id=#{project.id} version_id=#{version.id} revision=#{revision} generated_at=#{saved_at.iso8601}"
        resolved = @overflow_handler.call(markdown: compose_markdown(sections), header: header)

        issue.init_journal(user, resolved[:note])
        issue.save!

        {
          saved: true,
          saved_at: saved_at.iso8601,
          response: serialize_response(issue: issue, saved_at: saved_at, sections: sections)
        }
      end

      private

      def normalize_sections(payload)
        SECTION_TITLES.keys.index_with { |key| payload[key].to_s }
      end

      def compose_markdown(sections)
        SECTION_TITLES.map do |key, title|
          body = sections[key].to_s.strip
          "## #{title}\n\n#{body}"
        end.join("\n\n")
      end

      def serialize_response(issue:, saved_at:, sections:)
        missing_sections = sections.filter_map { |key, value| key.to_s if value.blank? }

        {
          status: missing_sections.empty? ? 'AVAILABLE' : 'PARTIAL',
          destination_issue_id: issue.id,
          saved_at: saved_at.iso8601,
          highlights_this_week: sections[:highlights_this_week],
          next_week_actions: sections[:next_week_actions],
          risks_decisions: sections[:risks_decisions],
          missing_sections: missing_sections,
          failure_reason_code: nil,
          message: nil
        }
      end

      def inline_week(saved_at)
        "#{saved_at.to_date.cwyear}-W#{saved_at.to_date.cweek.to_s.rjust(2, '0')}"
      end

      def to_integer(value, field_name)
        Integer(value)
      rescue ArgumentError, TypeError
        raise RequestValidator::ValidationError, "#{field_name} is required"
      end
    end
  end
end
