import { describe, it, expect, vi } from 'vitest';
import { buildTimelineViewModel } from './timeline';
import { CategoryBar, ProjectInfo } from '../../services/scheduleReportApi';
import { format } from 'date-fns';

// Mock t function if needed (though implementation seems safe)
vi.mock('../../i18n', async () => {
    const actual = await vi.importActual('../../i18n');
    return {
        ...actual,
        t: (key: string) => key,
        getLocale: () => 'ja',
        getDateFnsLocale: () => undefined
    };
});

describe('buildTimelineViewModel', () => {
  it('should include buffer days and partial months in the timeline', () => {
    const bars: CategoryBar[] = [
      {
        category_id: 1,
        category_name: 'Task 1',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        progress_rate: 0,
        project_id: 1,
        version_name: 'v1'
      }
    ];
    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, { id: 1, name: 'Project 1', identifier: 'p1' });

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000
    });

    // Check Header Months
    const monthLabels = viewModel.headerMonths.map(m => m.label);
    // With buffer: Feb 26 - Apr 3
    // Should include Feb, Mar, Apr
    // Date-fns format(..., 'M月') -> '2月', '3月', '4月'
    // Note: Actual implementation relies on 'ja' locale which produces 'M月'.
    // Mock returns 'ja' so we expect '2月', '3月', '4月'.

    // Check range logic
    // We expect 3 months: Feb (partial), Mar (full), Apr (partial)
    expect(monthLabels).toEqual(expect.arrayContaining(['2月', '3月', '4月']));
    expect(monthLabels.length).toBe(3);

    // Verify widths (approximate is fine, check relative sizes)
    // Feb: 26-28 (3 days)
    // Mar: 1-31 (31 days)
    // Apr: 1-3 (3 days)
    // Feb and Apr should have same width (approx)
    const feb = viewModel.headerMonths.find(m => m.label === '2月');
    const mar = viewModel.headerMonths.find(m => m.label === '3月');
    const apr = viewModel.headerMonths.find(m => m.label === '4月');

    expect(feb).toBeDefined();
    expect(mar).toBeDefined();
    expect(apr).toBeDefined();

    if (feb && mar && apr) {
        expect(feb.width).toBeLessThan(mar.width);
        expect(apr.width).toBeLessThan(mar.width);
        // Feb (7 days) vs Apr (7 days)
        expect(Math.abs(feb.width - apr.width)).toBeLessThan(1);
    }
  });

  it('should calculate todayX correctly even if outside range', () => {
     // Mock today to be outside range
     const today = new Date('2026-01-01');
     vi.useFakeTimers();
     vi.setSystemTime(today);

     const bars: CategoryBar[] = [
        {
          category_id: 1,
          category_name: 'Task 1',
          start_date: '2026-03-01',
          end_date: '2026-03-31',
          progress_rate: 0,
          project_id: 1,
          version_name: 'v1'
        }
      ];
      const projectMap = new Map<number, ProjectInfo>();

      const viewModel = buildTimelineViewModel({
        bars,
        selectedVersions: ['v1'],
        projectMap,
        containerWidth: 1000
      });

      // minDate should be ~Feb 26. Today is Jan 1.
      // todayX should be negative.
      expect(viewModel.todayX).toBeLessThan(0);

      vi.useRealTimers();
  });

  it('should calculate date range using only selected version bars', () => {
    const bars: CategoryBar[] = [
      {
        category_id: 1,
        category_name: 'Visible Task',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
        progress_rate: 0,
        project_id: 1,
        version_name: 'v1'
      },
      {
        category_id: 2,
        category_name: 'Hidden Task',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        progress_rate: 0,
        project_id: 1,
        version_name: 'v2'
      }
    ];

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, { id: 1, name: 'Project 1', identifier: 'p1' });

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000
    });

    expect(viewModel.totalDurationText).toBe('2026/02/26 - 2026/04/03');
    expect(viewModel.timelineData).toHaveLength(1);
    expect(viewModel.timelineData[0].steps).toHaveLength(1);
  });

  it('should not extend max date to today when all ticket dates are in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24'));

    const bars: CategoryBar[] = [
      {
        category_id: 1,
        category_name: 'Past Task',
        start_date: '2025-12-01',
        end_date: '2025-12-30',
        progress_rate: 100,
        project_id: 1,
        version_name: 'v1'
      }
    ];

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, { id: 1, name: 'Project 1', identifier: 'p1' });

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000
    });

    expect(viewModel.totalDurationText).toBe('2025/11/28 - 2026/01/02');

    vi.useRealTimers();
  });
});
