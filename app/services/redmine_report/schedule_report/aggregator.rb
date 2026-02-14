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
        scoped = apply_status_scope(@issues)
        candidates = open_version_candidates(scoped)
        selection = @visibility_scope.select_visible_top_level_parents(candidates)
        visible_root_ids = selection.display_root_issue_ids.to_set
        selected_candidates = candidates.select do |issue|
          visible_root_ids.include?(issue_root_id(issue))
        end
        bars = build_bars(selected_candidates)
        all_rows = build_rows

        active_project_ids = bars.map { |b| b[:project_id] }.uniq
        rows_to_keep = Set.new
        active_project_ids.each do |pid|
          row = all_rows.find { |r| r[:project_id] == pid }
          while row
            rows_to_keep << row[:project_id]
            parent_id = row[:parent_project_id]
            row = parent_id ? all_rows.find { |r| r[:project_id] == parent_id } : nil
          end
        end

        filtered_rows = all_rows.select { |r| rows_to_keep.include?(r[:project_id]) }

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

      def build_rows
        projects = [@project] + (@filters.include_subprojects ? @project.descendants.to_a : [])
        projects.map do |p|
          {
            project_id: p.id,
            identifier: p.identifier,
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
        # One chevron bar per version-assigned ticket.
        groups = issues
                 .select { |issue| issue.fixed_version }
                 .group_by { |issue| [issue.project_id, issue.id, issue.subject] }

        # 2. Build map of issue_id -> bar_key
        issue_to_bar_key = {}
        groups.each do |(project_id, issue_id, _), grouped_issues|
          key = "#{project_id}:issue:#{issue_id}"
          grouped_issues.each { |issue| issue_to_bar_key[issue.id] = key }
        end

        # 3. Fetch relations (follows/precedes)
        # We only care about relations between issues in our scope
        issue_ids = issue_to_bar_key.keys
        relations = if issue_ids.empty?
                      []
                    else
                      IssueRelation.where(
                        issue_from_id: issue_ids,
                        issue_to_id: issue_ids,
                        relation_type: IssueRelation::TYPE_PRECEDES
                      )
                    end

        # 4. Aggregate dependencies (bar_key -> Set of predecessor bar_keys)
        # relation: from (predecessor) -> to (successor)
        dependencies = Hash.new { |h, k| h[k] = Set.new }
        relations.each do |rel|
          from_key = issue_to_bar_key[rel.issue_from_id]
          to_key = issue_to_bar_key[rel.issue_to_id]

          # If issues are in different bars, record the dependency
          if from_key && to_key && from_key != to_key
            dependencies[to_key] << from_key
          end
        end

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
    end
  end
end
