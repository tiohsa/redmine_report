# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)
require 'yaml'

class AiResponseTabsFetchTest < ActiveSupport::TestCase
  def test_route_for_weekly_ai_responses_exists
    assert_recognizes(
      { controller: 'schedule_reports', action: 'weekly_ai_responses', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/weekly/ai_responses'
    )
  end

  def test_permission_includes_weekly_ai_responses
    permission = Redmine::AccessControl.permission(:view_schedule_report)

    assert_not_nil permission
    assert_includes permission.actions.map(&:to_s), 'schedule_reports/weekly_ai_responses'
  end

  def test_parse_journal_extracts_three_sections
    service = RedmineReport::ScheduleReport::AiResponseFetchService.new(
      root_project: Project.new(id: 1),
      user: User.new
    )

    journal = <<~MD
      [Weekly][2026-W07] project_id=1 version_id=2 revision=1 generated_at=2026-02-16T10:00:00+09:00
      ## 今週の主要実績
      - API連携を完了
      ## 来週の予定・アクション
      - リリース準備を実施
      ## 課題・リスク・決定事項
      - 【リスク】スケジュール逼迫
    MD

    parsed = service.send(:parse_journal, journal)

    assert_equal 1, parsed[:project_id]
    assert_equal 2, parsed[:version_id]
    assert_equal '- API連携を完了', parsed[:highlights_this_week]
    assert_equal '- リリース準備を実施', parsed[:next_week_actions]
    assert_equal '- 【リスク】スケジュール逼迫', parsed[:risks_decisions]
  end

  def test_parse_journal_merges_risks_and_decisions_when_combined_section_missing
    service = RedmineReport::ScheduleReport::AiResponseFetchService.new(
      root_project: Project.new(id: 1),
      user: User.new
    )

    journal = <<~MD
      [Weekly][2026-W07] project_id=1 version_id=2 revision=1 generated_at=2026-02-16T10:00:00+09:00
      ## 今週の主要実績
      - 主要実績
      ## 来週の予定・アクション
      - 次アクション
      ## 課題・リスク
      - リスク項目
      ## 決定事項
      - 決定項目
    MD

    parsed = service.send(:parse_journal, journal)

    assert_equal "- リスク項目\n- 決定項目", parsed[:risks_decisions]
  end

  def test_contract_defines_required_error_statuses
    contract_path = File.expand_path('../../specs/001-ai-response-tabs/contracts/ai-response-tabs.openapi.yaml', __dir__)
    doc = YAML.load_file(contract_path)
    responses = doc.dig('paths', '/ai_responses', 'get', 'responses')

    assert responses.key?('403')
    assert responses.key?('404')
    assert responses.key?('422')
    assert responses.key?('503')
  end
end
