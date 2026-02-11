# frozen_string_literal: true

require File.expand_path('../../test_helper', __dir__)

class ScheduleReportAggregationTest < ActiveSupport::TestCase
  def test_snapshot_builder_applies_limits
    rows = Array.new(501) { |i| { project_id: i + 1, name: "P#{i}", level: 0, expanded: true } }
    bars = Array.new(2001) do |i|
      {
        bar_key: "1:#{i}",
        project_id: 1,
        category_id: i,
        category_name: 'X',
        start_date: Date.today,
        end_date: Date.today,
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 0,
        is_delayed: false
      }
    end

    filters = RedmineReport::ScheduleReport::FilterParams.new({})
    snapshot = RedmineReport::ScheduleReport::SnapshotBuilder.new(rows: rows, bars: bars, filters: filters).call

    assert_equal 500, snapshot[:rows].size
    assert_equal 2000, snapshot[:bars].size
    assert snapshot[:meta][:warnings].any?
  end
end
