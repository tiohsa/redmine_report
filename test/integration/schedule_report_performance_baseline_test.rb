# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ScheduleReportPerformanceBaselineTest < ActiveSupport::TestCase
  def test_performance_targets_are_documented
    plan_path = File.expand_path('../../../specs/001-read-spec-md/plan.md', __dir__)
    text = File.read(plan_path)

    assert_includes text, '初回表示 p95 8秒以内'
    assert_includes text, 'フィルタ更新 p95 3秒以内'
    assert_includes text, '最大5分鮮度遅延許容'
  end
end
