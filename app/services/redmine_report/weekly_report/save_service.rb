# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class SaveService < BaseService
      class DestinationInvalidError < StandardError
        attr_reader :code, :status

        def initialize(code:, status:, message:)
          @code = code
          @status = status
          super(message)
        end
      end

      class RevisionConflictError < StandardError; end

      MAX_RETRIES = 2

      def initialize(project:, user:)
        super
        @destination_validator = DestinationValidator.new(project: project, user: user)
        @revision_resolver = RevisionResolver.new
        @overflow_handler = OverflowHandler.new
      end

      def call(payload)
        validated = validator.validate_save!(payload)
        version = ensure_project_and_find_version!(
          project_id: validated[:project_id],
          version_id: validated[:version_id]
        )

        destination_result = @destination_validator.call(destination_issue_id: validated[:destination_issue_id])
        unless destination_result.valid
          raise DestinationInvalidError.new(
            code: destination_result.reason_code,
            status: Rack::Utils.status_code(destination_result.status),
            message: destination_result.reason_message
          )
        end

        issue = destination_result.issue
        week = validated[:week]
        revision = with_revision_retry(issue: issue, project_id: project.id, version_id: version.id, week: week) do |next_revision|
          header = "[Weekly][#{week}] project_id=#{project.id} version_id=#{version.id} revision=#{next_revision} generated_at=#{validated[:generated_at]}"
          resolved = @overflow_handler.call(markdown: validated[:markdown], header: header)
          issue.init_journal(user, resolved[:note])
          issue.save!

          {
            saved: true,
            revision: next_revision,
            mode: resolved[:mode],
            part: resolved[:part],
            saved_at: Time.current.iso8601
          }
        end

        revision
      end

      private

      def with_revision_retry(issue:, project_id:, version_id:, week:)
        retries = 0
        begin
          revision = @revision_resolver.next_revision(
            issue: issue,
            project_id: project_id,
            version_id: version_id,
            week: week
          )
          yield(revision)
        rescue ActiveRecord::StaleObjectError => e
          retries += 1
          Rails.logger.warn("[schedule_report] revision conflict retry=#{retries}: #{e.message}")
          retry if retries <= MAX_RETRIES
          raise RevisionConflictError, 'Could not resolve revision conflict after retries'
        end
      end
    end
  end
end
