# frozen_string_literal: true

require 'date'
require 'set'

module RedmineReport
  module ScheduleReport
    class Aggregator
      def initialize(issues:, project:, filters:, visibility_scope:)
        @issues = issues
        @project = project
        @filters = filters
        @visibility_scope = visibility_scope
      end

      def call
        candidates = selectable_candidates
        selection = @visibility_scope.select_visible_top_level_parents(candidates)
        display_issues = resolve_display_issues(candidates, selection.display_root_issue_ids)
        bars = build_bars(display_issues)
        filtered_rows = filter_rows_with_ancestors(build_rows, bars)

        {
          rows: filtered_rows,
          bars: bars,
          selection_summary: {
            total_candidates: selection.total_candidates,
            excluded_not_visible: selection.excluded_not_visible,
            excluded_invalid_hierarchy: selection.excluded_invalid_hierarchy,
            displayed_top_parent_count: selection.display_root_issue_ids.size
          },
          filter_rule: 'open_version_top_parent'
        }
      end

      private

      def selectable_candidates
        open_version_candidates(apply_status_scope(@issues))
      end

      def resolve_display_issues(candidates, display_root_issue_ids)
        visible_root_ids = display_root_issue_ids.to_set
        root_issue_ids_in_order = candidates
                                  .map { |issue| issue_root_id(issue) }
                                  .select { |root_id| visible_root_ids.include?(root_id) }
                                  .uniq
        candidate_issue_map = candidates.index_by(&:id)
        missing_root_ids = root_issue_ids_in_order.reject { |root_id| candidate_issue_map.key?(root_id) }
        fetched_roots = fetch_root_issues(missing_root_ids)

        root_issue_ids_in_order.filter_map do |root_id|
          candidate_issue_map[root_id] || fetched_roots[root_id]
        end
      end

      def fetch_root_issues(root_issue_ids)
        return {} if root_issue_ids.empty?
        Issue.where(id: root_issue_ids).index_by(&:id)
      end

      def filter_rows_with_ancestors(rows, bars)
        rows_by_project_id = rows.index_by { |row| row[:project_id] }
        rows_to_keep = Set.new

        bars.map { |bar| bar[:project_id] }.uniq.each do |project_id|
          keep_row_ancestors(project_id, rows_by_project_id, rows_to_keep)
        end

        rows.select { |row| rows_to_keep.include?(row[:project_id]) }
      end

      def keep_row_ancestors(project_id, rows_by_project_id, rows_to_keep)
        row = rows_by_project_id[project_id]
        while row
          rows_to_keep << row[:project_id]
          parent_id = row[:parent_project_id]
          row = parent_id ? rows_by_project_id[parent_id] : nil
        end
      end

      def build_rows
        projects = [@project] + (@filters.include_subprojects ? @project.descendants.to_a : [])
        projects.map do |p|
          {
            project_id: p.id,
            identifier: p.identifier,
            name: p.name,
            parent_project_id: p.parent_id,
            level: hierarchy_level_resolver.call(p),
            expanded: true
          }
        end
      end

      def hierarchy_level_resolver
        @hierarchy_level_resolver ||= HierarchyLevelResolver.new
      end

      def apply_status_scope(scope)
        return scope if @filters.status_scope == 'all'
        scope.open
      end

      def open_version_candidates(scope)
        scope.includes(:fixed_version).select do |issue|
          fixed_version = issue.fixed_version
          fixed_version && fixed_version.status == 'open'
        end
      end

      def issue_root_id(issue)
        return issue.root_id if issue.respond_to?(:root_id)
        issue.id
      end

      def build_bars(issues)
        groups = issues
                 .select { |issue| issue.fixed_version }
                 .group_by { |issue| [issue.project_id, issue.id, issue.subject] }
        issue_to_bar_key = build_issue_to_bar_key_map(groups)
        dependencies = build_dependencies(issue_to_bar_key)

        groups.map do |(project_id, issue_id, issue_subject), grouped_issues|
          date_pairs = grouped_issues.map { |issue| [issue.start_date || issue.due_date, issue.due_date || issue.start_date] }
                           .select { |s, e| s && e }
          next if date_pairs.empty?

          start_date = date_pairs.map(&:first).min
          end_date = date_pairs.map(&:last).max

          delayed_count = grouped_issues.count { |issue| issue.due_date && issue.due_date < Date.today && !issue.closed? }
          progress_avg = grouped_issues.map(&:done_ratio).compact
          progress_rate = progress_avg.empty? ? 0 : (progress_avg.sum.to_f / progress_avg.size).round(2)

          key = "#{project_id}:issue:#{issue_id}"
          version_name = grouped_issues.first&.fixed_version&.name

          {
            bar_key: key,
            project_id: project_id,
            # Keep legacy category fields for SPA compatibility; values now represent issue grouping.
            category_id: issue_id,
            category_name: issue_subject || version_name || 'Issue',
            version_id: grouped_issues.first&.fixed_version&.id,
            version_name: version_name,
            ticket_subject: issue_subject,
            start_date: start_date,
            end_date: end_date,
            issue_count: grouped_issues.size,
            delayed_issue_count: delayed_count,
            progress_rate: progress_rate,
            is_delayed: delayed_count.positive?,
            dependencies: dependencies[key].to_a
          }
        end.compact
      end

      def build_issue_to_bar_key_map(groups)
        issue_to_bar_key = {}
        groups.each do |(project_id, issue_id, _), grouped_issues|
          bar_key = "#{project_id}:issue:#{issue_id}"
          grouped_issues.each { |issue| issue_to_bar_key[issue.id] = bar_key }
        end
        issue_to_bar_key
      end

      def build_dependencies(issue_to_bar_key)
        issue_ids = issue_to_bar_key.keys
        return Hash.new { |h, k| h[k] = Set.new } if issue_ids.empty?

        relations = IssueRelation.where(
          issue_from_id: issue_ids,
          issue_to_id: issue_ids,
          relation_type: IssueRelation::TYPE_PRECEDES
        )

        dependencies = Hash.new { |h, k| h[k] = Set.new }
        relations.each do |relation|
          from_key = issue_to_bar_key[relation.issue_from_id]
          to_key = issue_to_bar_key[relation.issue_to_id]
          dependencies[to_key] << from_key if from_key && to_key && from_key != to_key
        end
        dependencies
      end
    end
  end
end
