# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportVisibilityScopeTest < ActiveSupport::TestCase
  DummyDescendants = Struct.new(:ids) do
    def pluck(_column)
      ids
    end
  end

  DummyProject = Struct.new(:id, :descendants)

  def test_project_ids_include_all_descendants_when_enabled
    project = DummyProject.new(10, DummyDescendants.new([11, 12, 13]))
    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: nil,
      project: project,
      include_subprojects: true
    )

    assert_equal [10, 11, 12, 13], scope.project_ids
  end

  def test_project_ids_only_root_when_subprojects_disabled
    project = DummyProject.new(10, DummyDescendants.new([11, 12, 13]))
    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: nil,
      project: project,
      include_subprojects: false
    )

    assert_equal [10], scope.project_ids
  end
end
