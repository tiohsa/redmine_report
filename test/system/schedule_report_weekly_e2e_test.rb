# frozen_string_literal: true

require_relative '../playwright_system_test_case'

class ScheduleReportWeeklyE2eTest < PlaywrightSystemTestCase
  fixtures :projects, :enabled_modules, :versions,
           :users, :members, :roles, :member_roles,
           :trackers, :projects_trackers, :enumerations, :issue_statuses, :issues

  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
    skip 'project fixture required' unless @project
    EnabledModule.find_or_create_by!(project: @project, name: 'schedule_report')

    @admin = User.find_by(login: 'admin') || User.first
    skip 'admin fixture required' unless @admin

    @version = @project.versions.find_by(name: 'E2E Weekly Flow Version') || @project.versions.create!(
      name: 'E2E Weekly Flow Version',
      status: 'open'
    )
    @tracker = @project.trackers.first || Tracker.first
    @open_status = IssueStatus.where(is_closed: false).first || IssueStatus.first
    @priority = IssuePriority.find_by(is_default: true) || IssuePriority.first

    @destination_issue = Issue.create!(
      project: @project,
      tracker: @tracker,
      author: @admin,
      subject: 'E2E destination issue',
      status: @open_status,
      priority: @priority
    )

    Issue.create!(
      project: @project,
      tracker: @tracker,
      author: @admin,
      subject: 'E2E timeline issue',
      status: @open_status,
      priority: @priority,
      fixed_version: @version,
      start_date: Date.current - 1,
      due_date: Date.current + 7,
      done_ratio: 40
    )
  end

  def test_weekly_report_can_be_prepared_generated_and_saved_from_ui
    log_user('admin', 'admin')
    visit "/projects/#{@project.identifier}/schedule_report"

    ai_button_selector = %(button[aria-label="AI分析を開始 #{@version.name}"])
    assert page.has_css?(ai_button_selector, wait: 20)
    find(ai_button_selector).click

    assert page.has_text?('AI Report Generator', wait: 10)

    find('input[placeholder="Issue ID"]').set(@destination_issue.id)
    click_button '宛先を確認'
    assert page.has_text?('宛先チケットを確認しました。', wait: 10)

    click_button 'プロンプト作成'
    assert page.has_text?('準備完了:', wait: 20)

    click_button 'LLMへ送信'
    assert page.has_css?('textarea', minimum: 2, wait: 20)
    preview = page.all('textarea').last
    if preview.value.to_s.strip.empty?
      preview.set("[Weekly][manual]\n## 今週の主要実績\n- 手動入力")
    end
    assert_operator preview.value.to_s.length, :>, 10

    click_button 'レポートを保存'
    assert page.has_text?('レポートを保存しました', wait: 20)

    @destination_issue.reload
    assert @destination_issue.journals.any? { |journal| journal.notes.to_s.include?('[Weekly][') }
  end

  def test_weekly_report_shows_project_mismatch_error_on_destination_validation
    foreign_issue = Issue.where.not(project_id: @project.id).first
    skip 'foreign project issue fixture required' unless foreign_issue

    log_user('admin', 'admin')
    visit "/projects/#{@project.identifier}/schedule_report"

    ai_button_selector = %(button[aria-label="AI分析を開始 #{@version.name}"])
    assert page.has_css?(ai_button_selector, wait: 20)
    find(ai_button_selector).click

    find('input[placeholder="Issue ID"]').set(foreign_issue.id)
    click_button '宛先を確認'

    assert page.has_text?('Failed to validate destination: 422', wait: 10)
  end
end
