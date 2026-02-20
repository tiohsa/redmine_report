# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportAuthorizationTest < Redmine::IntegrationTest
  fixtures :projects, :users

  def test_route_for_data_endpoint_exists
    assert_recognizes(
      { controller: 'schedule_reports', action: 'data', project_id: 'ecookbook' },
      '/projects/ecookbook/schedule_report/data'
    )
  end

  def test_permission_includes_task_dialog_actions
    permission = Redmine::AccessControl.permission(:view_schedule_report)

    assert_not_nil permission
    actions = permission.actions.map(&:to_s)
    assert_includes actions, 'schedule_reports/task_details'
    assert_includes actions, 'schedule_reports/task_dates'
  end
end
