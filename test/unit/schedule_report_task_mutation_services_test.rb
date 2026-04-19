# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportTaskMutationServicesTest < ActiveSupport::TestCase
  class DummyIssue
    attr_accessor :id, :parent_id, :subject, :start_date, :due_date, :done_ratio,
                  :project_id, :tracker_id, :status_id, :assigned_to_id, :priority_id,
                  :description, :saved, :journal_notes

    def initialize(id:, project_id:, subject: 'Subject', start_date: nil, due_date: nil, done_ratio: 0)
      @id = id
      @project_id = project_id
      @subject = subject
      @start_date = start_date
      @due_date = due_date
      @done_ratio = done_ratio
      @saved = true
      @journal_notes = []
    end

    def editable?(_user)
      true
    end

    def init_journal(_user, notes)
      @journal_notes << notes
    end

    def save
      saved
    end

    def errors
      Struct.new(:full_messages).new(['validation failed'])
    end

    def tracker
      nil
    end

    def status
      nil
    end

    def assigned_to
      nil
    end

    def priority
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

    def where(conditions)
      filtered = @items
      if conditions.key?(:project_id)
        allowed = Array(conditions[:project_id])
        filtered = filtered.select { |item| allowed.include?(item.project_id) }
      end
      self.class.new(filtered)
    end

    def find_by(id:)
      @items.find { |item| item.id == id }
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

  def setup
    descendants = Object.new
    descendants.define_singleton_method(:pluck) do |_column|
      [2]
    end
    @project = Struct.new(:id, :descendants).new(1, descendants)
    @user = Object.new
  end

  def test_task_update_service_coerces_numeric_fields_and_adds_notes
    issue = DummyIssue.new(id: 10, project_id: 1, subject: 'Before', done_ratio: 10)
    DummyIssueClass.relation = DummyRelation.new([issue])

    result = RedmineReport::ScheduleReport::TaskUpdateService.new(
      root_project: @project,
      user: @user,
      issue_class: DummyIssueClass
    ).call(
      issue_id: '10',
      fields: {
        subject: 'After',
        status_id: '4',
        assigned_to_id: '12',
        done_ratio: '80',
        notes: 'updated'
      }
    )

    assert_equal true, result[:ok]
    assert_equal 'After', issue.subject
    assert_equal 4, issue.status_id
    assert_equal 12, issue.assigned_to_id
    assert_equal 80, issue.done_ratio
    assert_equal ['updated'], issue.journal_notes
    assert_equal 80, result[:issue][:done_ratio]
  end

  def test_task_update_service_rejects_empty_allowed_fields
    issue = DummyIssue.new(id: 10, project_id: 1)
    DummyIssueClass.relation = DummyRelation.new([issue])

    result = RedmineReport::ScheduleReport::TaskUpdateService.new(
      root_project: @project,
      user: @user,
      issue_class: DummyIssueClass
    ).call(issue_id: '10', fields: { foo: 'bar' })

    assert_equal false, result[:ok]
    assert_equal 'INVALID_INPUT', result[:code]
    assert_equal :unprocessable_entity, result[:status]
  end

  def test_task_date_update_service_applies_partial_updates_and_clears_blank_values
    issue = DummyIssue.new(
      id: 11,
      project_id: 1,
      start_date: Date.new(2026, 4, 1),
      due_date: Date.new(2026, 4, 30)
    )
    DummyIssueClass.relation = DummyRelation.new([issue])

    service = RedmineReport::ScheduleReport::TaskDateUpdateService.new(
      root_project: @project,
      user: @user,
      issue_class: DummyIssueClass
    )

    result = service.call(issue_id: '11', start_date: '2026-05-01')

    assert_equal true, result[:ok]
    assert_equal Date.new(2026, 5, 1), issue.start_date
    assert_equal Date.new(2026, 4, 30), issue.due_date

    clear_result = service.call(issue_id: '11', due_date: '')

    assert_equal true, clear_result[:ok]
    assert_nil issue.due_date
  end

  def test_task_date_update_service_requires_at_least_one_date_input
    issue = DummyIssue.new(id: 11, project_id: 1)
    DummyIssueClass.relation = DummyRelation.new([issue])

    result = RedmineReport::ScheduleReport::TaskDateUpdateService.new(
      root_project: @project,
      user: @user,
      issue_class: DummyIssueClass
    ).call(issue_id: '11')

    assert_equal false, result[:ok]
    assert_equal 'INVALID_INPUT', result[:code]
    assert_equal 'start_date or due_date is required', result[:message]
  end
end
