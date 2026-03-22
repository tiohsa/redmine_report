# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class RequestValidatorTest < ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers

  def setup
    @validator = RedmineReport::WeeklyReport::RequestValidator.new
  end

  def test_validate_generate_applies_defaults_and_caps_limits
    result = @validator.validate_generate!(
      project_id: 1,
      version_id: 2,
      week_from: '2026-02-09',
      week_to: '2026-02-15',
      top_topics_limit: 99,
      top_tickets_limit: 50
    )

    assert_equal 1, result[:project_id]
    assert_equal 2, result[:version_id]
    assert_equal Date.new(2026, 2, 9), result[:week_from]
    assert_equal Date.new(2026, 2, 15), result[:week_to]
    assert_equal 10, result[:top_topics_limit]
    assert_equal 30, result[:top_tickets_limit]
  end

  def test_validate_generate_uses_default_limits_when_not_provided
    result = @validator.validate_generate!(
      project_id: 1,
      version_id: 2,
      week_from: '2026-02-09',
      week_to: '2026-02-15'
    )

    assert_equal 10, result[:top_topics_limit]
    assert_equal 30, result[:top_tickets_limit]
  end

  def test_validate_save_sets_generated_at_when_blank
    travel_to Time.zone.parse('2026-02-18 10:30:00 UTC') do
      result = @validator.validate_save!(
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-09',
        week_to: '2026-02-15',
        destination_issue_id: 100,
        markdown: '# report',
        week: '2026-W07',
        generated_at: ''
      )

      assert_equal '2026-W07', result[:week]
      assert_equal 100, result[:destination_issue_id]
      assert_equal '# report', result[:markdown]
      assert_equal Time.current.iso8601, result[:generated_at]
    end
  end

  def test_validate_save_requires_destination_issue_id
    error = assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      @validator.validate_save!(
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-09',
        week_to: '2026-02-15',
        markdown: '# report',
        week: '2026-W07'
      )
    end

    assert_equal 'destination_issue_id is required', error.message
  end

  def test_validate_generate_rejects_inverted_week_range
    error = assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      @validator.validate_generate!(
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-16',
        week_to: '2026-02-15'
      )
    end

    assert_equal 'week_from must be before week_to', error.message
  end
end
