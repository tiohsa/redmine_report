import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleReportPage } from '../ScheduleReportPage';
import { useTaskStore } from '../../stores/taskStore';
import { useUiStore } from '../../stores/uiStore';
import { buildSnapshotFixture } from './fixtures/scheduleReportFixture';

vi.mock('../ProjectStatusReport', () => ({
  ProjectStatusReport: ({
    projectIdentifier,
    fetchError,
    selectedVersions,
    onTaskDatesUpdated
  }: {
    projectIdentifier: string;
    fetchError?: string | null;
    selectedVersions?: string[];
    onTaskDatesUpdated?: () => void;
  }) => (
    <div data-testid="project-report">
      <div>project:{projectIdentifier}</div>
      <div>{fetchError ? `error:${fetchError}` : 'error:none'}</div>
      <div>versions:{(selectedVersions || []).join(',')}</div>
      <button type="button" onClick={() => onTaskDatesUpdated?.()}>
        refresh
      </button>
    </div>
  )
}));

const fetchScheduleReportMock = vi.fn();
vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    fetchScheduleReport: (...args: unknown[]) => fetchScheduleReportMock(...args)
  };
});

describe('Schedule report interactions', () => {
  beforeEach(() => {
    fetchScheduleReportMock.mockReset();
    window.localStorage.clear();
    useUiStore.setState({
      rootProjectIdentifier: 'ecookbook',
      currentProjectIdentifier: 'ecookbook',
      selectedProjectIdentifiers: ['ecookbook'],
      filters: {
        include_subprojects: false,
        months: 4,
        start_month: '2026-02',
        status_scope: 'all',
        viewMode: 'month'
      }
    });
    useTaskStore.setState({
      rows: [],
      bars: [],
      availableProjects: [
        { project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true },
        { project_id: 2, identifier: 'child', name: 'Child', level: 1, selectable: true }
      ],
      warnings: [],
      generatedAt: null,
      isLoading: false,
      errorMessage: null
    });
  });

  it('keeps latest selected project result when responses return out of order', async () => {
    let resolveChild: (value: ReturnType<typeof buildSnapshotFixture>) => void = () => undefined;
    let resolveLatest: (value: ReturnType<typeof buildSnapshotFixture>) => void = () => undefined;

    fetchScheduleReportMock
      .mockResolvedValueOnce(buildSnapshotFixture({
        available_projects: [
          { project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true },
          { project_id: 2, identifier: 'child', name: 'Child', level: 1, selectable: true }
        ]
      })) // initial load
      .mockImplementationOnce(() => new Promise((resolve) => { resolveChild = resolve; })) // child
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; })); // ecookbook latest

    render(<ScheduleReportPage />);
    await waitFor(() => expect(fetchScheduleReportMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      useUiStore.getState().setSelectedProjectIdentifiers(['child']);
    });
    await act(async () => {
      useUiStore.getState().setSelectedProjectIdentifiers(['ecookbook']);
    });

    resolveLatest(buildSnapshotFixture({
      bars: [{
        bar_key: 'b2', project_id: 1, category_id: 1, category_name: 'Cat',
        start_date: '2026-02-01', end_date: '2026-02-10', issue_count: 1,
        delayed_issue_count: 0, progress_rate: 100, is_delayed: false, dependencies: []
      }]
    }));

    resolveChild(buildSnapshotFixture({
      bars: [{
        bar_key: 'b1', project_id: 2, category_id: 1, category_name: 'Old',
        start_date: '2026-02-01', end_date: '2026-02-02', issue_count: 1,
        delayed_issue_count: 0, progress_rate: 10, is_delayed: false, dependencies: []
      }]
    }));

    await waitFor(() => {
      expect(screen.getByTestId('project-report')).toBeTruthy();
      expect(useTaskStore.getState().bars[0]?.bar_key).toBe('b2');
    });
  });

  it('retains last successful snapshot and sets error on fetch failure', async () => {
    fetchScheduleReportMock
      .mockResolvedValueOnce(buildSnapshotFixture({
        bars: [{
          bar_key: 'ok', project_id: 1, category_id: 1, category_name: 'Ok',
          start_date: '2026-02-01', end_date: '2026-02-03', issue_count: 1,
          delayed_issue_count: 0, progress_rate: 50, is_delayed: false, dependencies: []
        }]
      }))
      .mockRejectedValueOnce(new Error('503 unavailable'));

    render(<ScheduleReportPage />);

    await waitFor(() => expect(useTaskStore.getState().bars[0]?.bar_key).toBe('ok'));

    await act(async () => {
      useUiStore.getState().setCurrentProjectIdentifier('child');
    });

    await waitFor(() => {
      expect(useTaskStore.getState().bars[0]?.bar_key).toBe('ok');
      expect(useTaskStore.getState().errorMessage).toBeTruthy();
    });
  });

  it('shows empty result without error when API returns no rows and bars', async () => {
    fetchScheduleReportMock.mockResolvedValueOnce(buildSnapshotFixture({
      rows: [],
      bars: [],
      selection_summary: {
        total_candidates: 0,
        excluded_not_visible: 0,
        excluded_invalid_hierarchy: 0,
        displayed_top_parent_count: 0
      }
    }));

    render(<ScheduleReportPage />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-report-scroll').className).toContain('report-shell-scroll');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(useTaskStore.getState().errorMessage).toBeNull();
      expect(useTaskStore.getState().rows).toHaveLength(0);
      expect(useTaskStore.getState().bars).toHaveLength(0);
    });
  });

  it('restores persisted version selection filtered by available versions', async () => {
    window.localStorage.setItem(
      'redmine_report.schedule.selectedVersions.ecookbook',
      JSON.stringify(['Beta', 'Missing'])
    );
    fetchScheduleReportMock.mockResolvedValueOnce(buildSnapshotFixture({
      bars: [
        {
          bar_key: 'b1',
          project_id: 1,
          category_id: 1,
          category_name: 'Alpha',
          version_name: 'Alpha',
          start_date: '2026-02-01',
          end_date: '2026-02-05',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 30,
          is_delayed: false,
          dependencies: []
        },
        {
          bar_key: 'b2',
          project_id: 1,
          category_id: 2,
          category_name: 'Beta',
          version_name: 'Beta',
          start_date: '2026-02-02',
          end_date: '2026-02-06',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 40,
          is_delayed: false,
          dependencies: []
        }
      ]
    }));

    render(<ScheduleReportPage />);

    await waitFor(() => {
      expect(screen.getByText('versions:Beta')).toBeTruthy();
    });
    expect(window.localStorage.getItem('redmine_report.schedule.selectedVersions.ecookbook')).toBe(
      JSON.stringify(['Beta'])
    );
  });

  it('refreshes schedule data when ProjectStatusReport requests a reload', async () => {
    fetchScheduleReportMock
      .mockResolvedValueOnce(buildSnapshotFixture({
        bars: [{
          bar_key: 'before',
          project_id: 1,
          category_id: 1,
          category_name: 'Before',
          start_date: '2026-02-01',
          end_date: '2026-02-03',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 20,
          is_delayed: false,
          dependencies: []
        }]
      }))
      .mockResolvedValueOnce(buildSnapshotFixture({
        bars: [{
          bar_key: 'after',
          project_id: 1,
          category_id: 1,
          category_name: 'After',
          start_date: '2026-02-04',
          end_date: '2026-02-07',
          issue_count: 1,
          delayed_issue_count: 0,
          progress_rate: 60,
          is_delayed: false,
          dependencies: []
        }]
      }));

    render(<ScheduleReportPage />);
    await waitFor(() => expect(useTaskStore.getState().bars[0]?.bar_key).toBe('before'));

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(fetchScheduleReportMock).toHaveBeenCalledTimes(2));
    expect(useTaskStore.getState().bars[0]?.bar_key).toBe('after');
  });

  it('does not refresh schedule data on window focus', async () => {
    fetchScheduleReportMock.mockResolvedValueOnce(buildSnapshotFixture({
      bars: [{
        bar_key: 'before-focus',
        project_id: 1,
        category_id: 1,
        category_name: 'Before focus',
        start_date: '2026-02-01',
        end_date: '2026-02-03',
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 20,
        is_delayed: false,
        dependencies: []
      }]
    }));

    render(<ScheduleReportPage />);
    await waitFor(() => expect(useTaskStore.getState().bars[0]?.bar_key).toBe('before-focus'));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(fetchScheduleReportMock).toHaveBeenCalledTimes(1);
    expect(useTaskStore.getState().bars[0]?.bar_key).toBe('before-focus');
  });
});
