# frozen_string_literal: true

require 'set'
require File.expand_path('../test_helper', __dir__)

class ScheduleReportRootIssueResolverTest < ActiveSupport::TestCase
  DummyIssue = Struct.new(:id, :root_id, :parent_id, keyword_init: true)

  def test_resolve_many_prefers_root_id_and_batches_parent_lookup
    resolver = RedmineReport::ScheduleReport::RootIssueResolver.new
    candidates = [
      DummyIssue.new(id: 10, root_id: 100, parent_id: nil),
      DummyIssue.new(id: 11, root_id: nil, parent_id: 20),
      DummyIssue.new(id: 12, root_id: nil, parent_id: 21)
    ]

    calls = []
    relation = Object.new
    relation.define_singleton_method(:where) do |conditions|
      ids = Array(conditions[:id]).sort
      calls << ids
      case ids
      when [20, 21]
        [
          DummyIssue.new(id: 20, root_id: nil, parent_id: nil),
          DummyIssue.new(id: 21, root_id: nil, parent_id: nil)
        ]
      else
        []
      end
    end

    Issue.stub(:where, relation.method(:where)) do
      result = resolver.resolve_many(candidates)
      assert_equal [100, 20, 21], result[:root_ids]
      assert_equal 0, result[:invalid_count]
      assert_equal [[20, 21]], calls
    end
  end

  def test_resolve_many_counts_cycle_as_invalid
    resolver = RedmineReport::ScheduleReport::RootIssueResolver.new
    candidates = [DummyIssue.new(id: 30, root_id: nil, parent_id: 31)]

    relation = Object.new
    relation.define_singleton_method(:where) do |conditions|
      ids = Array(conditions[:id]).sort
      return [DummyIssue.new(id: 31, root_id: nil, parent_id: 30)] if ids == [31]
      return [DummyIssue.new(id: 30, root_id: nil, parent_id: 31)] if ids == [30]

      []
    end

    Issue.stub(:where, relation.method(:where)) do
      result = resolver.resolve_many(candidates)
      assert_equal [], result[:root_ids]
      assert_equal 1, result[:invalid_count]
    end
  end
end
