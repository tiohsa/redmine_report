# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportFiltersTest < Redmine::IntegrationTest
  def test_data_route_accepts_filter_params
    assert_recognizes(
      { controller: 'schedule_reports', action: 'data', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/data'
    )
  end

  def test_filter_params_normalizes_include_subprojects_and_status_scope
    filters = RedmineReport::ScheduleReport::FilterParams.new(
      include_subprojects: '1',
      status_scope: 'all',
      months: '3'
    )

    assert_equal true, filters.include_subprojects
    assert_equal 'all', filters.status_scope
    assert_equal 3, filters.months
  end
end
