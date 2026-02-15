# frozen_string_literal: true

class ScheduleReportsController < ApplicationController
  menu_item :schedule_report
  before_action :find_project, except: %i[bundle_js bundle_css]
  before_action :authorize, except: %i[bundle_js bundle_css]
  skip_after_action :verify_same_origin_request, only: [:bundle_js], raise: false

  def index
    @project = @project
  end

  def data
    selected_project = resolve_selected_project
    filters = RedmineReport::ScheduleReport::FilterParams.new(params)
    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: User.current,
      project: selected_project,
      include_subprojects: filters.include_subprojects
    )

    aggregation = RedmineReport::ScheduleReport::Aggregator.new(
      issues: scope.issues,
      project: selected_project,
      filters: filters,
      visibility_scope: scope
    ).call

    available_projects = RedmineReport::ScheduleReport::ProjectOptionsBuilder.new(
      user: User.current,
      root_project: @project
    ).call

    snapshot = RedmineReport::ScheduleReport::SnapshotBuilder.new(
      rows: aggregation[:rows],
      bars: aggregation[:bars],
      available_projects: available_projects,
      filters: filters,
      selection_summary: aggregation[:selection_summary],
      filter_rule: aggregation[:filter_rule]
    ).call

    render json: snapshot
  rescue StandardError => e
    Rails.logger.error("[schedule_report] #{e.class}: #{e.message}")
    render json: { error: l(:label_schedule_report_unavailable) }, status: :service_unavailable
  end

  def generate
    filters = RedmineReport::ScheduleReport::FilterParams.new(params)
    generator = RedmineReport::Llm::ReportGenerator.new(
      project: @project,
      filters: filters
    )
    report = generator.call
    render json: report
  rescue StandardError => e
    Rails.logger.error("[schedule_report] generate failed: #{e.message}")
    render json: { error: e.message }, status: :internal_server_error
  end

  def weekly_versions
    versions = @project.versions
                       .select(:id, :name, :status)
                       .order(:name)
                       .map do |version|
      {
        id: version.id,
        name: version.name,
        status: version.status,
        ai_action_enabled: true
      }
    end

    render json: { versions: versions }
  rescue StandardError => e
    Rails.logger.error("[schedule_report] weekly_versions failed: #{e.class}: #{e.message}")
    render json: { code: 'UNAVAILABLE', message: l(:label_schedule_report_unavailable) }, status: :service_unavailable
  end

  def weekly_validate_destination
    validator = RedmineReport::WeeklyReport::DestinationValidator.new(
      project: @project,
      user: User.current
    )
    result = validator.call(destination_issue_id: weekly_payload[:destination_issue_id])
    render json: {
      valid: result[:valid],
      reason_code: result[:reason_code],
      reason_message: result[:reason_message]
    }, status: result[:status]
  rescue StandardError => e
    Rails.logger.error("[schedule_report] weekly_validate_destination failed: #{e.class}: #{e.message}")
    render json: { code: 'UNAVAILABLE', message: l(:label_schedule_report_unavailable) }, status: :service_unavailable
  end

  def weekly_generate
    service = RedmineReport::WeeklyReport::GenerateService.new(
      project: @project,
      user: User.current
    )
    result = service.call(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render json: { code: 'INVALID_INPUT', message: e.message }, status: :unprocessable_entity
  rescue StandardError => e
    Rails.logger.error("[schedule_report] weekly_generate failed: #{e.class}: #{e.message}")
    render json: { code: 'UPSTREAM_FAILURE', message: e.message, retryable: true }, status: :service_unavailable
  end

  def weekly_prepare
    service = RedmineReport::WeeklyReport::GenerateService.new(
      project: @project,
      user: User.current
    )
    result = service.prepare(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render json: { code: 'INVALID_INPUT', message: e.message }, status: :unprocessable_entity
  rescue StandardError => e
    Rails.logger.error("[schedule_report] weekly_prepare failed: #{e.class}: #{e.message}")
    render json: { code: 'UPSTREAM_FAILURE', message: e.message, retryable: true }, status: :service_unavailable
  end

  def weekly_save
    service = RedmineReport::WeeklyReport::SaveService.new(
      project: @project,
      user: User.current
    )
    result = service.call(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render json: { code: 'INVALID_INPUT', message: e.message }, status: :unprocessable_entity
  rescue RedmineReport::WeeklyReport::SaveService::DestinationInvalidError => e
    render json: { code: e.code, message: e.message }, status: e.status
  rescue RedmineReport::WeeklyReport::SaveService::RevisionConflictError => e
    render json: { code: 'REVISION_CONFLICT', message: e.message, retryable: true }, status: :conflict
  rescue StandardError => e
    Rails.logger.error("[schedule_report] weekly_save failed: #{e.class}: #{e.message}")
    render json: { code: 'UPSTREAM_FAILURE', message: e.message, retryable: true }, status: :service_unavailable
  end

  def bundle_js
    serve_bundle(
      filename: 'main.js',
      content_type: 'application/javascript',
      fallback_content: "// schedule_report bundle missing\nconsole.warn('schedule_report main.js not found; serving fallback');\n"
    )
  end

  def bundle_css
    serve_bundle(
      filename: 'main.css',
      content_type: 'text/css',
      fallback_content: "/* schedule_report bundle missing */\n.schedule-report-page{font-family:sans-serif;}\n"
    )
  end

  private

  def build_asset_path(filename)
    plugin_root = Rails.root.join('plugins', 'redmine_report')
    primary = plugin_root.join('assets', 'build', filename)
    return primary if File.file?(primary)

    # Fallback for environments where SPA build has not yet been copied.
    legacy = if filename.end_with?('.css')
               plugin_root.join('assets', 'stylesheets', 'schedule_report.css')
             else
               plugin_root.join('assets', 'javascripts', 'schedule_report.js')
             end
    return legacy if File.file?(legacy)

    nil
  end

  def serve_bundle(filename:, content_type:, fallback_content:)
    path = build_asset_path(filename)
    if path
      send_file path, type: content_type, disposition: 'inline'
      return
    end

    Rails.logger.warn("[schedule_report] bundle file not found: #{filename}. serving inline fallback")
    send_data fallback_content, type: content_type, disposition: 'inline'
  end

  def find_project
    identifier = params[:project_id].to_s
    @project = Project.find_by(identifier: identifier) || Project.find_by(id: identifier)
    render_404 unless @project
  end

  def resolve_selected_project
    selected_identifier = params[:selected_project_identifier].to_s.strip
    return @project if selected_identifier.empty?

    selected = Project.find_by(identifier: selected_identifier) || Project.find_by(id: selected_identifier)
    return @project unless selected

    in_scope = (selected.id == @project.id) || @project.descendants.where(id: selected.id).exists?
    return @project unless in_scope
    return @project unless selected.visible?(User.current)

    selected
  end

  def weekly_payload
    @weekly_payload ||= begin
      raw = request.request_parameters.presence || {}
      # Prefer JSON body values over query values while preserving fallback.
      params.to_unsafe_h.merge(raw.to_h).symbolize_keys
    end
  end
end
