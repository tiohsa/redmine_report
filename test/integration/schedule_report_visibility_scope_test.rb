# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportVisibilityScopeTest < ActiveSupport::TestCase
  fixtures :projects, :users

  def test_visibility_scope_returns_issue_relation
    project = Project.find(1)
    user = User.find(1)

    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: user,
      project: project,
      include_subprojects: true
    )

    assert_respond_to scope.issues, :where
  end
end
