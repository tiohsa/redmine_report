# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportTaskDetailsServiceTest < ActiveSupport::TestCase
  DummyIssue = Struct.new(:id, :parent_id, :subject, :start_date, :due_date, :done_ratio, :project_id, keyword_init: true)

  class DummyRelation
    def initialize(items)
      @items = items
    end

    def where(conditions)
      filtered = @items
      if conditions.key?(:project_id)
        allowed = Array(conditions[:project_id])
        filtered = filtered.select { |item| allowed.include?(item.project_id) }
      end
      if conditions.key?(:parent_id)
        filtered = filtered.select { |item| item.parent_id == conditions[:parent_id] }
      end
      self.class.new(filtered)
    end

    def find_by(id:)
      @items.find { |item| item.id == id }
    end

    def order(*)
      self.class.new(@items.sort_by(&:id))
    end

    def to_a
      @items
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

  def test_call_serializes_done_ratio_for_root_and_children
    root_issue = DummyIssue.new(
      id: 10,
      parent_id: nil,
      subject: 'Root issue',
      start_date: Date.new(2026, 2, 1),
      due_date: Date.new(2026, 2, 10),
      done_ratio: 65,
      project_id: 1
    )
    child_issue = DummyIssue.new(
      id: 11,
      parent_id: 10,
      subject: 'Child issue',
      start_date: Date.new(2026, 2, 2),
      due_date: Date.new(2026, 2, 11),
      done_ratio: nil,
      project_id: 2
    )
    DummyIssueClass.relation = DummyRelation.new([root_issue, child_issue])

    descendants = Object.new
    descendants.define_singleton_method(:pluck) do |_column|
      [2]
    end

    project = Struct.new(:id, :descendants).new(1, descendants)
    service = RedmineReport::ScheduleReport::TaskDetailsService.new(
      root_project: project,
      user: Object.new,
      issue_class: DummyIssueClass
    )

    result = service.call(issue_id: '10')

    assert_equal true, result[:ok]
    assert_equal 2, result[:issues].size
    assert_equal 65, result[:issues].first[:done_ratio]
    assert_equal 0, result[:issues].second[:done_ratio]
  end
end
