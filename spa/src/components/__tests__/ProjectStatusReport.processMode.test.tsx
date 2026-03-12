import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatusReport } from '../ProjectStatusReport';
import type { CategoryBar } from '../../services/scheduleReportApi';
import { useUiStore } from '../../stores/uiStore';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const fetchChildIssuesMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    fetchChildIssues: (...args: unknown[]) => fetchChildIssuesMock(...args)
  };
});

vi.mock('../projectStatusReport/TimelineChart', () => ({
  TimelineChart: ({ timelineData }: { timelineData: Array<{ steps: Array<{ issueId?: number }> }> }) => {
    const ids = timelineData.flatMap((lane) => lane.steps.map((step) => step.issueId)).filter(Boolean).join(',');
    return <div data-testid="timeline-step-ids">{ids}</div>;
  }
}));

vi.mock('../projectStatusReport/VersionAiDialog', () => ({
  VersionAiDialog: () => null
}));

vi.mock('../AiResponsePanel', () => ({
  AiResponsePanel: () => null
}));

const makeBar = (overrides: Partial<CategoryBar> = {}): CategoryBar => ({
  bar_key: `1:issue:${overrides.category_id ?? 100}`,
  project_id: 1,
  category_id: 100,
  category_name: 'Parent',
  version_id: 1,
  version_name: 'v1',
  ticket_subject: 'Parent',
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  issue_count: 1,
  delayed_issue_count: 0,
  progress_rate: 20,
  is_delayed: false,
  dependencies: [],
  ...overrides
});

describe('ProjectStatusReport Process Mode', () => {
  beforeEach(() => {
    fetchChildIssuesMock.mockReset();
    window.localStorage.removeItem('redmine_report.schedule.processMode');
    useUiStore.setState({
      rootProjectIdentifier: 'ecookbook',
      currentProjectIdentifier: 'ecookbook',
      selectedProjectIdentifiers: ['ecookbook']
    });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    if (!(globalThis as any).ResizeObserver) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
    }
  });

  it('clears loading and keeps parent steps when child fetch fails', async () => {
    fetchChildIssuesMock.mockRejectedValueOnce(new Error('boom'));

    render(
      <ProjectStatusReport
        bars={[makeBar({ category_id: 100 })]}
        projectIdentifier="ecookbook"
        availableProjects={[{ project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true }]}
        selectedVersions={['v1']}
      />
    );

    expect(screen.getByTestId('timeline-step-ids').textContent).toContain('100');

    const processButton = screen.getByTitle(/Process Mode/i);
    fireEvent.click(processButton);

    expect(processButton.textContent || '').toContain('...');

    await waitFor(() => {
      expect(processButton.textContent || '').toContain('ON');
      expect(processButton.textContent || '').not.toContain('...');
    });

    expect(screen.getByTestId('timeline-step-ids').textContent).toContain('100');
    expect(screen.getByRole('alert').textContent || '').toContain('boom');
  });


  it('opens date range dialog from header icon and applies selected dates', async () => {
    render(
      <ProjectStatusReport
        bars={[makeBar({ category_id: 100 })]}
        projectIdentifier="ecookbook"
        availableProjects={[{ project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true }]}
        selectedVersions={['v1']}
      />
    );

    fireEvent.click(screen.getByTitle(/Date Range|表示期間/i));

    const dialog = screen.getByRole('dialog');
    const inputs = dialog.querySelectorAll('input[type="date"]');
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: '2026-03-01' } });
    fireEvent.change(inputs[1], { target: { value: '2026-03-20' } });
    fireEvent.click(screen.getByRole('button', { name: /Save|保存/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(screen.getByTitle(/Date Range|表示期間/i));
    const updatedDialog = screen.getByRole('dialog');
    const updatedInputs = updatedDialog.querySelectorAll('input[type="date"]');
    expect((updatedInputs[0] as HTMLInputElement).value).toBe('2026-03-01');
    expect((updatedInputs[1] as HTMLInputElement).value).toBe('2026-03-20');
  });

  it('ignores stale child issue response when bars update during Process Mode', async () => {
    const first = createDeferred<Map<number, CategoryBar[]>>();
    const second = createDeferred<Map<number, CategoryBar[]>>();

    fetchChildIssuesMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { rerender } = render(
      <ProjectStatusReport
        bars={[makeBar({ category_id: 100, ticket_subject: 'Parent A', category_name: 'Parent A' })]}
        projectIdentifier="ecookbook"
        availableProjects={[{ project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true }]}
        selectedVersions={['v1']}
      />
    );

    fireEvent.click(screen.getByTitle(/Process Mode/i));

    await waitFor(() => expect(fetchChildIssuesMock).toHaveBeenCalledTimes(1));

    rerender(
      <ProjectStatusReport
        bars={[makeBar({ category_id: 200, ticket_subject: 'Parent B', category_name: 'Parent B' })]}
        projectIdentifier="ecookbook"
        availableProjects={[{ project_id: 1, identifier: 'ecookbook', name: 'eCookbook', level: 0, selectable: true }]}
        selectedVersions={['v1']}
      />
    );

    await waitFor(() => expect(fetchChildIssuesMock).toHaveBeenCalledTimes(2));

    second.resolve(new Map([
      [200, [makeBar({ category_id: 201, category_name: 'Child B', ticket_subject: 'Child B' })]]
    ]));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-step-ids').textContent).toContain('201');
    });

    first.resolve(new Map([
      [100, [makeBar({ category_id: 101, category_name: 'Child A', ticket_subject: 'Child A' })]]
    ]));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-step-ids').textContent).toContain('201');
      expect(screen.getByTestId('timeline-step-ids').textContent).not.toContain('101');
    });
  });
});
