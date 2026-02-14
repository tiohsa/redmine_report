# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class WeeklyReportLoggingTest < ActiveSupport::TestCase
  def test_destination_validator_reports_invalid_input_without_exception
    project = Project.find_by(identifier: 'ecookbook') || Project.first
    skip 'project fixture required' unless project

    validator = RedmineReport::WeeklyReport::DestinationValidator.new(project: project, user: User.current)
    result = validator.call(destination_issue_id: 'not-integer')

    assert_equal false, result.valid
    assert_equal 'INVALID_INPUT', result.reason_code
  end

  def test_overflow_handler_limits_note_size
    handler = RedmineReport::WeeklyReport::OverflowHandler.new
    payload = handler.call(markdown: 'x' * 30_000, header: '[Weekly][2026-W07] project_id=1 version_id=1 revision=1 generated_at=...')

    assert_equal 'NOTE_WITH_ATTACHMENT', payload[:mode]
    assert payload[:note].length < 20_000
  end
end
