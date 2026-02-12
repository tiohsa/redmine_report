# frozen_string_literal: true

require 'date'

module RedmineReport
  module ScheduleReport
    class Aggregator
      def initialize(issues:, project:, filters:)
        @issues = issues
        @project = project
        @filters = filters
      end

      def call
        scoped = apply_status_scope(@issues)
        {
          rows: build_rows,
          bars: build_bars(scoped)
        }
      end

      private

      def build_rows
        projects = [@project] + (@filters.include_subprojects ? @project.descendants.to_a : [])
        projects.map do |p|
          {
            project_id: p.id,
            name: p.name,
            parent_project_id: p.parent_id,
            level: hierarchy_level(p),
            expanded: true
          }
        end
      end

      def hierarchy_level(project)
        level = 0
        node = project
        while node.parent_id
          level += 1
          node = node.parent
          break unless node
        end
        level
      end

      def apply_status_scope(scope)
        return scope if @filters.status_scope == 'all'
        scope.open
      end

      def build_bars(scope)
        groups = scope.includes(:category).group_by { |i| [i.project_id, i.category_id || 0, i.category&.name || 'Uncategorized'] }

        groups.map do |(project_id, category_id, category_name), issues|
          date_pairs = issues.map { |issue| [issue.start_date || issue.due_date, issue.due_date || issue.start_date] }
                           .select { |s, e| s && e }
          next if date_pairs.empty?

          start_date = date_pairs.map(&:first).min
          end_date = date_pairs.map(&:last).max

          delayed_count = issues.count { |issue| issue.due_date && issue.due_date < Date.today && !issue.closed? }
          progress_avg = issues.map(&:done_ratio).compact
          progress_rate = progress_avg.empty? ? 0 : (progress_avg.sum.to_f / progress_avg.size).round(2)

          {
            bar_key: "#{project_id}:#{category_id}",
            project_id: project_id,
            category_id: category_id,
            category_name: category_name,
            start_date: start_date,
            end_date: end_date,
            issue_count: issues.size,
            delayed_issue_count: delayed_count,
            progress_rate: progress_rate,
            is_delayed: delayed_count.positive?
          }
        end.compact
      end
    end
  end
end
