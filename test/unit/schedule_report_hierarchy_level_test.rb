# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportHierarchyLevelTest < ActiveSupport::TestCase
  DummyProject = Struct.new(:id, :identifier, :name, :parent_id, :parent, :descendants, keyword_init: true)

  class DummyScope
    def open
      self
    end

    def includes(*)
      []
    end
  end

  class DummyVisibilityScope
    def select_visible_top_level_parents(_candidates)
      RedmineReport::ScheduleReport::VisibilityScope::SelectionResult.new(
        display_root_issue_ids: [],
        total_candidates: 0,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0
      )
    end
  end

  def setup
    @root = DummyProject.new(id: 1, identifier: 'root', name: 'Root', parent_id: nil, parent: nil, descendants: [])
    @child = DummyProject.new(id: 2, identifier: 'child', name: 'Child', parent_id: 1, parent: @root, descendants: [])
    @grandchild = DummyProject.new(id: 3, identifier: 'grandchild', name: 'Grandchild', parent_id: 2, parent: @child, descendants: [])
    @root.descendants = [@child, @grandchild]
  end

  def test_aggregator_build_rows_sets_hierarchy_levels_for_projects
    filters = Struct.new(:include_subprojects, :status_scope).new(true, 'all')
    aggregator = RedmineReport::ScheduleReport::Aggregator.new(
      issues: DummyScope.new,
      project: @root,
      filters: filters,
      visibility_scope: DummyVisibilityScope.new
    )

    rows = aggregator.send(:build_rows)

    assert_equal 0, rows.find { |row| row[:project_id] == 1 }[:level]
    assert_equal 1, rows.find { |row| row[:project_id] == 2 }[:level]
    assert_equal 2, rows.find { |row| row[:project_id] == 3 }[:level]
  end

  def test_project_options_builder_sets_same_hierarchy_levels
    builder = RedmineReport::ScheduleReport::ProjectOptionsBuilder.new(user: Object.new, root_project: @root)
    projects = [@root, @child, @grandchild]
    builder.singleton_class.send(:define_method, :visible_projects) { projects }

    options = builder.call

    assert_equal 0, options.find { |row| row[:project_id] == 1 }[:level]
    assert_equal 1, options.find { |row| row[:project_id] == 2 }[:level]
    assert_equal 2, options.find { |row| row[:project_id] == 3 }[:level]
  end
end
