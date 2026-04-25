# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)
require File.expand_path('../support/weekly_report_fake_project', __dir__)

class GenerateServiceResponseTest < ActiveSupport::TestCase
  def setup
    @version = FakeVersion.new(20)
    @project = FakeProject.new(10, FakeVersions.new(@version))
    @service = RedmineReport::WeeklyReport::GenerateService.new(project: @project, user: Object.new)

    validated = {
      project_id: 10,
      version_id: 20,
      week_from: Date.new(2026, 2, 9),
      week_to: Date.new(2026, 2, 15),
      top_topics_limit: 5,
      top_tickets_limit: 10
    }
    context = {
      kpi: { completed: 1, wip: 2, overdue: 3, high_priority_open: 4 },
      tickets: [{ id: 1, title: 'Issue 1' }],
      week: { from: Date.new(2026, 2, 9) },
      project: { id: 10 },
      version: { id: 20 }
    }
    version = @version

    @service.singleton_class.send(:define_method, :resolve_context) do |_payload|
      [validated, version, context]
    end
  end

  def test_prepare_returns_header_kpi_prompt_and_tickets
    fake_llm = Object.new
    fake_llm.define_singleton_method(:prepare) do |context:, top_topics_limit:|
      "prompt(limit=#{top_topics_limit},tickets=#{context[:tickets].size})"
    end

    RedmineReport::Llm::WeeklyMarkdownGenerator.stub :new, fake_llm do
      result = @service.prepare({})

      assert_equal 10, result.dig(:header_preview, :project_id)
      assert_equal 20, result.dig(:header_preview, :version_id)
      assert_equal '2026-W07', result.dig(:header_preview, :week)
      assert_equal({ completed: 1, wip: 2, overdue: 3, high_priority_open: 4 }, result[:kpi])
      assert_equal [{ id: 1, title: 'Issue 1' }], result[:tickets]
      assert_equal 'prompt(limit=5,tickets=1)', result[:prompt]
    end
  end

  def test_call_returns_header_kpi_markdown_llm_response_and_tickets
    composer = Object.new
    composer.define_singleton_method(:call) do
      { markdown: '# weekly markdown', sections: { major_achievements: ['##1 done'] } }
    end

    RedmineReport::WeeklyReport::MarkdownComposer.stub :new, composer do
      result = @service.call(prompt: ' custom prompt ')

      assert_equal 10, result.dig(:header_preview, :project_id)
      assert_equal 20, result.dig(:header_preview, :version_id)
      assert_equal '2026-W07', result.dig(:header_preview, :week)
      assert_equal({ completed: 1, wip: 2, overdue: 3, high_priority_open: 4 }, result[:kpi])
      assert_equal '# weekly markdown', result[:markdown]
      assert_equal({ major_achievements: ['##1 done'] }, result[:llm_response])
      assert_equal [{ id: 1, title: 'Issue 1' }], result[:tickets]
    end
  end
end
