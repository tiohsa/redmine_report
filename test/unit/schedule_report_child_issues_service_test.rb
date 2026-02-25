# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportChildIssuesServiceTest < ActiveSupport::TestCase
  DummyVersion = Struct.new(:id, :name, keyword_init: true)

  DummyIssue = Struct.new(
    :id,
    :parent_id,
    :subject,
    :start_date,
    :due_date,
    :done_ratio,
    :project_id,
    :fixed_version,
    :closed,
    keyword_init: true
  ) do
    def closed?
      !!closed
    end
  end

  DummyIssueRelationRecord = Struct.new(:issue_from_id, :issue_to_id, :relation_type, keyword_init: true)

  class DummyRelation
    include Enumerable

    def initialize(items)
      @items = items
    end

    def each(&block)
      @items.each(&block)
    end

    def where(*args)
      conditions = args.first || {}
      filtered = @items

      if conditions.is_a?(Hash)
        conditions.each do |key, value|
          allowed = Array(value)
          filtered = filtered.select do |item|
            item_value = item.public_send(key)
            allowed.include?(item_value)
          end
        end
      end

      self.class.new(filtered)
    end

    def includes(*_args)
      self
    end

    def order(*columns)
      sorted = @items.sort_by do |item|
        columns.map do |column|
          value = item.public_send(column)
          value.nil? ? Date.new(9999, 12, 31) : value
        end
      end
      self.class.new(sorted)
    end

    def to_a
      @items
    end

    def find_each(&block)
      @items.each(&block)
    end
  end

  class DummyIssueClass
    class << self
      attr_accessor :relation
    end

    def self.visible(_user)
      relation
    end
  end

  class DummyIssueRelationClass
    class << self
      attr_accessor :relation
    end

    def self.where(*args)
      relation.where(*args)
    end
  end

  def setup
    DummyIssueClass.relation = DummyRelation.new([])
    DummyIssueRelationClass.relation = DummyRelation.new([])
  end

  def test_call_returns_direct_children_bars_with_parent_version_and_dependencies
    version = DummyVersion.new(id: 7, name: 'v1.0')
    parent = DummyIssue.new(
      id: 10,
      parent_id: nil,
      subject: 'Parent',
      start_date: Date.new(2026, 3, 1),
      due_date: Date.new(2026, 3, 20),
      done_ratio: 0,
      project_id: 1,
      fixed_version: version,
      closed: false
    )
    child1 = DummyIssue.new(
      id: 11,
      parent_id: 10,
      subject: 'Child 1',
      start_date: Date.new(2026, 3, 2),
      due_date: Date.new(2026, 3, 3),
      done_ratio: 25,
      project_id: 1,
      fixed_version: nil,
      closed: false
    )
    child2 = DummyIssue.new(
      id: 12,
      parent_id: 10,
      subject: 'Child 2',
      start_date: Date.new(2026, 3, 4),
      due_date: Date.new(2026, 3, 5),
      done_ratio: 60,
      project_id: 2,
      fixed_version: nil,
      closed: false
    )
    grandchild = DummyIssue.new(
      id: 13,
      parent_id: 11,
      subject: 'Grandchild',
      start_date: Date.new(2026, 3, 6),
      due_date: Date.new(2026, 3, 7),
      done_ratio: 10,
      project_id: 1,
      fixed_version: nil,
      closed: false
    )
    no_date_child = DummyIssue.new(
      id: 14,
      parent_id: 10,
      subject: 'No Date',
      start_date: nil,
      due_date: nil,
      done_ratio: 0,
      project_id: 1,
      fixed_version: nil,
      closed: false
    )
    outside_scope_child = DummyIssue.new(
      id: 15,
      parent_id: 10,
      subject: 'Outside Scope',
      start_date: Date.new(2026, 3, 8),
      due_date: Date.new(2026, 3, 9),
      done_ratio: 0,
      project_id: 99,
      fixed_version: nil,
      closed: false
    )

    DummyIssueClass.relation = DummyRelation.new([parent, child1, child2, grandchild, no_date_child, outside_scope_child])
    DummyIssueRelationClass.relation = DummyRelation.new([
      DummyIssueRelationRecord.new(issue_from_id: 11, issue_to_id: 12, relation_type: IssueRelation::TYPE_PRECEDES)
    ])

    service = RedmineReport::ScheduleReport::ChildIssuesService.new(
      root_project: build_root_project(descendant_ids: [2]),
      user: Object.new,
      issue_class: DummyIssueClass,
      relation_class: DummyIssueRelationClass
    )

    result = service.call(parent_issue_ids: [10])

    assert_equal true, result[:ok]
    assert_equal 1, result[:items].size

    payload = result[:items].first
    assert_equal 10, payload[:parent_issue_id]
    assert_equal [11, 12], payload[:children].map { |row| row[:category_id] }
    assert_equal ['v1.0', 'v1.0'], payload[:children].map { |row| row[:version_name] }
    assert_equal ['2026-03-02', '2026-03-04'], payload[:children].map { |row| row[:start_date] }
    assert_equal ['1:issue:11'], payload[:children].find { |row| row[:category_id] == 12 }[:dependencies]
  end

  def test_call_returns_empty_items_when_parent_is_not_visible_or_invalid
    visible_parent = DummyIssue.new(
      id: 10,
      parent_id: nil,
      subject: 'Parent',
      start_date: Date.new(2026, 3, 1),
      due_date: Date.new(2026, 3, 2),
      done_ratio: 0,
      project_id: 1,
      fixed_version: DummyVersion.new(id: 1, name: 'v1'),
      closed: false
    )
    DummyIssueClass.relation = DummyRelation.new([visible_parent])

    service = RedmineReport::ScheduleReport::ChildIssuesService.new(
      root_project: build_root_project(descendant_ids: []),
      user: Object.new,
      issue_class: DummyIssueClass,
      relation_class: DummyIssueRelationClass
    )

    result = service.call(parent_issue_ids: ['abc', 999])

    assert_equal true, result[:ok]
    assert_equal [], result[:items]
  end

  private

  def build_root_project(descendant_ids:)
    descendants = Object.new
    descendants.define_singleton_method(:pluck) do |_column|
      descendant_ids
    end
    Struct.new(:id, :descendants).new(1, descendants)
  end
end
