import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterToolbar } from '../FilterToolbar';
import { ScheduleReportPage } from '../ScheduleReportPage';
import { useTaskStore } from '../../stores/taskStore';
import { useUiStore } from '../../stores/uiStore';
import { buildSnapshotFixture } from './fixtures/scheduleReportFixture';

vi.mock('../ProjectStatusReport', () => ({
  ProjectStatusReport: ({ projectIdentifier, fetchError }: { projectIdentifier: string; fetchError?: string | null }) => (
    <div data-testid="project-report">
      <div>project:{projectIdentifier}</div>
      <div>{fetchError ? `error:${fetchError}` : 'error:none'}</div>
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
    useUiStore.setState({
      rootProjectIdentifier: 'ecookbook',
      currentProjectIdentifier: 'ecookbook',
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

  it('renders project selector and changes current selection without navigation', () => {
    render(<FilterToolbar />);
    const select = screen.getByLabelText('Project') as HTMLSelectElement;
    const beforePath = window.location.pathname;

    expect(select.value).toBe('ecookbook');
    expect(screen.getByRole('option', { name: 'eCookbook' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Child/ })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'child' } });

    expect(useUiStore.getState().currentProjectIdentifier).toBe('child');
    expect(window.location.pathname).toBe(beforePath);
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

    const select = screen.getByLabelText('Project');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'child' } });
    });
    await act(async () => {
      fireEvent.change(select, { target: { value: 'ecookbook' } });
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
      expect(useTaskStore.getState().errorMessage).toContain('503');
    });
  });
});
