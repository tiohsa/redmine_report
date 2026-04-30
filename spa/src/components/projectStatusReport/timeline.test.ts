import { describe, it, expect, vi } from 'vitest';
import { buildTimelineViewModel } from './timeline';
import { CategoryBar, ProjectInfo } from '../../services/scheduleReportApi';

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
  const makeBar = (overrides: Partial<CategoryBar> = {}): CategoryBar => ({
    bar_key: `1:issue:${overrides.category_id ?? 1}`,
    project_id: 1,
    category_id: 1,
    category_name: 'Task 1',
    version_id: 1,
    version_name: 'v1',
    ticket_subject: 'Task 1',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    issue_count: 1,
    delayed_issue_count: 0,
    progress_rate: 0,
    is_delayed: false,
    dependencies: [],
    ...overrides
  });

  const makeProject = (overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
    project_id: 1,
    identifier: 'p1',
    name: 'Project 1',
    level: 0,
    ...overrides
  });

  it('should include buffer days and partial months in the timeline', () => {
    const bars: CategoryBar[] = [makeBar()];
    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, makeProject());

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

     const bars: CategoryBar[] = [makeBar()];
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
      makeBar({ category_id: 1, category_name: 'Visible Task' }),
      makeBar({
        category_id: 2,
        category_name: 'Hidden Task',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        version_name: 'v2'
      })
    ];

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, makeProject());

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


  it('should use configured display date range when provided', () => {
    const bars: CategoryBar[] = [makeBar()];

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1'],
      projectMap: new Map<number, ProjectInfo>(),
      containerWidth: 1000,
      displayStartDateIso: '2026-04-01',
      displayEndDateIso: '2026-04-30'
    });

    expect(viewModel.totalDurationText).toBe('2026/04/01 - 2026/04/30');
    expect(viewModel.axisStartDateIso).toBe('2026-04-01');
    expect(viewModel.axisEndDateIso).toBe('2026-04-30');
  });

  it('should not extend max date to today when all ticket dates are in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24'));

    const bars: CategoryBar[] = [
      makeBar({
        category_id: 1,
        category_name: 'Past Task',
        start_date: '2025-12-01',
        end_date: '2025-12-30',
        progress_rate: 100
      })
    ];

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, makeProject());

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000
    });

    expect(viewModel.totalDurationText).toBe('2025/11/28 - 2026/01/02');

    vi.useRealTimers();
  });

  it('should replace parent tickets with child tickets in Process Mode', () => {
    const parentBar: CategoryBar = {
      category_id: 100,
      category_name: 'Parent Task',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
      progress_rate: 50,
      project_id: 1,
      version_name: 'v1',
      issue_count: 0,
      delayed_issue_count: 0,
      is_delayed: false,
      dependencies: [],
      bar_key: 'key1'
    };

    const childBar1: CategoryBar = {
      ...parentBar,
      category_id: 101,
      category_name: 'Child 1',
      start_date: '2026-03-01',
      end_date: '2026-03-15'
    };
    const childBar2: CategoryBar = {
      ...parentBar,
      category_id: 102,
      category_name: 'Child 2',
      start_date: '2026-03-16',
      end_date: '2026-03-31'
    };

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, { project_id: 1, name: 'Project 1', identifier: 'p1', level: 0 });

    const childTicketsMap = new Map<number, CategoryBar[]>();
    childTicketsMap.set(100, [childBar1, childBar2]);

    const viewModel = buildTimelineViewModel({
      bars: [parentBar],
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000,
      isProcessMode: true,
      childTicketsMap
    });

    const lane = viewModel.timelineData[0];
    expect(lane.steps).toHaveLength(2);
    expect(lane.steps[0].issueId).toBe(101); // Child 1
    expect(lane.steps[1].issueId).toBe(102); // Child 2
  });

  it('should fallback to parent ticket if no children in Process Mode', () => {
    const parentBar: CategoryBar = {
      category_id: 200,
      category_name: 'Parent Task 2',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      progress_rate: 0,
      project_id: 1,
      version_name: 'v1',
      issue_count: 0,
      delayed_issue_count: 0,
      is_delayed: false,
      dependencies: [],
      bar_key: 'key2'
    };

    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, { project_id: 1, name: 'Project 1', identifier: 'p1', level: 0 });

    // Empty child map
    const childTicketsMap = new Map<number, CategoryBar[]>();

    const viewModel = buildTimelineViewModel({
      bars: [parentBar],
      selectedVersions: ['v1'],
      projectMap,
      containerWidth: 1000,
      isProcessMode: true,
      childTicketsMap
    });

    const lane = viewModel.timelineData[0];
    expect(lane.steps).toHaveLength(1);
    expect(lane.steps[0].issueId).toBe(200); // Parent
  });

  it('orders lanes by versionOrder', () => {
    const bars: CategoryBar[] = [
      makeBar({ category_id: 1, version_name: 'v1' }),
      makeBar({ category_id: 2, version_name: 'v2' })
    ];
    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, makeProject());

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1', 'v2'],
      versionOrder: ['v2', 'v1'],
      projectMap,
      containerWidth: 1000
    });

    expect(viewModel.timelineData.map((lane) => lane.versionName)).toEqual(['v2', 'v1']);
  });

  it('orders lanes globally by version then project', () => {
    const bars: CategoryBar[] = [
      makeBar({ category_id: 1, project_id: 2, version_name: 'v1' }),
      makeBar({ category_id: 2, project_id: 1, version_name: 'v2' }),
      makeBar({ category_id: 3, project_id: 1, version_name: 'v1' }),
      makeBar({ category_id: 4, project_id: 2, version_name: 'v2' })
    ];
    const projectMap = new Map<number, ProjectInfo>();
    projectMap.set(1, makeProject({ project_id: 1, identifier: 'p1', name: 'Project 1' }));
    projectMap.set(2, makeProject({ project_id: 2, identifier: 'p2', name: 'Project 2' }));

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1', 'v2'],
      versionOrder: ['v2', 'v1'],
      projectMap,
      containerWidth: 1000
    });

    expect(viewModel.timelineData.map((lane) => `${lane.versionName}:${lane.projectId}`)).toEqual([
      'v2:1',
      'v2:2',
      'v1:1',
      'v1:2'
    ]);
  });

  it('places versions missing from versionOrder at the end', () => {
    const bars: CategoryBar[] = [
      makeBar({ category_id: 1, version_name: 'v1' }),
      makeBar({ category_id: 2, version_name: 'v2' }),
      makeBar({ category_id: 3, version_name: 'v3' })
    ];

    const viewModel = buildTimelineViewModel({
      bars,
      selectedVersions: ['v1', 'v2', 'v3'],
      versionOrder: ['v2', 'v1'],
      projectMap: new Map<number, ProjectInfo>([[1, makeProject()]]),
      containerWidth: 1000
    });

    expect(viewModel.timelineData.map((lane) => lane.versionName)).toEqual(['v2', 'v1', 'v3']);
  });
});
