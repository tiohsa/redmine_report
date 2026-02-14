# frozen_string_literal: true

module RedmineReport
  module WeeklyReport
    class ContextBuilder
      def initialize(project:, version:, week_from:, week_to:, top_tickets_limit: 30)
        @project = project
        @version = version
        @week_from = week_from
        @week_to = week_to
        @top_tickets_limit = top_tickets_limit
      end

      def call
        tickets = TicketExtractor.new(
          project: @project,
          version_id: @version.id,
          week_from: @week_from,
          week_to: @week_to,
          top_tickets_limit: @top_tickets_limit
        ).call

        {
          project: { id: @project.id, name: @project.name },
          version: { id: @version.id, name: @version.name },
          week: { from: @week_from, to: @week_to, timezone: 'JST' },
          kpi: {
            completed: tickets.count { |t| t[:status].to_s.downcase.include?('closed') || t[:status].to_s.include?('終了') },
            wip: tickets.count { |t| !t[:status].to_s.downcase.include?('closed') && !t[:status].to_s.include?('終了') },
            overdue: tickets.count { |t| t[:due_date].present? && t[:due_date] < Date.current },
            high_priority_open: tickets.count do |t|
              open = !t[:status].to_s.downcase.include?('closed') && !t[:status].to_s.include?('終了')
              high = t[:priority].to_s.downcase.include?('high') || t[:priority].to_s.include?('高')
              open && high
            end
          },
          tickets: tickets
        }
      end
    end
  end
end
