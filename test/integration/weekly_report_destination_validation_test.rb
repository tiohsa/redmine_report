# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class WeeklyReportDestinationValidationTest < ActiveSupport::TestCase
  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
  end

  def test_returns_not_found_for_missing_issue
    skip 'project fixture required' unless @project

    validator = RedmineReport::WeeklyReport::DestinationValidator.new(project: @project, user: User.current)
    result = validator.call(destination_issue_id: -9_999)

    assert_equal false, result.valid
    assert_equal 'NOT_FOUND', result.reason_code
  end

  def test_returns_invalid_input_for_non_integer_issue_id
    skip 'project fixture required' unless @project

    validator = RedmineReport::WeeklyReport::DestinationValidator.new(project: @project, user: User.current)
    result = validator.call(destination_issue_id: 'abc')

    assert_equal false, result.valid
    assert_equal 'INVALID_INPUT', result.reason_code
  end
end
