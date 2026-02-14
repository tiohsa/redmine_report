import type { ReportSnapshot } from '../../../services/scheduleReportApi';

export const buildSnapshotFixture = (overrides: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  meta: {
    generated_at: new Date().toISOString(),
    stale_after_seconds: 300,
    limits: { max_rows: 500, max_bars: 2000 },
    warnings: [],
    applied_filters: {
      include_subprojects: true,
      months: 4,
      start_month: '2026-02',
      status_scope: 'all',
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
  available_projects: [
    {
      project_id: 1,
      identifier: 'ecookbook',
      name: 'eCookbook',
      level: 0,
      parent_project_id: null,
      selectable: true
    }
  ],
  ...overrides
});
