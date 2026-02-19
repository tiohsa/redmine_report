# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class WeeklyReportSaveFlowTest < ActiveSupport::TestCase
  DummyJournal = Struct.new(:notes, keyword_init: true)

  class DummyIssue
    attr_reader :journals, :project_id

    def initialize(project_id:)
      @project_id = project_id
      @journals = []
    end

    def visible?(_user)
      true
    end

    def editable?(_user)
      true
    end

    def init_journal(_user, notes)
      @pending_notes = notes
    end

    def save!
      @journals << DummyJournal.new(notes: @pending_notes)
      true
    end
  end

  def setup
    @project = Project.find_by(identifier: 'ecookbook') || Project.first
  end

  def test_overflow_handler_prefers_note_with_attachment_mode
    handler = RedmineReport::WeeklyReport::OverflowHandler.new
    markdown = 'A' * 25_000
    resolved = handler.call(markdown: markdown, header: '[Weekly][2026-W07] project_id=1 version_id=1 revision=1 generated_at=...')

    assert_equal 'NOTE_WITH_ATTACHMENT', resolved[:mode]
    assert resolved[:note].length < markdown.length
  end

  def test_revision_resolver_returns_next_sequential_number
    resolver = RedmineReport::WeeklyReport::RevisionResolver.new
    issue = DummyIssue.new(project_id: 1)
    issue.journals << DummyJournal.new(notes: '[Weekly][2026-W07] project_id=1 version_id=2 revision=1 generated_at=2026-02-15T10:00:00+09:00')
    issue.journals << DummyJournal.new(notes: '[Weekly][2026-W07] project_id=1 version_id=2 revision=2 generated_at=2026-02-15T10:10:00+09:00')

    revision = resolver.next_revision(issue: issue, project_id: 1, version_id: 2, week: '2026-W07')
    assert_equal 3, revision
  end

  def test_save_service_rejects_project_mismatch
    skip 'project fixture required' unless @project

    service = RedmineReport::WeeklyReport::SaveService.new(project: @project, user: User.current)
    assert_raises(RedmineReport::WeeklyReport::RequestValidator::ValidationError) do
      service.call(
        project_id: @project.id + 100,
        version_id: -1,
        week_from: Date.current.beginning_of_week.to_s,
        week_to: Date.current.end_of_week.to_s,
        week: '2026-W07',
        destination_issue_id: 1,
        markdown: '# test',
        generated_at: Time.current.iso8601
      )
    end
  end
end
