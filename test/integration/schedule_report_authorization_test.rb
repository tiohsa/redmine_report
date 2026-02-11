# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportAuthorizationTest < Redmine::IntegrationTest
  fixtures :projects, :users

  def test_route_for_data_endpoint_exists
    assert_recognizes(
      { controller: 'schedule_reports', action: 'data', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/data'
    )
  end
end
