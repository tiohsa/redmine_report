# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportTaskDetailsServiceTest < ActiveSupport::TestCase
  DummyOption = Struct.new(:id, :name) do
    def is_closed?
      false
    end
  end

  DummyProject = Struct.new(:trackers)

  DummyIssue = Struct.new(
    :id,
    :parent_id,
    :subject,
    :start_date,
    :due_date,
    :done_ratio,
    :project_id,
    :lft,
    :rgt,
    :root_id,
    keyword_init: true
  ) do
    def editable?(_user)
      true
    end

    def tracker
      DummyOption.new(1, 'Task')
    end

    def status
      DummyOption.new(1, 'New')
    end

    def new_statuses_allowed_to(_user)
      [DummyOption.new(2, 'In Progress')]
    end

    def priority
      DummyOption.new(3, 'Normal')
    end

    def project
      DummyProject.new([tracker])
    end

    def assignable_users
      [DummyOption.new(8, 'Alice')]
    end

    def assigned_to
      nil
    end

    def journals
      []
    end
  end

  class DummyRelation
    def initialize(items)
      @items = items
    end

    def where(*args)
      filtered = @items
      if args.first.is_a?(String)
        lft = args[1]
        rgt = args[2]
        filtered = filtered.select do |item|
          item.respond_to?(:lft) && item.respond_to?(:rgt) && item.lft && item.rgt && item.lft > lft && item.rgt < rgt
        end
      else
        conditions = args.first || {}
        if conditions.key?(:project_id)
          allowed = Array(conditions[:project_id])
          filtered = filtered.select { |item| allowed.include?(item.project_id) }
        end
        if conditions.key?(:parent_id)
          filtered = filtered.select { |item| item.parent_id == conditions[:parent_id] }
        end
        if conditions.key?(:root_id)
          filtered = filtered.select { |item| item.root_id == conditions[:root_id] }
        end
      end
      self.class.new(filtered)
    end

    def find_by(id:)
      @items.find { |item| item.id == id }
    end

    def order(*columns)
      return self.class.new(@items.sort_by(&:id)) if columns.empty?

      sorted = @items.sort_by do |item|
        columns.map { |column| item.respond_to?(column) ? item.public_send(column) : nil }
      end
      self.class.new(sorted)
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
    assert_equal true, result[:issue_edit_options][10][:editable]
    assert_equal [1], result[:issue_edit_options][10][:trackers].map { |tracker| tracker[:id] }
    assert_equal [1, 2], result[:issue_edit_options][10][:statuses].map { |status| status[:id] }
  end

  def test_call_excludes_other_root_issues_when_nested_set_overlaps
    root_issue = DummyIssue.new(
      id: 15,
      parent_id: nil,
      subject: 'Root issue',
      start_date: Date.new(2026, 2, 1),
      due_date: Date.new(2026, 2, 10),
      done_ratio: 50,
      project_id: 1,
      lft: 1,
      rgt: 16,
      root_id: 15
    )
    child_issue = DummyIssue.new(
      id: 20,
      parent_id: 15,
      subject: 'Child issue',
      start_date: Date.new(2026, 2, 2),
      due_date: Date.new(2026, 2, 11),
      done_ratio: 0,
      project_id: 1,
      lft: 2,
      rgt: 3,
      root_id: 15
    )
    other_root_descendant = DummyIssue.new(
      id: 22,
      parent_id: 16,
      subject: 'Other root child',
      start_date: Date.new(2026, 2, 3),
      due_date: Date.new(2026, 2, 12),
      done_ratio: 0,
      project_id: 1,
      lft: 2,
      rgt: 9,
      root_id: 16
    )
    DummyIssueClass.relation = DummyRelation.new([root_issue, child_issue, other_root_descendant])

    descendants = Object.new
    descendants.define_singleton_method(:pluck) do |_column|
      []
    end

    project = Struct.new(:id, :descendants).new(1, descendants)
    service = RedmineReport::ScheduleReport::TaskDetailsService.new(
      root_project: project,
      user: Object.new,
      issue_class: DummyIssueClass
    )

    result = service.call(issue_id: '15')

    assert_equal true, result[:ok]
    assert_equal [15, 20], result[:issues].map { |issue| issue[:issue_id] }
  end

  def test_call_returns_invalid_input_for_non_integer_issue_id
    DummyIssueClass.relation = DummyRelation.new([])

    descendants = Object.new
    descendants.define_singleton_method(:pluck) do |_column|
      []
    end

    project = Struct.new(:id, :descendants).new(1, descendants)
    service = RedmineReport::ScheduleReport::TaskDetailsService.new(
      root_project: project,
      user: Object.new,
      issue_class: DummyIssueClass
    )

    result = service.call(issue_id: 'abc')

    assert_equal false, result[:ok]
    assert_equal 'INVALID_INPUT', result[:code]
    assert_equal :unprocessable_entity, result[:status]
  end
end
