# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportFoundationTest < ActiveSupport::TestCase
  def test_filter_params_defaults
    filters = RedmineReport::ScheduleReport::FilterParams.new({})

    assert_equal true, filters.include_subprojects
    assert_equal 4, filters.months
    assert_equal 'open', filters.status_scope
    assert_match(/^\d{4}-\d{2}$/, filters.start_month)
  end

  def test_filter_params_months_clamped
    filters = RedmineReport::ScheduleReport::FilterParams.new(months: 100)
    assert_equal 12, filters.months
  end
end
