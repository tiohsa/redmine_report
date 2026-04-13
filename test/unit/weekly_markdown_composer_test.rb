# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class WeeklyMarkdownComposerTest < ActiveSupport::TestCase
  def test_call_attaches_header_when_llm_omits_it
    context = {
      project: { id: 10 },
      version: { id: 20 },
      week: { from: Date.new(2026, 2, 9), to: Date.new(2026, 2, 15) },
      kpi: { completed: 1, wip: 2, overdue: 3, high_priority_open: 4 },
      tickets: []
    }

    llm = Object.new
    llm.define_singleton_method(:call) do |_kwargs|
      { markdown: '# weekly markdown', sections: { major_achievements: ['##1 done'] } }
    end

    result = RedmineReport::WeeklyReport::MarkdownComposer.new(
      context: context,
      top_topics_limit: 5,
      llm: llm,
      logger: Rails.logger
    ).call

    assert_includes result[:markdown], '[Weekly][2026-W07] project_id=10 version_id=20'
    assert_includes result[:markdown], '# weekly markdown'
    assert_equal({ major_achievements: ['##1 done'] }, result[:sections])
  end

  def test_call_uses_fallback_when_llm_raises
    context = {
      project: { id: 10 },
      version: { id: 20 },
      week: { from: Date.new(2026, 2, 9), to: Date.new(2026, 2, 15) },
      kpi: { completed: 1, wip: 2, overdue: 3, high_priority_open: 4 },
      tickets: [
        {
          id: 1,
          title: 'Done work',
          layer: 'A_WEEKLY_CHANGE',
          comments_this_week: [{ excerpt: 'shipped' }]
        },
        {
          id: 2,
          title: 'Risk work',
          layer: 'B_CONTINUOUS_RISK',
          due_date: Date.current - 1,
          comments_this_week: []
        }
      ]
    }

    llm = Object.new
    llm.define_singleton_method(:call) do |_kwargs|
      raise StandardError, 'boom'
    end

    result = RedmineReport::WeeklyReport::MarkdownComposer.new(
      context: context,
      top_topics_limit: 5,
      llm: llm,
      logger: Rails.logger
    ).call

    assert_includes result[:markdown], '[Weekly][2026-W07] project_id=10 version_id=20'
    assert_includes result[:markdown], '## 今週の主要実績'
    assert_includes result[:markdown], '##1 Done work'
    assert_equal ['##1 Done work'], result[:sections][:major_achievements]
    assert_equal ['##2 Risk work (継続リスク)'], result[:sections][:risks]
  end
end
