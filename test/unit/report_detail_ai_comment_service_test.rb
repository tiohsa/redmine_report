# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ReportDetailAiCommentServiceTest < ActiveSupport::TestCase
  fixtures :projects, :users, :issues, :journals, :roles, :members, :member_roles

  def setup
    @user = User.find(2)
    @project = Project.find(1)
    @service = RedmineReport::ScheduleReport::ReportDetailAiCommentService.new(project: @project, user: @user)
    @version = @project.versions.first
  end

  def base_payload(issue_id:)
    skip 'version fixture required' unless @version

    {
      destination_issue_id: issue_id,
      project_id: @project.id,
      version_id: @version.id,
      week_from: Date.current.beginning_of_week.to_s,
      week_to: Date.current.end_of_week.to_s,
      week: '2026-W07',
      markdown: "# AI report\n\n- Item 1",
      generated_at: '2026-02-15T10:00:00+09:00'
    }
  end

  def test_creates_new_journal_comment
    issue = issues(:issues_001)
    initial_journal_count = issue.journals.count

    result = @service.call(**base_payload(issue_id: issue.id))

    assert result[:saved], "Expected saved to be true, got: #{result.inspect}"
    assert_not_nil result[:saved_at]
    assert_equal issue.id, result[:destination_issue_id]

    issue.reload
    assert_equal initial_journal_count + 1, issue.journals.count

    last_note = issue.journals.last.notes
    assert_includes last_note, '[Weekly][2026-W07]'
    assert_includes last_note, 'project_id='
    assert_includes last_note, 'version_id='
    assert_includes last_note, '# AI report'
    assert_includes last_note, '- Item 1'
  end

  def test_returns_error_for_missing_issue
    result = @service.call(**base_payload(issue_id: 999_999))

    assert_not result[:saved]
    assert_equal 'NOT_FOUND', result[:error_code]
  end

  def test_returns_error_for_invalid_project
    issue = issues(:issues_001)
    result = @service.call(
      destination_issue_id: issue.id,
      project_id: @project.id + 100,
      version_id: @version&.id || 1,
      week_from: Date.current.beginning_of_week.to_s,
      week_to: Date.current.end_of_week.to_s,
      week: '2026-W07',
      markdown: '# AI report',
      generated_at: '2026-02-15T10:00:00+09:00'
    )

    assert_not result[:saved]
    assert_equal 'INVALID_INPUT', result[:error_code]
  end
end
