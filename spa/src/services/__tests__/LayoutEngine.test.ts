import { describe, expect, it } from 'vitest';
import { LayoutEngine } from '../LayoutEngine';

describe('LayoutEngine', () => {
  it('assigns bars into separate lanes when bars overlap', () => {
    const layout = new LayoutEngine().calculateLayout(
      [
        {
          project_id: 1,
          name: 'Root',
          parent_project_id: null,
          level: 0,
          expanded: true
        }
      ],
      [
        {
          bar_key: 'a',
          project_id: 1,
          category_id: 1,
          category_name: 'A',
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 10,
          is_delayed: false
        },
        {
          bar_key: 'b',
          project_id: 1,
          category_id: 2,
          category_name: 'B',
          start_date: '2026-01-05',
          end_date: '2026-01-20',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 10,
          is_delayed: false
        }
      ],
      2,
      1200,
      new Date('2026-01-01')
    );

    expect(layout.rows[0].bars).toHaveLength(2);
    expect(layout.rows[0].bars[0].rowY).not.toBe(layout.rows[0].bars[1].rowY);
  });
});
