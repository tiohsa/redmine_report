# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportVisibilityScopeTest < ActiveSupport::TestCase
  DummyDescendants = Struct.new(:ids) do
    def pluck(_column)
      ids
    end
  end

  DummyProject = Struct.new(:id, :descendants)
  DummyIssue = Struct.new(:id, :root_id)

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

  def test_select_visible_top_level_parents_excludes_invisible_roots
    project = DummyProject.new(10, DummyDescendants.new([11]))
    scope = RedmineReport::ScheduleReport::VisibilityScope.new(
      user: :dummy_user,
      project: project,
      include_subprojects: true
    )

    candidates = [DummyIssue.new(1, 100), DummyIssue.new(2, 101)]
    visible_relation = Class.new do
      def where(*)
        self
      end

      def pluck(*)
        [100]
      end
    end.new

    Issue.stub(:visible, visible_relation) do
      result = scope.select_visible_top_level_parents(candidates)
      assert_equal [100], result.display_root_issue_ids
      assert_equal 2, result.total_candidates
      assert_equal 1, result.excluded_not_visible
      assert_equal 0, result.excluded_invalid_hierarchy
    end
  end
end
