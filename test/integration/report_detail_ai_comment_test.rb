# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ReportDetailAiCommentTest < ActiveSupport::TestCase
  def test_route_for_ai_comment_endpoint_exists
    assert_recognizes(
      { controller: 'schedule_reports', action: 'report_detail_ai_comment', project_id: 'ecookbook' },
      { path: '/projects/ecookbook/schedule_report/report_detail/ai_comment', method: :post }
    )
  end

  def test_permission_includes_ai_comment_action
    permission = Redmine::AccessControl.permission(:view_schedule_report)

    assert_not_nil permission
    assert_includes permission.actions.map(&:to_s), 'schedule_reports/report_detail_ai_comment'
  end
end
