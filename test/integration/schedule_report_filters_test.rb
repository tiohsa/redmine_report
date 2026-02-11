# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportFiltersTest < Redmine::IntegrationTest
  def test_data_route_accepts_filter_params
    assert_recognizes(
      { controller: 'schedule_reports', action: 'data', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/data'
    )
  end
end
