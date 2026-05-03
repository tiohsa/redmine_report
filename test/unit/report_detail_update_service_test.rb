# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ReportDetailUpdateServiceTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :journals, :roles, :members, :member_roles

  def setup
    @user = User.find(2) # regular user
    @project = Project.find(1)
    @service = RedmineReport::ScheduleReport::ReportDetailUpdateService.new(user: @user)
  end

  def test_creates_new_journal_note
    issue = issues(:issues_001)
    initial_journal_count = issue.journals.count

    result = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }],
      highlights_this_week: ['Achievement 1', 'Achievement 2'],
      next_week_actions: ['Plan A'],
      risks: ['Risk X'],
      decisions: ['Decision Y']
    )

    assert result[:saved], "Expected saved to be true, got: #{result.inspect}"
    assert_not_nil result[:saved_at]
    assert_equal issue.id, result[:destination_issue_id]

    issue.reload
    assert_equal initial_journal_count + 1, issue.journals.count

    last_note = issue.journals.last.notes
    assert_includes last_note, '[Weekly]['
    assert_includes last_note, '## 今週の主要実績'
    assert_includes last_note, '- Achievement 1'
    assert_includes last_note, '- Achievement 2'
    assert_includes last_note, '## 来週の予定・アクション'
    assert_includes last_note, '- Plan A'
    assert_includes last_note, '## 課題・リスク'
    assert_includes last_note, '- Risk X'
    assert_includes last_note, '## 決定事項'
    assert_includes last_note, '- Decision Y'
  end

  def test_normalizes_empty_sections
    issue = issues(:issues_001)

    result = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }],
      highlights_this_week: ['Item'],
      next_week_actions: [],
      risks: [],
      decisions: []
    )

    assert result[:saved]

    issue.reload
    last_note = issue.journals.last.notes
    assert_includes last_note, '- Item'
    # Empty sections should be normalized to '- 該当なし'
    occurrences = last_note.scan('- 該当なし').count
    assert_operator occurrences, :>=, 3, 'Expected at least 3 empty section placeholders'
  end

  def test_increments_revision
    issue = issues(:issues_001)

    # First save
    result1 = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }],
      highlights_this_week: ['First'],
      next_week_actions: ['First'],
      risks: ['First'],
      decisions: ['First']
    )
    assert result1[:saved]
    assert_equal 1, result1[:revision]

    # Second save
    issue.reload
    result2 = @service.call(
      destination_issue_id: issue.id,
      targets: [{ project_id: issue.project_id, version_id: 1 }],
      highlights_this_week: ['Second'],
      next_week_actions: ['Second'],
      risks: ['Second'],
      decisions: ['Second']
    )
    assert result2[:saved]
    assert_equal 2, result2[:revision]
  end

  def test_returns_error_for_missing_issue
    result = @service.call(
      destination_issue_id: 999_999,
      targets: [{ project_id: 1, version_id: 1 }],
      highlights_this_week: ['Item'],
      next_week_actions: [],
      risks: [],
      decisions: []
    )

    assert_not result[:saved]
    assert_equal 'NOT_FOUND', result[:error_code]
  end

  def test_returns_error_for_empty_targets
    issue = issues(:issues_001)

    result = @service.call(
      destination_issue_id: issue.id,
      targets: [],
      highlights_this_week: ['Item'],
      next_week_actions: [],
      risks: [],
      decisions: []
    )

    assert_not result[:saved]
    assert_equal 'INVALID_INPUT', result[:error_code]
  end

  def test_returns_error_for_nil_destination
    result = @service.call(
      destination_issue_id: nil,
      targets: [{ project_id: 1, version_id: 1 }],
      highlights_this_week: ['Item'],
      next_week_actions: [],
      risks: [],
      decisions: []
    )

    assert_not result[:saved]
    assert_equal 'INVALID_INPUT', result[:error_code]
  end
end
