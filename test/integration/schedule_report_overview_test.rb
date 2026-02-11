# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportOverviewTest < Redmine::IntegrationTest
  fixtures :projects, :users, :members, :member_roles, :roles

  def test_route_exists_for_schedule_report
    assert_recognizes(
      { controller: 'schedule_reports', action: 'index', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report'
    )
  end
end
