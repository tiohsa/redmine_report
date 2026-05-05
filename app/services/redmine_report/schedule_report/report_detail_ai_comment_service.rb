# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    # Adds the generated AI markdown as a journal comment on the already-bound detail report issue.
    class ReportDetailAiCommentService < RedmineReport::WeeklyReport::BaseService
      SaveContext = Struct.new(:issue_id, :project_id, :version_id, :week, :revision, :generated_at, keyword_init: true)

      def initialize(project:, user:)
        super
        @validator = RedmineReport::WeeklyReport::RequestValidator.new
        @revision_resolver = RedmineReport::WeeklyReport::RevisionResolver.new
        @overflow_handler = RedmineReport::WeeklyReport::OverflowHandler.new
      end

      def call(destination_issue_id:, project_id:, version_id:, week_from:, week_to:, week:, markdown:, generated_at:)
        validated = validate_payload(
          destination_issue_id: destination_issue_id,
          project_id: project_id,
          version_id: version_id,
          week_from: week_from,
          week_to: week_to,
          week: week,
          markdown: markdown,
          generated_at: generated_at
        )
        return validated if validated.is_a?(Hash) && validated[:saved] == false

        issue = find_destination_issue(validated[:destination_issue_id])
        return issue if issue.is_a?(Hash)

        version = ensure_project_and_find_version!(
          project_id: validated[:project_id],
          version_id: validated[:version_id]
        )

        context = build_save_context(
          issue: issue,
          project_id: validated[:project_id],
          version_id: version.id,
          week: validated[:week],
          generated_at: validated[:generated_at]
        )
        resolved = @overflow_handler.call(markdown: validated[:markdown], header: build_header(context))
        issue.init_journal(user, resolved[:note])
        issue.save!

        {
          saved: true,
          revision: context.revision,
          mode: resolved[:mode],
          part: resolved[:part],
          saved_at: Time.current.iso8601,
          destination_issue_id: context.issue_id
        }
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.error("[schedule_report] report_detail ai_comment failed: #{e.message}")
        error_result('SAVE_FAILED', "Failed to save journal: #{e.message}")
      rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
        error_result('INVALID_INPUT', e.message)
      rescue ArgumentError, TypeError
        error_result('INVALID_INPUT', 'destination_issue_id must be an integer')
      end

      private

      def validate_payload(destination_issue_id:, project_id:, version_id:, week_from:, week_to:, week:, markdown:, generated_at:)
        @validator.validate_save!(
          destination_issue_id: destination_issue_id,
          project_id: project_id,
          version_id: version_id,
          week_from: week_from,
          week_to: week_to,
          week: week,
          markdown: markdown,
          generated_at: generated_at
        )
      rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
        error_result('INVALID_INPUT', e.message)
      end

      def find_destination_issue(destination_issue_id)
        issue = Issue.find_by(id: Integer(destination_issue_id))
        return error_result('NOT_FOUND', 'Destination issue was not found') unless issue
        return error_result('FORBIDDEN', 'Destination issue is not visible') unless issue.visible?(user)
        return error_result('PROJECT_MISMATCH', 'Destination issue must belong to selected project') unless issue.project_id == project.id
        return error_result('FORBIDDEN', 'Destination issue is not editable') unless can_add_notes?(issue)

        issue
      end

      def build_save_context(issue:, project_id:, version_id:, week:, generated_at:)
        SaveContext.new(
          issue_id: issue.id,
          project_id: project_id,
          version_id: version_id,
          week: week,
          revision: next_revision(issue, project_id, version_id, week),
          generated_at: generated_at
        )
      end

      def build_header(context)
        "[Weekly][#{context.week}] project_id=#{context.project_id} version_id=#{context.version_id} revision=#{context.revision} generated_at=#{context.generated_at}"
      end

      def next_revision(issue, project_id, version_id, week)
        @revision_resolver.next_revision(
          issue: issue,
          project_id: project_id,
          version_id: version_id,
          week: week
        )
      end

      def error_result(code, message)
        {
          saved: false,
          error_code: code,
          message: message
        }
      end

      def can_add_notes?(issue)
        if issue.respond_to?(:notes_addable?)
          issue.notes_addable?(user)
        else
          issue.editable?(user)
        end
      end
    end
  end
end
