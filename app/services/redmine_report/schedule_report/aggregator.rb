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
        display_issues = display_issues_for_roots(candidates, selection.display_root_issue_ids)
        bars = build_bars(display_issues)
        filtered_rows = filtered_rows_for(bars)

        {
          rows: filtered_rows,
          bars: bars,
          selection_summary: build_selection_summary(selection),
          filter_rule: 'open_version_top_parent'
        }
      end

      private

      def selectable_candidates
        open_version_candidates(apply_status_scope(@issues))
      end

      def display_issues_for_roots(candidates, display_root_issue_ids)
        visible_root_ids = display_root_issue_ids.to_set
        root_issue_ids_in_order = visible_root_issue_ids_in_order(candidates, visible_root_ids)
        candidate_issue_map = candidate_issue_index(candidates)
        fetched_roots = fetched_display_root_issues(root_issue_ids_in_order, candidate_issue_map)

        root_issue_ids_in_order.filter_map do |root_id|
          candidate_issue_map[root_id] || fetched_roots[root_id]
        end
      end

      def visible_root_issue_ids_in_order(candidates, visible_root_ids)
        candidates
          .map { |issue| issue_root_id(issue) }
          .select { |root_id| visible_root_ids.include?(root_id) }
          .uniq
      end

      def candidate_issue_index(candidates)
        candidates.index_by(&:id)
      end

      def fetch_root_issues(root_issue_ids)
        return {} if root_issue_ids.empty?
        Issue.where(id: root_issue_ids).index_by(&:id)
      end

      def fetched_display_root_issues(root_issue_ids_in_order, candidate_issue_map)
        missing_root_ids = root_issue_ids_in_order.reject { |root_id| candidate_issue_map.key?(root_id) }
        fetch_root_issues(missing_root_ids)
      end

      def filter_rows_with_ancestors(rows, bars)
        rows_by_project_id = row_index_by_project_id(rows)
        rows_to_keep = ancestor_project_ids_for_bars(bars, rows_by_project_id)

        rows.select { |row| rows_to_keep.include?(row[:project_id]) }
      end

      def filtered_rows_for(bars)
        filter_rows_with_ancestors(build_rows, bars)
      end

      def build_selection_summary(selection)
        {
          total_candidates: selection.total_candidates,
          excluded_not_visible: selection.excluded_not_visible,
          excluded_invalid_hierarchy: selection.excluded_invalid_hierarchy,
          displayed_top_parent_count: selection.display_root_issue_ids.size
        }
      end

      def bar_project_ids(bars)
        bars.map { |bar| bar[:project_id] }.uniq
      end

      def row_index_by_project_id(rows)
        rows.index_by { |row| row[:project_id] }
      end

      def ancestor_project_ids_for_bars(bars, rows_by_project_id)
        bar_project_ids(bars).each_with_object(Set.new) do |project_id, rows_to_keep|
          rows_to_keep.merge(ancestor_project_ids(project_id, rows_by_project_id))
        end
      end

      def ancestor_project_ids(project_id, rows_by_project_id)
        ancestor_ids = Set.new
        row = rows_by_project_id[project_id]
        while row
          ancestor_ids << row[:project_id]
          parent_id = row[:parent_project_id]
          row = parent_id ? rows_by_project_id[parent_id] : nil
        end
        ancestor_ids
      end

      def build_rows
        visible_projects.map do |project|
          {
            project_id: project.id,
            identifier: project.identifier,
            name: project.name,
            parent_project_id: project.parent_id,
            level: hierarchy_level_resolver.call(project),
            expanded: true
          }
        end
      end

      def visible_projects
        [@project] + (@filters.include_subprojects ? @project.descendants.to_a : [])
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
        groups = bar_groups_for(issues)
        issue_to_bar_key = issue_to_bar_key_index(groups)
        dependencies = build_dependencies(issue_to_bar_key)

        bar_payloads_for(groups, dependencies).compact
      end

      def bar_groups_for(issues)
        issues
          .select { |issue| issue.fixed_version }
          .group_by { |issue| [issue.project_id, issue.id, issue.subject] }
      end

      def bar_payloads_for(groups, dependencies)
        groups.map do |group_key, grouped_issues|
          build_bar_from_group(group_key, grouped_issues, dependencies)
        end
      end

      def build_bar_from_group(group_key, grouped_issues, dependencies)
        project_id, issue_id, issue_subject = group_key
        identity = bar_identity_for(project_id: project_id, issue_id: issue_id, issue_subject: issue_subject, grouped_issues: grouped_issues)
        metrics = bar_metrics_for(grouped_issues)
        start_date = metrics[:start_date]
        end_date = metrics[:end_date]
        return nil unless start_date && end_date

        {
          bar_key: identity[:bar_key],
          project_id: identity[:project_id],
          # Keep legacy category fields for SPA compatibility; values now represent issue grouping.
          category_id: identity[:category_id],
          category_name: identity[:category_name],
          version_id: identity[:version_id],
          version_name: identity[:version_name],
          ticket_subject: identity[:ticket_subject],
          start_date: start_date,
          end_date: end_date,
          issue_count: metrics[:issue_count],
          delayed_issue_count: metrics[:delayed_issue_count],
          progress_rate: metrics[:progress_rate],
          is_delayed: metrics[:is_delayed],
          dependencies: dependencies[identity[:bar_key]].to_a
        }
      end

      def bar_identity_for(project_id:, issue_id:, issue_subject:, grouped_issues:)
        version = grouped_issues.first&.fixed_version
        version_name = version&.name

        {
          bar_key: bar_key_for(project_id, issue_id),
          project_id: project_id,
          category_id: issue_id,
          category_name: issue_subject || version_name || 'Issue',
          version_id: version&.id,
          version_name: version_name,
          ticket_subject: issue_subject
        }
      end

      def bar_metrics_for(grouped_issues)
        bar_schedule_metrics(grouped_issues).merge(bar_progress_metrics(grouped_issues))
      end

      def bar_schedule_metrics(grouped_issues)
        start_date, end_date = date_range_for_bar(grouped_issues)

        {
          start_date: start_date,
          end_date: end_date,
          issue_count: grouped_issues.size
        }
      end

      def bar_progress_metrics(grouped_issues)
        delay_count = delayed_issue_count(grouped_issues)

        {
          delayed_issue_count: delay_count,
          progress_rate: progress_rate(grouped_issues),
          is_delayed: delay_count.positive?
        }
      end

      def date_range_for_bar(grouped_issues)
        date_pairs = grouped_issues
                     .map { |issue| [issue.start_date || issue.due_date, issue.due_date || issue.start_date] }
                     .select { |start_date, end_date| start_date && end_date }
        return [nil, nil] if date_pairs.empty?

        [date_pairs.map(&:first).min, date_pairs.map(&:last).max]
      end

      def delayed_issue_count(grouped_issues)
        grouped_issues.count { |issue| issue.due_date && issue.due_date < Date.today && !issue.closed? }
      end

      def progress_rate(grouped_issues)
        progress_values = grouped_issues.map(&:done_ratio).compact
        return 0 if progress_values.empty?

        (progress_values.sum.to_f / progress_values.size).round(2)
      end

      def bar_key_for(project_id, issue_id)
        "#{project_id}:issue:#{issue_id}"
      end

      def issue_to_bar_key_index(groups)
        issue_to_bar_key = {}
        groups.each do |(project_id, issue_id, _), grouped_issues|
          bar_key = bar_key_for(project_id, issue_id)
          grouped_issues.each { |issue| issue_to_bar_key[issue.id] = bar_key }
        end
        issue_to_bar_key
      end

      def build_dependencies(issue_to_bar_key)
        issue_ids = issue_to_bar_key.keys
        return empty_dependency_map if issue_ids.empty?

        accumulate_dependencies(issue_to_bar_key: issue_to_bar_key, relations: preceding_relations_for(issue_ids))
      end

      def preceding_relations_for(issue_ids)
        IssueRelation.where(
          issue_from_id: issue_ids,
          issue_to_id: issue_ids,
          relation_type: IssueRelation::TYPE_PRECEDES
        )
      end

      def accumulate_dependencies(issue_to_bar_key:, relations:)
        dependencies = empty_dependency_map
        relations.each do |relation|
          from_key, to_key = dependency_keys_for(relation, issue_to_bar_key)
          dependencies[to_key] << from_key if valid_dependency_keys?(from_key, to_key)
        end
        dependencies
      end

      def dependency_keys_for(relation, issue_to_bar_key)
        [
          issue_to_bar_key[relation.issue_from_id],
          issue_to_bar_key[relation.issue_to_id]
        ]
      end

      def valid_dependency_keys?(from_key, to_key)
        from_key && to_key && from_key != to_key
      end

      def empty_dependency_map
        Hash.new { |h, k| h[k] = Set.new }
      end
    end
  end
end
