# frozen_string_literal: true

require 'set'

module RedmineReport
  module ScheduleReport
    class ChildIssuesService < BaseIssueService
      def initialize(root_project:, user:, issue_class: Issue, relation_class: IssueRelation)
        super(root_project: root_project, user: user, issue_class: issue_class)
        @relation_class = relation_class
      end

      def call(parent_issue_ids:)
        ids = normalize_ids(parent_issue_ids)
        return success(items: []) if ids.empty?

        parents = visible_scope.where(id: ids).includes(:fixed_version).index_by(&:id)
        return success(items: []) if parents.empty?

        children = visible_scope
                   .where(parent_id: parents.keys)
                   .includes(:fixed_version)
                   .order(:parent_id, :start_date, :due_date, :id)
                   .to_a
        children_by_parent = children.group_by(&:parent_id)
        dependencies = build_dependencies(children)

        items = ids.filter_map do |parent_id|
          parent = parents[parent_id]
          next unless parent

          child_bars = Array(children_by_parent[parent_id]).filter_map do |child|
            build_child_bar(parent: parent, child: child, dependencies: dependencies)
          end
          next if child_bars.empty?

          {
            parent_issue_id: parent_id,
            children: child_bars
          }
        end

        success(items: items)
      rescue ArgumentError, TypeError
        error('INVALID_INPUT', 'parent_issue_ids must be an array of integers', :unprocessable_entity)
      end

      private

      def normalize_ids(values)
        Array(values).filter_map do |value|
          Integer(value)
        rescue ArgumentError, TypeError
          nil
        end.uniq
      end

      def build_child_bar(parent:, child:, dependencies:)
        start_date = child.start_date || child.due_date
        end_date = child.due_date || child.start_date
        return nil unless start_date && end_date

        version = parent.fixed_version
        bar_key = bar_key_for(child)

        {
          bar_key: bar_key,
          project_id: child.project_id,
          category_id: child.id,
          category_name: child.subject.to_s,
          version_id: version&.id,
          version_name: version&.name,
          ticket_subject: child.subject.to_s,
          start_date: start_date.iso8601,
          end_date: end_date.iso8601,
          issue_count: 1,
          delayed_issue_count: delayed?(child, end_date) ? 1 : 0,
          progress_rate: child.done_ratio.to_i,
          is_delayed: delayed?(child, end_date),
          dependencies: dependencies[bar_key].to_a
        }
      end

      def delayed?(issue, end_date)
        end_date < Date.today && !issue.closed?
      end

      def bar_key_for(issue)
        "#{issue.project_id}:issue:#{issue.id}"
      end

      def build_dependencies(children)
        keys_by_issue_id = children.each_with_object({}) { |child, map| map[child.id] = bar_key_for(child) }
        dependencies = Hash.new { |hash, key| hash[key] = Set.new }
        return dependencies if keys_by_issue_id.empty?

        @relation_class.where(
          issue_from_id: keys_by_issue_id.keys,
          issue_to_id: keys_by_issue_id.keys,
          relation_type: IssueRelation::TYPE_PRECEDES
        ).find_each do |relation|
          from_key = keys_by_issue_id[relation.issue_from_id]
          to_key = keys_by_issue_id[relation.issue_to_id]
          next if from_key.blank? || to_key.blank? || from_key == to_key

          dependencies[to_key] << from_key
        end

        dependencies
      rescue StandardError
        Hash.new { |hash, key| hash[key] = Set.new }
      end
    end
  end
end
