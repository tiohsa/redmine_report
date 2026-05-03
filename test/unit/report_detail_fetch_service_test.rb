# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ReportDetailFetchServiceTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :journals, :roles, :members, :member_roles

  def setup
    @user = User.find(2) # regular user
    @project = Project.find(1)
    @service = RedmineReport::ScheduleReport::ReportDetailFetchService.new(user: @user)
  end

  def test_returns_not_saved_when_no_destination_issue
    result = @service.call(destination_issue_id: nil, targets: [{ project_id: 1, version_id: 10 }])
    assert_equal 'NOT_SAVED', result[:status]
    assert_equal ['該当なし'], result[:highlights_this_week]
  end

  def test_returns_error_when_issue_not_found
    result = @service.call(destination_issue_id: 999_999, targets: [{ project_id: 1, version_id: 10 }])
    assert_equal 'ERROR', result[:status]
    assert_equal 'NOT_FOUND', result[:error_code]
  end

  def test_returns_not_saved_when_no_matching_journals
    issue = issues(:issues_001)
    result = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: 1, version_id: 10 }]
    )
    assert_equal 'NOT_SAVED', result[:status]
    assert_equal issue.id, result[:destination_issue_id]
  end

  def test_returns_not_saved_when_empty_targets
    issue = issues(:issues_001)
    result = @service.call(
      destination_issue_id: issue.id,
      targets: []
    )
    assert_equal 'NOT_SAVED', result[:status]
  end

  def test_fetches_latest_matching_journal
    issue = issues(:issues_001)

    # Create a Weekly journal note
    note = <<~MD
      [Weekly][2026-W18] project_id=#{issue.project_id} version_id=1 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Test achievement

      ## 来週の予定・アクション
      - Test plan

      ## 課題・リスク
      - Test risk

      ## 決定事項
      - Test decision
    MD

    journal = issue.init_journal(@user, note)
    issue.save!

    result = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }]
    )

    assert_equal 'AVAILABLE', result[:status]
    assert_equal ['Test achievement'], result[:highlights_this_week]
    assert_equal ['Test plan'], result[:next_week_actions]
    assert_equal ['Test risk'], result[:risks]
    assert_equal ['Test decision'], result[:decisions]
    assert_equal issue.id, result[:destination_issue_id]
  end

  def test_ignores_non_matching_project_version
    issue = issues(:issues_001)

    note = <<~MD
      [Weekly][2026-W18] project_id=999 version_id=888 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Should not match

      ## 来週の予定・アクション
      - Nope

      ## 課題・リスク
      - Nope

      ## 決定事項
      - Nope
    MD

    issue.init_journal(@user, note)
    issue.save!

    result = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }]
    )

    assert_equal 'NOT_SAVED', result[:status]
  end

  def test_returns_error_for_invalid_issue_id
    result = @service.call(
      destination_issue_id: 'not_a_number',
      targets: [{ project_id: 1, version_id: 10 }]
    )
    assert_equal 'ERROR', result[:status]
    assert_equal 'INVALID_INPUT', result[:error_code]
  end
end
