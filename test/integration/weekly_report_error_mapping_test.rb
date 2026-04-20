# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)
require 'json'

class WeeklyReportErrorMappingTest < Redmine::IntegrationTest
  fixtures :projects, :users, :enabled_modules, :versions

  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
    @admin = User.find_by(login: 'admin')
  end

  def test_weekly_generate_maps_validation_error_to_invalid_input_payload
    skip 'project fixture required' unless @project
    skip 'admin fixture required' unless @admin

    log_user(@admin.login, 'admin')

    post project_schedule_report_weekly_generate_path(@project),
         params: {
           project_id: @project.id,
           week_from: '2026-02-17',
           week_to: '2026-02-24'
         },
         as: :json

    assert_response :unprocessable_entity
    assert_equal(
      {
        'code' => 'INVALID_INPUT',
        'message' => 'version_id is required'
      },
      response_json
    )
  end

  def test_weekly_prepare_maps_unexpected_failure_to_upstream_failure_payload
    skip 'project fixture required' unless @project
    skip 'admin fixture required' unless @admin

    log_user(@admin.login, 'admin')

    RedmineReport::WeeklyReport::GenerateService.any_instance.stubs(:prepare).raises(StandardError, 'LLM backend offline')

    post project_schedule_report_weekly_prepare_path(@project),
         params: valid_generate_payload,
         as: :json

    assert_response :service_unavailable
    assert_equal(
      {
        'code' => 'UPSTREAM_FAILURE',
        'message' => 'LLM backend offline',
        'retryable' => true
      },
      response_json
    )
  end

  def test_weekly_save_maps_destination_invalid_error_payload
    skip 'project fixture required' unless @project
    skip 'admin fixture required' unless @admin

    log_user(@admin.login, 'admin')

    RedmineReport::WeeklyReport::SaveService.any_instance.stubs(:call).raises(
      RedmineReport::WeeklyReport::SaveService::DestinationInvalidError.new(
        code: 'PROJECT_MISMATCH',
        status: 422,
        message: 'Destination issue must belong to selected project'
      )
    )

    post project_schedule_report_weekly_save_path(@project),
         params: valid_save_payload,
         as: :json

    assert_response :unprocessable_entity
    assert_equal(
      {
        'code' => 'PROJECT_MISMATCH',
        'message' => 'Destination issue must belong to selected project'
      },
      response_json
    )
  end

  def test_weekly_save_maps_revision_conflict_payload
    skip 'project fixture required' unless @project
    skip 'admin fixture required' unless @admin

    log_user(@admin.login, 'admin')

    RedmineReport::WeeklyReport::SaveService.any_instance.stubs(:call).raises(
      RedmineReport::WeeklyReport::SaveService::RevisionConflictError,
      'Could not resolve revision conflict after retries'
    )

    post project_schedule_report_weekly_save_path(@project),
         params: valid_save_payload,
         as: :json

    assert_response :conflict
    assert_equal(
      {
        'code' => 'REVISION_CONFLICT',
        'message' => 'Could not resolve revision conflict after retries',
        'retryable' => true
      },
      response_json
    )
  end

  private

  def valid_generate_payload
    version = @project.versions.first || Version.first
    skip 'version fixture required' unless version

    {
      project_id: @project.id,
      version_id: version.id,
      week_from: '2026-02-17',
      week_to: '2026-02-24'
    }
  end

  def valid_save_payload
    valid_generate_payload.merge(
      destination_issue_id: 1,
      markdown: '# weekly report',
      week: '2026-W08',
      generated_at: '2026-02-24T09:00:00+09:00'
    )
  end

  def response_json
    JSON.parse(response.body)
  end
end
