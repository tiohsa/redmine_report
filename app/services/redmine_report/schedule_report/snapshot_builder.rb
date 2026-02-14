# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class SnapshotBuilder
      MAX_ROWS = 500
      MAX_BARS = 2000
      STALE_AFTER_SECONDS = 300

      def initialize(rows:, bars:, available_projects: [], filters:, selection_summary:, filter_rule:)
        @rows = rows
        @bars = bars
        @available_projects = available_projects
        @filters = filters
        @selection_summary = selection_summary
        @filter_rule = filter_rule
      end

      def call
        warnings = []
        rows = @rows
        bars = @bars

        if rows.size > MAX_ROWS
          rows = rows.first(MAX_ROWS)
          warnings << "Row limit exceeded (#{MAX_ROWS}). Showing first #{MAX_ROWS} rows."
        end

        if bars.size > MAX_BARS
          bars = bars.first(MAX_BARS)
          warnings << "Bar limit exceeded (#{MAX_BARS}). Showing first #{MAX_BARS} bars."
        end

        warnings << 'No data available for selected filters.' if rows.empty? || bars.empty?
        applied_filters = @filters.to_h.merge(filter_rule: @filter_rule)

        {
          meta: {
            generated_at: Time.current.iso8601,
            stale_after_seconds: STALE_AFTER_SECONDS,
            limits: {
              max_rows: MAX_ROWS,
              max_bars: MAX_BARS
            },
            warnings: warnings,
            applied_filters: applied_filters
          },
          rows: rows,
          bars: bars,
          available_projects: @available_projects,
          selection_summary: @selection_summary
        }
      end
    end
  end
end
