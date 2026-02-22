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

  def task_details
    service = RedmineReport::ScheduleReport::TaskDetailsService.new(
      root_project: @project,
      user: User.current
    )
    result = service.call(issue_id: params[:issue_id])

    if result[:ok]
      render json: { issues: result[:issues] }
      return
    end

    render_schedule_report_error(
      code: result[:code],
      message: result[:message],
      status: result[:status],
      retryable: result[:retryable]
    )
  rescue StandardError => e
    Rails.logger.error("[schedule_report] task_details failed: #{e.class}: #{e.message}")
    render_schedule_report_error(
      code: 'UPSTREAM_FAILURE',
      message: l(:label_schedule_report_unavailable),
      status: :service_unavailable,
      retryable: true
    )
  end

  def task_dates
    service = RedmineReport::ScheduleReport::TaskDateUpdateService.new(
      root_project: @project,
      user: User.current
    )
    result = service.call(
      issue_id: params[:issue_id],
      start_date: task_date_payload.fetch(:start_date, RedmineReport::ScheduleReport::TaskDateUpdateService::MISSING),
      due_date: task_date_payload.fetch(:due_date, RedmineReport::ScheduleReport::TaskDateUpdateService::MISSING)
    )

    if result[:ok]
      render json: { issue: result[:issue] }
      return
    end

    render_schedule_report_error(
      code: result[:code],
      message: result[:message],
      status: result[:status],
      retryable: result[:retryable]
    )
  rescue StandardError => e
    Rails.logger.error("[schedule_report] task_dates failed: #{e.class}: #{e.message}")
    render_schedule_report_error(
      code: 'UPSTREAM_FAILURE',
      message: l(:label_schedule_report_unavailable),
      status: :service_unavailable,
      retryable: true
    )
  end

  def task_masters
    service = RedmineReport::ScheduleReport::TaskMastersService.new(
      project: @project,
      user: User.current
    )
    result = service.call

    if result[:ok]
      render json: result.slice(:trackers, :statuses, :priorities, :members)
      return
    end

    render_schedule_report_error(
      code: result[:code],
      message: result[:message],
      status: result[:status]
    )
  rescue StandardError => e
    Rails.logger.error("[schedule_report] task_masters failed: #{e.class}: #{e.message}")
    render_schedule_report_error(
      code: 'UPSTREAM_FAILURE',
      message: l(:label_schedule_report_unavailable),
      status: :service_unavailable
    )
  end

  def task_update
    service = RedmineReport::ScheduleReport::TaskUpdateService.new(
      root_project: @project,
      user: User.current
    )
    result = service.call(
      issue_id: params[:issue_id],
      fields: task_update_payload
    )

    if result[:ok]
      render json: { issue: result[:issue] }
      return
    end

    render_schedule_report_error(
      code: result[:code],
      message: result[:message],
      status: result[:status],
      retryable: result[:retryable]
    )
  rescue StandardError => e
    Rails.logger.error("[schedule_report] task_update failed: #{e.class}: #{e.message}")
    render_schedule_report_error(
      code: 'UPSTREAM_FAILURE',
      message: l(:label_schedule_report_unavailable),
      status: :service_unavailable,
      retryable: true
    )
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
    render_weekly_unavailable_error(action_name: __method__, exception: e)
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
    render_weekly_unavailable_error(action_name: __method__, exception: e)
  end

  def weekly_generate
    service = RedmineReport::WeeklyReport::GenerateService.new(
      project: @project,
      user: User.current
    )
    result = service.call(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.invalid_input(e.message))
  rescue StandardError => e
    render_weekly_upstream_failure(action_name: __method__, exception: e)
  end

  def weekly_prepare
    service = RedmineReport::WeeklyReport::GenerateService.new(
      project: @project,
      user: User.current
    )
    result = service.prepare(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.invalid_input(e.message))
  rescue StandardError => e
    render_weekly_upstream_failure(action_name: __method__, exception: e)
  end

  def weekly_save
    service = RedmineReport::WeeklyReport::SaveService.new(
      project: @project,
      user: User.current
    )
    result = service.call(weekly_payload)
    render json: result
  rescue RedmineReport::WeeklyReport::RequestValidator::ValidationError => e
    render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.invalid_input(e.message))
  rescue RedmineReport::WeeklyReport::SaveService::DestinationInvalidError => e
    render_weekly_payload(
      RedmineReport::WeeklyReport::ErrorPayloadBuilder.destination_invalid(
        code: e.code,
        message: e.message,
        status: e.status
      )
    )
  rescue RedmineReport::WeeklyReport::SaveService::RevisionConflictError => e
    render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.revision_conflict(e.message))
  rescue StandardError => e
    render_weekly_upstream_failure(action_name: __method__, exception: e)
  end

  def weekly_ai_responses
    service = RedmineReport::ScheduleReport::AiResponseFetchService.new(
      root_project: @project,
      user: User.current,
      selected_project_identifier: params[:selected_project_identifier],
      selected_version_id: params[:selected_version_id]
    )

    render json: service.call
  rescue StandardError => e
    log_weekly_error(action_name: __method__, exception: e)
    render_weekly_payload(
      RedmineReport::WeeklyReport::ErrorPayloadBuilder.upstream_unavailable(l(:label_schedule_report_unavailable))
    )
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

  def render_weekly_unavailable_error(action_name:, exception:)
    log_weekly_error(action_name: action_name, exception: exception)
    render_weekly_payload(
      RedmineReport::WeeklyReport::ErrorPayloadBuilder.unavailable(l(:label_schedule_report_unavailable))
    )
  end

  def render_weekly_upstream_failure(action_name:, exception:)
    log_weekly_error(action_name: action_name, exception: exception)
    render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.upstream_failure(exception.message))
  end

  def render_weekly_payload(payload)
    render json: payload[:json], status: payload[:status]
  end

  def log_weekly_error(action_name:, exception:)
    Rails.logger.error("[schedule_report] #{action_name} failed: #{exception.class}: #{exception.message}")
  end

  def render_schedule_report_error(code:, message:, status:, retryable: nil)
    payload = { code: code, message: message }
    payload[:retryable] = retryable unless retryable.nil?
    render json: payload, status: status
  end

  def task_date_payload
    payload = {}

    permitted = params.permit(:start_date, :due_date).to_h
    payload[:start_date] = permitted['start_date'] if permitted.key?('start_date')
    payload[:due_date] = permitted['due_date'] if permitted.key?('due_date')

    # Fallback for environments where request parameter parsing differs by content-type.
    if payload.empty?
      raw = request.request_parameters.presence || {}
      payload[:start_date] = raw['start_date'] if raw.key?('start_date')
      payload[:due_date] = raw['due_date'] if raw.key?('due_date')
    end

    payload
  end

  def task_update_payload
    raw = request.request_parameters.presence || {}
    raw.slice(*RedmineReport::ScheduleReport::TaskUpdateService::ALLOWED_FIELDS)
  rescue StandardError
    {}
  end
end
