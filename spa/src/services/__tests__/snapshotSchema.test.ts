import { describe, expect, it } from 'vitest';
import type { ReportSnapshot } from '../scheduleReportApi';

describe('ReportSnapshot shape', () => {
  it('contains required top-level fields', () => {
    const snapshot = {
      meta: {
        generated_at: new Date().toISOString(),
        stale_after_seconds: 300,
        limits: { max_rows: 500, max_bars: 2000 },
        warnings: [],
        applied_filters: {
          include_subprojects: true,
          months: 4,
          start_month: '2026-02',
          status_scope: 'open',
          filter_rule: 'open_version_top_parent'
        }
      },
      rows: [],
      bars: [],
      selection_summary: {
        total_candidates: 0,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0,
        displayed_top_parent_count: 0
      },
      available_projects: []
    } as ReportSnapshot;

    expect(snapshot.meta.stale_after_seconds).toBe(300);
    expect(Array.isArray(snapshot.rows)).toBe(true);
    expect(Array.isArray(snapshot.bars)).toBe(true);
  });
});
