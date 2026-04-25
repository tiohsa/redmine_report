# frozen_string_literal: true

class ScheduleReportsController < ApplicationController
  menu_item :schedule_report
  before_action :find_project, except: %i[bundle_js bundle_css]
  before_action :authorize, except: %i[bundle_js bundle_css]
  skip_after_action :verify_same_origin_request, only: [:bundle_js], raise: false

  def index
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
    run_schedule_report_service_action(
      service: RedmineReport::ScheduleReport::TaskDetailsService.new(
        root_project: @project,
        user: User.current
      ),
      service_call: ->(service) { service.call(issue_id: params[:issue_id]) },
      success_payload: ->(result) { { issues: result[:issues] } },
      action_name: __method__,
      retryable: true
    )
  end

  def child_issues
    run_schedule_report_service_action(
      service: RedmineReport::ScheduleReport::ChildIssuesService.new(
        root_project: @project,
        user: User.current
      ),
      service_call: ->(service) { service.call(parent_issue_ids: child_issues_payload[:parent_issue_ids]) },
      success_payload: ->(result) { { items: result[:items] } },
      action_name: __method__,
      retryable: true
    )
  end

  def task_dates
    run_schedule_report_service_action(
      service: RedmineReport::ScheduleReport::TaskDateUpdateService.new(
        root_project: @project,
        user: User.current
      ),
      service_call: lambda { |service|
        service.call(
          issue_id: params[:issue_id],
          start_date: task_date_payload.fetch(:start_date, RedmineReport::ScheduleReport::TaskDateUpdateService::MISSING),
          due_date: task_date_payload.fetch(:due_date, RedmineReport::ScheduleReport::TaskDateUpdateService::MISSING)
        )
      },
      success_payload: ->(result) { { issue: result[:issue] } },
      action_name: __method__,
      retryable: true
    )
  end

  def task_masters
    run_schedule_report_service_action(
      service: RedmineReport::ScheduleReport::TaskMastersService.new(
        project: @project,
        user: User.current
      ),
      service_call: ->(service) { service.call },
      success_payload: ->(result) { result.slice(:trackers, :statuses, :priorities, :members) },
      action_name: __method__
    )
  end

  def update_journal
    result = RedmineReport::ScheduleReport::JournalUpdateService.new(
      user: User.current
    ).call(journal_id: params[:journal_id], notes: params[:notes])

    render_schedule_report_result(result, success_payload: { ok: true })
  end

  def task_update
    run_schedule_report_service_action(
      service: RedmineReport::ScheduleReport::TaskUpdateService.new(
        root_project: @project,
        user: User.current
      ),
      service_call: ->(service) { service.call(issue_id: params[:issue_id], fields: task_update_payload) },
      success_payload: ->(result) { { issue: result[:issue] } },
      action_name: __method__,
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
    run_weekly_service_action(
      service_class: RedmineReport::WeeklyReport::GenerateService,
      service_method: :call,
      action_name: __method__
    )
  end

  def weekly_prepare
    run_weekly_service_action(
      service_class: RedmineReport::WeeklyReport::GenerateService,
      service_method: :prepare,
      action_name: __method__
    )
  end

  def weekly_save
    run_weekly_service_action(
      service_class: RedmineReport::WeeklyReport::SaveService,
      service_method: :call,
      action_name: __method__,
      rescue_handlers: {
        RedmineReport::WeeklyReport::SaveService::DestinationInvalidError => lambda { |error|
          render_weekly_payload(
            RedmineReport::WeeklyReport::ErrorPayloadBuilder.destination_invalid(
              code: error.code,
              message: error.message,
              status: error.status
            )
          )
        },
        RedmineReport::WeeklyReport::SaveService::RevisionConflictError => lambda { |error|
          render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.revision_conflict(error.message))
        }
      }
    )
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
      # Prefer JSON body values over query values while preserving fallback.
      params.to_unsafe_h.merge(request_payload).symbolize_keys
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

  def run_weekly_service_action(service_class:, service_method:, action_name:, rescue_handlers: {})
    result = build_weekly_service(service_class).public_send(service_method, weekly_payload)
    render json: result
  rescue StandardError => e
    if e.is_a?(RedmineReport::WeeklyReport::RequestValidator::ValidationError)
      render_weekly_payload(RedmineReport::WeeklyReport::ErrorPayloadBuilder.invalid_input(e.message))
      return
    end

    handler = weekly_rescue_handler_for(exception: e, rescue_handlers: rescue_handlers)
    if handler
      instance_exec(e, &handler)
      return
    end

    render_weekly_upstream_failure(action_name: action_name, exception: e)
  end

  def build_weekly_service(service_class)
    service_class.new(project: @project, user: User.current)
  end

  def weekly_rescue_handler_for(exception:, rescue_handlers:)
    _, handler = rescue_handlers.find { |error_class, _callable| exception.is_a?(error_class) }
    handler
  end

  def log_weekly_error(action_name:, exception:)
    Rails.logger.error("[schedule_report] #{action_name} failed: #{exception.class}: #{exception.message}")
  end

  def render_schedule_report_error(code:, message:, status:, retryable: nil)
    payload = { code: code, message: message }
    payload[:retryable] = retryable unless retryable.nil?
    render json: payload, status: status
  end

  def render_schedule_report_result(result, success_payload:)
    if result[:ok]
      render json: success_payload
      return
    end

    render_schedule_report_error(
      code: result[:code],
      message: result[:message],
      status: result[:status],
      retryable: result[:retryable]
    )
  end

  def render_schedule_report_upstream_failure(action_name:, exception:, code:, message:, status:, retryable: nil)
    Rails.logger.error("[schedule_report] #{action_name} failed: #{exception.class}: #{exception.message}")
    render_schedule_report_error(
      code: code,
      message: message,
      status: status,
      retryable: retryable
    )
  end

  def run_schedule_report_service_action(service:, service_call:, success_payload:, action_name:, retryable: nil)
    result = service_call.call(service)
    render_schedule_report_result(result, success_payload: success_payload.call(result))
  rescue StandardError => e
    render_schedule_report_upstream_failure(
      action_name: action_name,
      exception: e,
      code: 'UPSTREAM_FAILURE',
      message: l(:label_schedule_report_unavailable),
      status: :service_unavailable,
      retryable: retryable
    )
  end

  def task_date_payload
    permitted = params.permit(:start_date, :due_date).to_h
    payload = extract_keys(permitted, %w[start_date due_date])

    # Fallback for environments where request parameter parsing differs by content-type.
    return payload unless payload.empty?

    extract_keys(request_payload, %w[start_date due_date])
  end

  def task_update_payload
    request_payload.slice(*%w[subject tracker_id status_id priority_id assigned_to_id done_ratio description notes])
  end

  def child_issues_payload
    merged = request_payload.merge(params.permit(parent_issue_ids: [])&.to_h || {})
    ids = Array(merged['parent_issue_ids'] || merged[:parent_issue_ids])
    { parent_issue_ids: ids }
  end

  def request_payload
    @request_payload ||= begin
      raw = request.request_parameters.presence || {}
      raw.to_h
    rescue StandardError
      {}
    end
  end

  def extract_keys(source, keys)
    keys.each_with_object({}) do |key, payload|
      payload[key.to_sym] = source[key] if source.key?(key)
      payload[key.to_sym] = source[key.to_sym] if source.key?(key.to_sym)
    end
  rescue StandardError
    {}
  end
end
