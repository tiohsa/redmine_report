# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportTaskMastersServiceTest < ActiveSupport::TestCase
  DummyTracker = Struct.new(:id, :name)
  DummyPriority = Struct.new(:id, :name)
  DummyStatus = Struct.new(:id, :name, :closed) do
    def is_closed?
      closed
    end
  end
  DummyUser = Struct.new(:id, :name, :active) do
    def active?
      active
    end
  end
  DummyMember = Struct.new(:user)

  class DummyMemberRelation
    def initialize(items)
      @items = items
    end

    def includes(*_args)
      self
    end

    def select(&block)
      self.class.new(@items.select(&block))
    end

    def map(&block)
      @items.map(&block)
    end
  end

  class BrokenMemberRelation
    def includes(*_args)
      raise StandardError, 'members unavailable'
    end
  end

  def test_call_serializes_trackers_statuses_priorities_and_members
    project = Struct.new(:trackers, :members).new(
      [DummyTracker.new(1, 'Task')],
      DummyMemberRelation.new([
        DummyMember.new(DummyUser.new(10, 'Alice', true)),
        DummyMember.new(DummyUser.new(11, 'Inactive', false))
      ])
    )

    service = RedmineReport::ScheduleReport::TaskMastersService.new(
      project: project,
      user: Object.new
    )

    IssueStatus.stub(:sorted, [DummyStatus.new(2, 'Open', false)]) do
      IssuePriority.stub(:active, [DummyPriority.new(3, 'Normal')]) do
        result = service.call

        assert_equal true, result[:ok]
        assert_equal [{ id: 1, name: 'Task' }], result[:trackers]
        assert_equal [{ id: 2, name: 'Open', is_closed: false }], result[:statuses]
        assert_equal [{ id: 3, name: 'Normal' }], result[:priorities]
        assert_equal [
          { id: nil, name: '' },
          { id: 10, name: 'Alice' }
        ], result[:members]
      end
    end
  end

  def test_call_returns_empty_members_when_member_loading_fails
    project = Struct.new(:trackers, :members).new(
      [DummyTracker.new(1, 'Task')],
      BrokenMemberRelation.new
    )

    service = RedmineReport::ScheduleReport::TaskMastersService.new(
      project: project,
      user: Object.new
    )

    IssueStatus.stub(:sorted, [DummyStatus.new(2, 'Open', false)]) do
      IssuePriority.stub(:active, [DummyPriority.new(3, 'Normal')]) do
        result = service.call

        assert_equal true, result[:ok]
        assert_equal [], result[:members]
      end
    end
  end
end
