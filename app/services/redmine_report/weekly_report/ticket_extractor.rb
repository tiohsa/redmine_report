# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class TicketExtractor
      def initialize(project:, version_id:, week_from:, week_to:, top_tickets_limit: 30)
        @project = project
        @version_id = version_id
        @week_from = week_from
        @week_to = week_to
        @top_tickets_limit = top_tickets_limit
      end

      def call
        issues = base_scope.to_a
        a_tickets = issues.select { |issue| within_week?(issue.updated_on) }
        b_tickets = issues.select { |issue| continuous_risk?(issue) }

        all = (a_tickets + b_tickets).uniq { |issue| issue.id }
        scored = all.sort_by { |issue| score(issue) }.reverse.first(@top_tickets_limit)

        scored.map do |issue|
          {
            id: issue.id,
            title: issue.subject,
            status: issue.status&.name,
            priority: issue.priority&.name,
            due_date: issue.due_date,
            progress: issue.done_ratio,
            layer: a_tickets.include?(issue) ? 'A_WEEKLY_CHANGE' : 'B_CONTINUOUS_RISK',
            changes_this_week: extract_changes(issue),
            comments_this_week: extract_comments(issue)
          }
        end
      end

      private

      def base_scope
        Issue.includes(:status, :priority, :assigned_to, :journals)
             .where(project_id: @project.id, fixed_version_id: @version_id)
      end

      def within_week?(time)
        return false unless time

        time.to_date >= @week_from && time.to_date <= @week_to
      end

      def continuous_risk?(issue)
        return false if issue.closed?

        overdue = issue.due_date.present? && issue.due_date < Date.current
        high_priority = issue.priority&.name.to_s.downcase.include?('high') || issue.priority&.name.to_s.include?('高')
        overdue || high_priority
      end

      def score(issue)
        overdue_score = issue.due_date.present? && issue.due_date < Date.current ? 100 : 0
        priority_score = issue.priority&.name.to_s.downcase.include?('high') || issue.priority&.name.to_s.include?('高') ? 50 : 0
        updated_score = within_week?(issue.updated_on) ? 25 : 0
        overdue_score + priority_score + updated_score + issue.done_ratio.to_i
      end

      def extract_comments(issue)
        issue.journals.filter_map do |journal|
          next unless within_week?(journal.created_on)

          text = journal.notes.to_s.strip
          next if text.empty?

          {
            journal_id: journal.id,
            created_on: journal.created_on,
            author: journal.user&.name.to_s,
            content: text,
            excerpt: text[0, 200]
          }
        end
      end

      def extract_changes(issue)
        delta = {
          status_change: nil,
          progress_delta: nil,
          due_date_change: nil,
          priority_change: nil,
          assignee_change: nil
        }

        issue.journals.each do |journal|
          next unless within_week?(journal.created_on)

          journal.details.each do |detail|
            case detail.prop_key
            when 'status_id'
              delta[:status_change] = change_label(detail)
            when 'done_ratio'
              old = detail.old_value.to_i
              now = detail.value.to_i
              delta[:progress_delta] = now - old
            when 'due_date'
              delta[:due_date_change] = change_label(detail)
            when 'priority_id'
              delta[:priority_change] = change_label(detail)
            when 'assigned_to_id'
              delta[:assignee_change] = change_label(detail)
            end
          end
        end

        delta
      end

      def change_label(detail)
        "#{detail.old_value} -> #{detail.value}"
      end
    end
  end
end
