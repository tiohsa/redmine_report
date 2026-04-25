# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportJournalUpdateServiceTest < ActiveSupport::TestCase
  class DummyJournal
    attr_reader :saved_notes
    attr_accessor :should_save

    def initialize(editable: true, should_save: true)
      @editable = editable
      @should_save = should_save
      @saved_notes = nil
    end

    def editable_by?(_user)
      @editable
    end

    def safe_attributes=(attrs)
      @saved_notes = attrs['notes']
    end

    def save
      should_save
    end

    def errors
      Struct.new(:full_messages).new(['notes invalid'])
    end
  end

  class DummyJournalClass
    class << self
      attr_accessor :journal
    end

    def self.find_by(id:)
      return nil unless journal
      return journal if id.to_s == '7'

      nil
    end
  end

  def test_call_updates_journal_notes
    journal = DummyJournal.new
    DummyJournalClass.journal = journal

    result = RedmineReport::ScheduleReport::JournalUpdateService.new(
      user: Object.new,
      journal_class: DummyJournalClass
    ).call(journal_id: '7', notes: 'edited note')

    assert_equal true, result[:ok]
    assert_equal 'edited note', journal.saved_notes
  end

  def test_call_returns_forbidden_when_journal_is_not_editable
    DummyJournalClass.journal = DummyJournal.new(editable: false)

    result = RedmineReport::ScheduleReport::JournalUpdateService.new(
      user: Object.new,
      journal_class: DummyJournalClass
    ).call(journal_id: '7', notes: 'edited note')

    assert_equal false, result[:ok]
    assert_equal 'FORBIDDEN', result[:code]
    assert_equal :forbidden, result[:status]
  end
end
