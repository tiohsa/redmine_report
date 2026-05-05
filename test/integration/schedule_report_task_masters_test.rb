# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)
require 'json'

class ScheduleReportTaskMastersTest < Redmine::IntegrationTest
  fixtures :projects, :users

  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
    @admin = User.find_by(login: 'admin')
  end

  def test_task_masters_returns_payload_instead_of_service_unavailable
    skip 'project fixture required' unless @project
    skip 'admin fixture required' unless @admin

    log_user(@admin.login, 'admin')

    RedmineReport::ScheduleReport::TaskMastersService.any_instance.stubs(:call).returns(
      RedmineReport::ScheduleReport::ServiceResult.success(
        trackers: [{ id: 1, name: 'Task' }],
        statuses: [{ id: 2, name: 'Open', is_closed: false }],
        priorities: [{ id: 3, name: 'Normal' }],
        members: [{ id: nil, name: '' }]
      )
    )

    get project_schedule_report_task_masters_path(@project),
        params: { project_id: @project.id },
        as: :json

    assert_response :success
    assert_equal(
      {
        'trackers' => [{ 'id' => 1, 'name' => 'Task' }],
        'statuses' => [{ 'id' => 2, 'name' => 'Open', 'is_closed' => false }],
        'priorities' => [{ 'id' => 3, 'name' => 'Normal' }],
        'members' => [{ 'id' => nil, 'name' => '' }]
      },
      response_json
    )
  end

  private

  def response_json
    JSON.parse(response.body)
  end
end
