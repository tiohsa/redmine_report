# frozen_string_literal: true

require 'set'

module RedmineReport
  module ScheduleReport
    class RootIssueResolver
      MAX_DEPTH = 100

      def initialize(issue_class: Issue)
        @issue_class = issue_class
      end

      def resolve_many(issues)
        root_ids = []
        invalid_count = 0
        states = []
        issue_cache = index_issues(issues)

        issues.each do |issue|
          root_id = extract_root_id(issue)
          if root_id
            root_ids << root_id
            next
          end

          states << initial_state(issue)
        end

        MAX_DEPTH.times do
          unresolved_states = states.reject { |state| state[:done] }
          break if unresolved_states.empty?

          parent_ids = advance_states(unresolved_states, root_ids)
          break if parent_ids.empty?

          fetch_missing_parents(parent_ids, issue_cache)
          unresolved_states.each do |state|
            next if state[:done]

            parent = issue_cache[state[:next_parent_id]]
            if parent
              state[:node] = parent
            else
              state[:done] = true
              state[:invalid] = true
              invalid_count += 1
            end
          end
        end

        # Treat any unresolved state after max depth as invalid hierarchy.
        states.each do |state|
          next if state[:done]

          state[:done] = true
          state[:invalid] = true
          invalid_count += 1
        end

        { root_ids: root_ids, invalid_count: invalid_count }
      end

      private

      def index_issues(issues)
        issues.each_with_object({}) do |issue, map|
          issue_id = extract_issue_id(issue)
          map[issue_id] = issue if issue_id
        end
      end

      def initial_state(issue)
        { node: issue, visited: Set.new, done: false, invalid: false, next_parent_id: nil }
      end

      def advance_states(states, root_ids)
        parent_ids = []

        states.each do |state|
          node = state[:node]
          node_id = extract_issue_id(node)
          if node_id.nil? || state[:visited].include?(node_id)
            state[:done] = true
            state[:invalid] = true
            next
          end

          state[:visited] << node_id
          parent_id = extract_parent_id(node)

          if parent_id
            state[:next_parent_id] = parent_id
            parent_ids << parent_id
          else
            state[:done] = true
            root_ids << node_id
          end
        end

        parent_ids.uniq
      end

      def fetch_missing_parents(parent_ids, issue_cache)
        missing_ids = parent_ids.reject { |id| issue_cache.key?(id) }
        return if missing_ids.empty?

        @issue_class.where(id: missing_ids).each do |issue|
          issue_id = extract_issue_id(issue)
          issue_cache[issue_id] = issue if issue_id
        end
      end

      def extract_root_id(issue)
        return nil unless issue.respond_to?(:root_id)

        root_id = issue.root_id
        return nil if root_id.respond_to?(:blank?) ? root_id.blank? : root_id.nil?

        root_id
      end

      def extract_issue_id(issue)
        issue.respond_to?(:id) ? issue.id : nil
      end

      def extract_parent_id(issue)
        issue.respond_to?(:parent_id) ? issue.parent_id : nil
      end
    end
  end
end
