# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportAggregationTest < ActiveSupport::TestCase
  DummyIssue = Struct.new(:id, :subject, :project_id, :category_id, :category, :start_date, :due_date, :done_ratio, :fixed_version, :closed, :root_id, keyword_init: true) do
    def closed?
      closed
    end
  end

  DummyCategory = Struct.new(:name)
  DummyVersion = Struct.new(:id, :name, :status)
  DummyProject = Struct.new(:id, :identifier, :name, :parent_id, :parent, :descendants)

  class DummyScope
    def initialize(issues)
      @issues = issues
    end

    def open
      self
    end

    def includes(*)
      @issues
    end

    def where(*)
      self
    end
  end

  class DummyVisibilityScope
    def initialize(display_ids)
      @display_ids = display_ids
    end

    def select_visible_top_level_parents(candidate_issues)
      RedmineReport::ScheduleReport::VisibilityScope::SelectionResult.new(
        display_root_issue_ids: @display_ids,
        total_candidates: candidate_issues.size,
        excluded_not_visible: 1,
        excluded_invalid_hierarchy: 0
      )
    end
  end

  def build_filters
    RedmineReport::ScheduleReport::FilterParams.new({})
  end

  def build_project
    DummyProject.new(
      id: 1,
      identifier: 'ecookbook',
      name: 'eCookbook',
      parent_id: nil,
      parent: nil,
      descendants: []
    )
  end

  def test_aggregator_uses_open_version_candidates_only_for_selection
    open_issue = DummyIssue.new(
      id: 1,
      subject: 'Issue Open',
      project_id: 1,
      category_id: 10,
      category: DummyCategory.new('Cat'),
      start_date: Date.today,
      due_date: Date.today + 1,
      done_ratio: 10,
      fixed_version: DummyVersion.new(1, 'v1', 'open'),
      closed: false,
      root_id: 100
    )
    locked_issue = DummyIssue.new(
      id: 2,
      subject: 'Issue Locked',
      project_id: 1,
      category_id: 10,
      category: DummyCategory.new('Cat'),
      start_date: Date.today,
      due_date: Date.today + 1,
      done_ratio: 20,
      fixed_version: DummyVersion.new(2, 'v2', 'locked'),
      closed: false,
      root_id: 100
    )

    selection_call_count = 0
    visibility_scope = Object.new
    visibility_scope.define_singleton_method(:select_visible_top_level_parents) do |candidates|
      selection_call_count += 1
      raise "expected 1 candidate, got #{candidates.size}" unless candidates.size == 1
      raise 'expected open issue candidate' unless candidates.first.id == 1

      RedmineReport::ScheduleReport::VisibilityScope::SelectionResult.new(
        display_root_issue_ids: [100],
        total_candidates: candidates.size,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0
      )
    end

    scope = DummyScope.new([open_issue, locked_issue])
    aggregator = RedmineReport::ScheduleReport::Aggregator.new(
      issues: scope,
      project: build_project,
      filters: build_filters,
      visibility_scope: visibility_scope
    )

    result = aggregator.call
    assert_equal 1, selection_call_count
    assert_equal 'open_version_top_parent', result[:filter_rule]
    assert_equal 1, result.dig(:selection_summary, :total_candidates)
  end

  def test_aggregator_creates_separate_bars_per_versioned_ticket_in_same_project
    issue_v1 = DummyIssue.new(
      id: 100,
      subject: 'Ticket A',
      project_id: 1,
      category_id: nil,
      category: nil,
      start_date: Date.today,
      due_date: Date.today + 3,
      done_ratio: 20,
      fixed_version: DummyVersion.new(1, 'v1', 'open'),
      closed: false,
      root_id: 100
    )
    issue_v2 = DummyIssue.new(
      id: 101,
      subject: 'Ticket B',
      project_id: 1,
      category_id: nil,
      category: nil,
      start_date: Date.today + 1,
      due_date: Date.today + 4,
      done_ratio: 30,
      fixed_version: DummyVersion.new(2, 'v2', 'open'),
      closed: false,
      root_id: 101
    )

    visibility_scope = Object.new
    visibility_scope.define_singleton_method(:select_visible_top_level_parents) do |candidates|
      RedmineReport::ScheduleReport::VisibilityScope::SelectionResult.new(
        display_root_issue_ids: candidates.map(&:root_id),
        total_candidates: candidates.size,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0
      )
    end

    scope = DummyScope.new([issue_v1, issue_v2])
    aggregator = RedmineReport::ScheduleReport::Aggregator.new(
      issues: scope,
      project: build_project,
      filters: build_filters,
      visibility_scope: visibility_scope
    )

    result = aggregator.call
    assert_equal 2, result[:bars].size
    assert_equal ['Ticket A', 'Ticket B'], result[:bars].map { |bar| bar[:category_name] }.sort
  end

  def test_aggregator_converts_child_candidate_to_root_issue
    child_issue = DummyIssue.new(
      id: 1,
      subject: 'Child Ticket',
      project_id: 1,
      category_id: nil,
      category: nil,
      start_date: Date.today,
      due_date: Date.today + 2,
      done_ratio: 20,
      fixed_version: DummyVersion.new(1, 'v1', 'open'),
      closed: false,
      root_id: 100
    )
    root_issue = DummyIssue.new(
      id: 100,
      subject: 'Root Ticket',
      project_id: 1,
      category_id: nil,
      category: nil,
      start_date: Date.today - 1,
      due_date: Date.today + 3,
      done_ratio: 40,
      fixed_version: nil,
      closed: false,
      root_id: 100
    )

    visibility_scope = Object.new
    visibility_scope.define_singleton_method(:select_visible_top_level_parents) do |candidates|
      RedmineReport::ScheduleReport::VisibilityScope::SelectionResult.new(
        display_root_issue_ids: candidates.map(&:root_id).uniq,
        total_candidates: candidates.size,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0
      )
    end

    scope = DummyScope.new([child_issue])
    aggregator = RedmineReport::ScheduleReport::Aggregator.new(
      issues: scope,
      project: build_project,
      filters: build_filters,
      visibility_scope: visibility_scope
    )

    where_stub = lambda do |conditions|
      assert_equal [100], Array(conditions[:id]).sort
      [root_issue]
    end

    Issue.stub(:where, where_stub) do
      result = aggregator.call
      assert_equal 1, result[:bars].size
      assert_equal 'Root Ticket', result[:bars].first[:category_name]
      assert_equal 'Root Ticket', result[:bars].first[:ticket_subject]
      refute_includes result[:bars].map { |bar| bar[:ticket_subject] }, 'Child Ticket'
    end
  end

  def test_snapshot_builder_applies_limits
    rows = Array.new(501) { |i| { project_id: i + 1, name: "P#{i}", level: 0, expanded: true } }
    bars = Array.new(2001) do |i|
      {
        bar_key: "1:#{i}",
        project_id: 1,
        category_id: i,
        category_name: 'X',
        start_date: Date.today,
        end_date: Date.today,
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 0,
        is_delayed: false
      }
    end

    filters = RedmineReport::ScheduleReport::FilterParams.new({})
    snapshot = RedmineReport::ScheduleReport::SnapshotBuilder.new(
      rows: rows,
      bars: bars,
      filters: filters,
      selection_summary: {
        total_candidates: 1,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0,
        displayed_top_parent_count: 1
      },
      filter_rule: 'open_version_top_parent'
    ).call

    assert_equal 500, snapshot[:rows].size
    assert_equal 2000, snapshot[:bars].size
    assert snapshot[:meta][:warnings].any?
    assert_equal 'open_version_top_parent', snapshot.dig(:meta, :applied_filters, :filter_rule)
    assert_equal 1, snapshot.dig(:selection_summary, :displayed_top_parent_count)
  end
end
