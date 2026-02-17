# frozen_string_literal: true

module RedmineReport
  module ScheduleReport
    class AiResponseFetchService
      WEEKLY_HEADER_PATTERN = /\[Weekly\]\[(?<week>[^\]]+)\]\s+project_id=(?<project_id>\d+)\s+version_id=(?<version_id>\d+)(?:\s+revision=(?<revision>\d+))?(?:\s+generated_at=(?<generated_at>\S+))?/
      SECTION_HEADERS = {
        highlights_this_week: /^##\s*(?:📈\s*)?今週の主要実績\s*$/,
        next_week_actions: /^##\s*(?:🚀\s*)?来週の予定・アクション\s*$/,
        risks_decisions: /^##\s*(?:⚠️\s*)?課題・リスク・決定事項\s*$/
      }.freeze

      def initialize(root_project:, user:, selected_project_identifier: nil, selected_version_id: nil)
        @root_project = root_project
        @user = user
        @selected_project_identifier = selected_project_identifier.to_s.strip
        @selected_version_id = selected_version_id.to_i if selected_version_id.present?
      end

      def call
        project_tabs = build_project_tabs
        selected_project = resolve_selected_project(project_tabs)
        selected_version = resolve_selected_version(selected_project)
        latest_map = latest_response_map(project_tabs)
        selected_key = response_key(selected_project&.id, selected_version&.id)

        {
          project_tabs: project_tabs.map do |project|
            serialize_project_tab(project, latest_map, selected_project_id: selected_project&.id, selected_version_id: selected_version&.id)
          end,
          selected_target: {
            project_identifier: selected_project&.identifier,
            version_id: selected_version&.id
          },
          response: serialize_response(latest_map[selected_key])
        }
      end

      private

      def build_project_tabs
        visible_projects = ProjectOptionsBuilder.new(user: @user, root_project: @root_project).call

        visible_projects.filter_map do |row|
          project = Project.find_by(id: row[:project_id])
          next unless project

          versions = project.versions.order(:name).to_a
          next if versions.empty?

          { project: project, versions: versions }
        end
      end

      def resolve_selected_project(project_tabs)
        return nil if project_tabs.empty?

        selected = project_tabs.find { |row| row[:project].identifier == @selected_project_identifier }
        selected ||= project_tabs.find { |row| row[:project].id == @selected_project_identifier.to_i } if @selected_project_identifier.present?
        selected ||= project_tabs.first
        selected[:project]
      end

      def resolve_selected_version(selected_project)
        return nil unless selected_project

        versions = selected_project.versions.order(:name).to_a
        return nil if versions.empty?

        selected = versions.find { |version| version.id == @selected_version_id } if @selected_version_id
        selected || versions.first
      end

      def latest_response_map(project_tabs)
        project_ids = project_tabs.map { |row| row[:project].id }
        return {} if project_ids.empty?

        issues = Issue.visible(@user).where(project_id: project_ids).includes(:journals)

        latest = {}
        issues.each do |issue|
          issue.journals.each do |journal|
            parsed = parse_journal(journal.notes)
            next unless parsed
            next unless project_ids.include?(parsed[:project_id])

            key = response_key(parsed[:project_id], parsed[:version_id])
            current = latest[key]
            if current.nil? || parsed[:saved_at] > current[:saved_at]
              latest[key] = parsed.merge(destination_issue_id: issue.id)
            end
          end
        end

        latest
      end

      def parse_journal(note)
        body = note.to_s
        match = body.match(WEEKLY_HEADER_PATTERN)
        return nil unless match

        saved_at = parse_time(match[:generated_at]) || Time.current
        parsed_sections = parse_sections(body)

        {
          project_id: match[:project_id].to_i,
          version_id: match[:version_id].to_i,
          saved_at: saved_at,
          highlights_this_week: parsed_sections[:highlights_this_week],
          next_week_actions: parsed_sections[:next_week_actions],
          risks_decisions: parsed_sections[:risks_decisions],
          missing_sections: missing_sections(parsed_sections)
        }
      end

      def parse_sections(markdown)
        lines = markdown.to_s.lines.map(&:rstrip)
        sections = {
          highlights_this_week: [],
          next_week_actions: [],
          risks_decisions: [],
          risks: [],
          decisions: []
        }

        current = nil
        lines.each do |line|
          header_key = SECTION_HEADERS.find { |_, pattern| line.match?(pattern) }&.first
          header_key ||= :risks if line.match?(/^##\s*課題・リスク\s*$/)
          header_key ||= :decisions if line.match?(/^##\s*決定事項\s*$/)
          if header_key
            current = header_key
            next
          end

          next unless current
          next if line.strip.empty?
          next if line.start_with?('[Weekly][')
          next if line.start_with?('## ')

          sections[current] << line
        end

        merged = sections.dup
        if merged[:risks_decisions].empty?
          merged[:risks_decisions] = [*merged[:risks], *merged[:decisions]]
        end

        merged.transform_values { |value| value.join("\n").strip.presence }
      end

      def missing_sections(parsed_sections)
        %i[highlights_this_week next_week_actions risks_decisions].filter_map do |key|
          parsed_sections[key].blank? ? key.to_s : nil
        end
      end

      def serialize_project_tab(row, latest_map, selected_project_id:, selected_version_id:)
        project = row[:project]
        versions = row[:versions]

        {
          project_identifier: project.identifier,
          project_name: project.name,
          active: project.id == selected_project_id,
          versions: versions.map do |version|
            {
              version_id: version.id,
              version_name: version.name,
              active: project.id == selected_project_id && version.id == selected_version_id,
              has_saved_response: latest_map.key?(response_key(project.id, version.id))
            }
          end
        }
      end

      def serialize_response(entry)
        return {
          status: 'NOT_SAVED',
          destination_issue_id: 0,
          saved_at: nil,
          highlights_this_week: nil,
          next_week_actions: nil,
          risks_decisions: nil,
          missing_sections: %w[highlights_this_week next_week_actions risks_decisions],
          failure_reason_code: 'NOT_FOUND',
          message: '保存済みレスポンスがありません'
        } unless entry

        status = entry[:missing_sections].empty? ? 'AVAILABLE' : 'PARTIAL'

        {
          status: status,
          destination_issue_id: entry[:destination_issue_id],
          saved_at: entry[:saved_at].iso8601,
          highlights_this_week: entry[:highlights_this_week],
          next_week_actions: entry[:next_week_actions],
          risks_decisions: entry[:risks_decisions],
          missing_sections: entry[:missing_sections],
          failure_reason_code: nil,
          message: nil
        }
      end

      def response_key(project_id, version_id)
        "#{project_id}:#{version_id}"
      end

      def parse_time(value)
        return nil if value.blank?

        Time.iso8601(value)
      rescue ArgumentError
        nil
      end
    end
  end
end
