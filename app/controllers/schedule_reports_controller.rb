# frozen_string_literal: true

class ScheduleReportsController < ApplicationController
  before_action :find_project, except: %i[bundle_js bundle_css]
  before_action :authorize, except: %i[bundle_js bundle_css]
  skip_after_action :verify_same_origin_request, only: [:bundle_js], raise: false

  def index
    @project = @project
  end

  def data
    filters = RedmineReport::ScheduleReport::FilterParams.new(params)
    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: User.current,
      project: @project,
      include_subprojects: filters.include_subprojects
    )

    aggregation = RedmineReport::ScheduleReport::Aggregator.new(
      issues: scope.issues,
      project: @project,
      filters: filters
    ).call

    snapshot = RedmineReport::ScheduleReport::SnapshotBuilder.new(
      rows: aggregation[:rows],
      bars: aggregation[:bars],
      filters: filters
    ).call

    render json: snapshot
  rescue StandardError => e
    Rails.logger.error("[schedule_report] #{e.class}: #{e.message}")
    render json: { error: l(:label_schedule_report_unavailable) }, status: :service_unavailable
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
end
