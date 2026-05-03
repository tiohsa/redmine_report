# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class StoredCommentParserTest < ActiveSupport::TestCase
  def setup
    @parser = RedmineReport::WeeklyReport::StoredCommentParser.new
  end

  def test_parses_header_with_revision
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=3 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - #1 Done work
      - #2 Another item

      ## 来週の予定・アクション
      - #3 Plan A

      ## 課題・リスク
      - #4 Risk item

      ## 決定事項
      - 該当なし
    MD

    result = @parser.parse(note)
    assert_not_nil result
    assert_equal '2026-W18', result.week
    assert_equal 1, result.project_id
    assert_equal 10, result.version_id
    assert_equal 3, result.revision
    assert_not_nil result.generated_at
  end

  def test_parses_header_without_revision
    note = "[Weekly][2026-W18] project_id=1 version_id=10 generated_at=2026-05-03T15:08:57Z\n\n## 今週の主要実績\n- Item 1\n"
    result = @parser.parse(note)
    assert_not_nil result
    assert_equal 1, result.project_id
    assert_equal 10, result.version_id
    assert_nil result.revision
  end

  def test_parses_split_risk_decision_sections
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Achievement 1

      ## 来週の予定・アクション
      - Plan 1

      ## 課題・リスク
      - Risk A
      - Risk B

      ## 決定事項
      - Decision X
    MD

    result = @parser.parse(note)
    assert_not_nil result
    assert_includes result.risks, 'Risk A'
    assert_includes result.risks, 'Risk B'
    assert_includes result.decisions, 'Decision X'
  end

  def test_parses_combined_risk_decision_section
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Achievement 1

      ## 来週の予定・アクション
      - Plan 1

      ## 課題・リスク・決定事項
      - Risk A
      - Decision X
    MD

    result = @parser.parse(note)
    assert_not_nil result
    # Combined section content goes to risks
    assert_includes result.risks, 'Risk A'
    assert_includes result.risks, 'Decision X'
  end

  def test_returns_nil_for_non_weekly_comment
    result = @parser.parse('Just a regular comment')
    assert_nil result
  end

  def test_returns_nil_for_nil_input
    result = @parser.parse(nil)
    assert_nil result
  end

  def test_returns_nil_for_empty_string
    result = @parser.parse('')
    assert_nil result
  end

  def test_parse_rows_returns_arrays
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Item A
      - Item B

      ## 来週の予定・アクション
      - Plan 1

      ## 課題・リスク
      - Risk 1

      ## 決定事項
      - Decision 1
    MD

    result = @parser.parse_rows(note)
    assert_not_nil result
    assert_instance_of Array, result[:highlights_this_week]
    assert_equal ['Item A', 'Item B'], result[:highlights_this_week]
    assert_equal ['Plan 1'], result[:next_week_actions]
    assert_equal ['Risk 1'], result[:risks]
    assert_equal ['Decision 1'], result[:decisions]
  end

  def test_parse_rows_normalizes_empty_sections
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - Item A

      ## 来週の予定・アクション

      ## 課題・リスク

      ## 決定事項
    MD

    result = @parser.parse_rows(note)
    assert_not_nil result
    assert_equal ['Item A'], result[:highlights_this_week]
    assert_equal ['該当なし'], result[:next_week_actions]
    assert_equal ['該当なし'], result[:risks]
    assert_equal ['該当なし'], result[:decisions]
  end

  def test_parse_rows_strips_list_marker_prefix
    note = <<~MD
      [Weekly][2026-W18] project_id=1 version_id=10 revision=1 generated_at=2026-05-03T15:08:57Z

      ## 今週の主要実績
      - First item
      * Second item

      ## 来週の予定・アクション
      - Plan

      ## 課題・リスク
      - Risk

      ## 決定事項
      - Decision
    MD

    result = @parser.parse_rows(note)
    assert_equal ['First item', 'Second item'], result[:highlights_this_week]
  end

  def test_parse_rows_returns_nil_for_non_weekly
    result = @parser.parse_rows('Not a weekly comment')
    assert_nil result
  end
end
