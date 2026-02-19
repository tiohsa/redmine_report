# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportOverviewTest < Redmine::IntegrationTest
  def test_route_exists_for_schedule_report
    assert_recognizes(
      { controller: 'schedule_reports', action: 'index', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report'
    )
  end

  def test_data_route_keeps_project_context
    assert_recognizes(
      { controller: 'schedule_reports', action: 'data', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/data'
    )
  end
end
