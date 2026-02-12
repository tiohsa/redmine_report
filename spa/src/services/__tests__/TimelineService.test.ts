import { describe, it, expect } from 'vitest';
import { TimelineService } from '../TimelineService';
import { CategoryBar, ProjectRow } from '../scheduleReportApi';

describe('TimelineService', () => {
  it('calculates layout correctly', () => {
    const service = new TimelineService();
    const startDate = new Date('2024-01-01');
    const months = 2; // Jan, Feb 2024 (Leap year: 31 + 29 = 60 days)

    const rows: ProjectRow[] = [
      { project_id: 1, name: 'Project A', level: 0, expanded: true, parent_project_id: null }
    ];

    const bars: CategoryBar[] = [
      {
        bar_key: '1-1',
        project_id: 1,
        category_id: 1,
        category_name: 'Cat 1',
        start_date: '2024-01-01',
        end_date: '2024-01-10', // 9 days duration
        issue_count: 5,
        delayed_issue_count: 0,
        progress_rate: 50,
        is_delayed: false
      }
    ];

    const layout = service.calculateLayout(rows, bars, months, startDate);

    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].bars).toHaveLength(1);

    const bar = layout.rows[0].bars[0];
    expect(bar.leftPct).toBe(0);
    // Total days approx 60. Duration 9 days.
    // 9 / 60 * 100 = 15%
    expect(bar.widthPct).toBeGreaterThan(10);
    expect(bar.widthPct).toBeLessThan(20);
    expect(bar.laneIndex).toBe(0);
  });

  it('handles overlapping bars by stacking', () => {
    const service = new TimelineService();
    const startDate = new Date('2024-01-01');
    const months = 2;

    const rows: ProjectRow[] = [
      { project_id: 1, name: 'Project A', level: 0, expanded: true, parent_project_id: null }
    ];

    const bars: CategoryBar[] = [
      {
        bar_key: '1-1',
        project_id: 1,
        category_id: 1,
        category_name: 'Cat 1',
        start_date: '2024-01-01',
        end_date: '2024-01-10',
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 0,
        is_delayed: false
      },
      {
        bar_key: '1-2',
        project_id: 1,
        category_id: 2,
        category_name: 'Cat 2',
        start_date: '2024-01-05', // Overlaps with Cat 1
        end_date: '2024-01-15',
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 0,
        is_delayed: false
      }
    ];

    const layout = service.calculateLayout(rows, bars, months, startDate);

    const row = layout.rows[0];
    expect(row.bars).toHaveLength(2);

    const bar1 = row.bars.find(b => b.category_name === 'Cat 1')!;
    const bar2 = row.bars.find(b => b.category_name === 'Cat 2')!;

    expect(bar1.laneIndex).not.toBe(bar2.laneIndex);
    expect(row.height).toBeGreaterThan(60); // Should expand for 2 lanes
  });
});
