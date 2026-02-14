# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class WeeklyReportGenerationTest < ActiveSupport::TestCase
  def test_request_validator_rejects_invalid_week_range
    validator = RedmineReport::WeeklyReport::RequestValidator.new

    assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      validator.validate_generate!(
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-16',
        week_to: '2026-02-09'
      )
    end
  end

  def test_generate_service_emits_required_sections
    project = Project.find_by(identifier: 'ecookbook') || Project.first
    skip 'project fixture required' unless project

    version = project.versions.first
    skip 'version fixture required' unless version

    service = RedmineReport::WeeklyReport::GenerateService.new(project: project, user: User.current)
    payload = {
      project_id: project.id,
      version_id: version.id,
      week_from: Date.current.beginning_of_week.to_s,
      week_to: Date.current.end_of_week.to_s,
      top_topics_limit: 10,
      top_tickets_limit: 30
    }

    result = service.call(payload)

    assert result[:header_preview]
    assert result[:kpi]
    assert_includes result[:markdown], '今週の主要実績'
    assert_includes result[:markdown], '課題・リスク'
  end
end
