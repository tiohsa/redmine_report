# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    # Saves edited detail rows as a new journal note on the bound issue.
    #
    # Composes a canonical Weekly Markdown format with split risk/decision sections.
    # Always creates a new revision instead of overwriting existing comments.
    class ReportDetailUpdateService
      WEEKLY_HEADER_PATTERN = /\[Weekly\]\[(?<week>[^\]]+)\]\s+project_id=(?<project_id>\d+)\s+version_id=(?<version_id>\d+)(?:\s+revision=(?<revision>\d+))?/
      SECTION_HEADINGS = {
        highlights_this_week: '今週の主要実績',
        next_week_actions: '来週の予定・アクション',
        risks: '課題・リスク',
        decisions: '決定事項'
      }.freeze

      SaveContext = Struct.new(:issue_id, :project_id, :version_id, :week, :revision, :generated_at, keyword_init: true)

      def initialize(user:)
        @user = user
      end

      def call(destination_issue_id:, targets:, highlights_this_week:, next_week_actions:, risks:, decisions:)
        return error_result('INVALID_INPUT', 'destination_issue_id is required') if destination_issue_id.blank?
        return error_result('INVALID_INPUT', 'targets must be a non-empty array') if !targets.is_a?(Array) || targets.empty?

        issue = find_destination_issue(destination_issue_id)
        return issue if issue.is_a?(Hash)

        context = build_save_context(issue: issue, targets: targets)
        sections = normalize_sections(
          highlights_this_week: highlights_this_week,
          next_week_actions: next_week_actions,
          risks: risks,
          decisions: decisions
        )

        note = compose_note(context: context, sections: sections)
        persist_note(issue: issue, note: note, context: context)
      rescue ArgumentError, TypeError
        error_result('INVALID_INPUT', 'destination_issue_id must be an integer')
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.error("[schedule_report] report_detail save failed: #{e.message}")
        error_result('SAVE_FAILED', "Failed to save journal: #{e.message}")
      end

      private

      def find_destination_issue(destination_issue_id)
        issue = Issue.find_by(id: Integer(destination_issue_id))
        return error_result('NOT_FOUND', 'Destination issue was not found') unless issue
        return error_result('FORBIDDEN', 'Destination issue is not visible') unless issue.visible?(@user)
        return error_result('FORBIDDEN', 'Destination issue is not editable') unless can_add_notes?(issue)

        issue
      end

      def build_save_context(issue:, targets:)
        primary_target = targets.first
        project_id = (primary_target[:project_id] || primary_target['project_id']).to_i
        version_id = (primary_target[:version_id] || primary_target['version_id']).to_i

        week = Time.current.strftime('%G-W%V')
        SaveContext.new(
          issue_id: issue.id,
          project_id: project_id,
          version_id: version_id,
          week: week,
          revision: next_revision(issue, project_id, version_id, week),
          generated_at: Time.current.iso8601
        )
      end

      def normalize_sections(sections)
        sections.transform_values { |rows| normalize_rows(rows) }
      end

      def persist_note(issue:, note:, context:)
        issue.init_journal(@user, note)
        unless issue.save
          Rails.logger.error("[schedule_report] report_detail save failed: #{issue.errors.full_messages.join(', ')}")
          return error_result('SAVE_FAILED', "Failed to save journal: #{issue.errors.full_messages.join(', ')}")
        end

        {
          saved: true,
          revision: context.revision,
          saved_at: context.generated_at,
          destination_issue_id: context.issue_id
        }
      end

      def compose_note(context:, sections:)
        lines = [
          "[Weekly][#{context.week}] project_id=#{context.project_id} version_id=#{context.version_id} revision=#{context.revision} generated_at=#{context.generated_at}",
          ''
        ]

        SECTION_HEADINGS.each do |key, heading|
          lines << "## #{heading}"
          lines.concat(sections.fetch(key).map { |row| "- #{row}" })
          lines << ''
        end

        lines.join("\n").rstrip
      end

      def normalize_rows(rows)
        items = Array(rows).map(&:to_s).map(&:strip).reject(&:blank?)
        items.empty? ? ['該当なし'] : items
      end

      def next_revision(issue, project_id, version_id, week)
        count = issue.journals.count do |journal|
          note = journal.notes.to_s
          match = note.match(WEEKLY_HEADER_PATTERN)
          next false unless match

          match[:week] == week &&
            match[:project_id].to_i == project_id &&
            match[:version_id].to_i == version_id
        end
        count + 1
      end

      def error_result(code, message)
        {
          saved: false,
          error_code: code,
          message: message
        }
      end

      def can_add_notes?(issue)
        # Prefer notes_addable? if available (Redmine >= 4.1), fall back to editable?
        if issue.respond_to?(:notes_addable?)
          issue.notes_addable?(@user)
        else
          issue.editable?(@user)
        end
      end
    end
  end
end
