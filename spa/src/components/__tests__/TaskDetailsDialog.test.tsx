import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailsDialog } from '../projectStatusReport/TaskDetailsDialog';

const fetchTaskDetailsMock = vi.fn();
const updateTaskDatesMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    fetchTaskDetails: (...args: unknown[]) => fetchTaskDetailsMock(...args),
    updateTaskDates: (...args: unknown[]) => updateTaskDatesMock(...args)
  };
});

describe('TaskDetailsDialog', () => {
  beforeEach(() => {
    fetchTaskDetailsMock.mockReset();
    updateTaskDatesMock.mockReset();

    if (!(globalThis as any).ResizeObserver) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
    }
  });

  it('triggers timeline refresh only when dialog closes after date changes', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);
    updateTaskDatesMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-02-03',
      due_date: '2026-02-10',
      issue_url: '/issues/10'
    });

    const onTaskDatesUpdated = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onTaskDatesUpdated={onTaskDatesUpdated}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('task-details-process-flow-svg')).toBeTruthy();
    expect(screen.getAllByTestId('task-details-process-step')).toHaveLength(1);
    expect(screen.queryByTestId('task-details-process-step-hit-10')).toBeNull();
    expect(screen.getByTestId('task-details-process-step-hit-11')).toBeTruthy();

    const startDateInput = screen.getAllByTestId('start-date-input')[0];
    expect(startDateInput).toBeTruthy();

    fireEvent.change(startDateInput as HTMLInputElement, { target: { value: '2026-02-03' } });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    await waitFor(() => expect(updateTaskDatesMock).toHaveBeenCalledTimes(1));
    expect(onTaskDatesUpdated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Close dialog|ダイアログを閉じる/ }));

    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });


  it('renders draggable process flow handles for leaf tasks', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('task-details-process-step-hit-11')).toBeTruthy();
    expect(screen.getByTestId('task-details-process-step-left-11')).toBeTruthy();
    expect(screen.getByTestId('task-details-process-step-right-11')).toBeTruthy();
  });

  it('shows issue subject and id in the dialog title', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        issueTitle="Leaf issue"
        versionName="Sprint 1"
        projectName="eCookbook"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    const title = screen.getByTestId('task-details-title');
    expect(title.textContent).toBe('Leaf issue #10');
    expect(title.textContent).not.toContain('Sprint 1 / eCookbook');
  });

  it('renders year and month headers and updates bar width when leaf dates change', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-03-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Design',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 10,
        subject: 'Build',
        start_date: '2026-03-01',
        due_date: '2026-03-06',
        done_ratio: 10,
        issue_url: '/issues/12'
      }
    ]);
    updateTaskDatesMock.mockResolvedValue({
      issue_id: 11,
      parent_id: 10,
      subject: 'Design',
      start_date: '2026-02-03',
      due_date: '2026-02-10',
      issue_url: '/issues/11'
    });

    const { container } = render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    const yearHeaders = container.querySelectorAll('[data-testid^="task-details-process-year-"]');
    const monthHeaders = container.querySelectorAll('[data-testid^="task-details-process-month-"]');
    expect(yearHeaders.length).toBeGreaterThan(0);
    expect(monthHeaders.length).toBeGreaterThanOrEqual(2);

    const designBar = screen.getByTestId('task-details-process-step-hit-11');
    const buildBar = screen.getByTestId('task-details-process-step-hit-12');
    const initialWidth = Number(designBar.getAttribute('width'));
    const designX = Number(designBar.getAttribute('x'));
    const buildX = Number(buildBar.getAttribute('x'));
    expect(buildX).toBeGreaterThan(designX);

    fireEvent.change(screen.getAllByTestId('due-date-input')[1] as HTMLInputElement, {
      target: { value: '2026-02-10' }
    });

    await waitFor(() => {
      expect(Number(screen.getByTestId('task-details-process-step-hit-11').getAttribute('width'))).toBeGreaterThan(initialWidth);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    await waitFor(() => {
      expect(updateTaskDatesMock).toHaveBeenCalledWith('ecookbook', 11, {
        start_date: '2026-02-03',
        due_date: '2026-02-10'
      });
    });
  });

  it('opens create issue dialog with redmine default new issue screen', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);
    const onClose = vi.fn();

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    // Click the add sub-issue button (appears on row hover)
    const addButton = screen.getAllByTitle('子チケットを追加')[0];
    fireEvent.click(addButton);

    const iframe = screen.getByTitle('子チケット新規登録') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    const iframeSrc = iframe.getAttribute('src');
    expect(iframeSrc).toBeTruthy();
    const srcUrl = new URL(iframeSrc as string, 'http://localhost');
    expect(srcUrl.pathname).toBe('/projects/ecookbook/issues/new');
    expect(srcUrl.searchParams.get('issue[parent_issue_id]')).toBe('10');
    expect(srcUrl.searchParams.get('issue[start_date]')).toBe('2026-02-01');
    expect(srcUrl.searchParams.get('issue[due_date]')).toBe('2026-02-10');
    expect(srcUrl.searchParams.get('start_date')).toBe('2026-02-01');
    expect(srcUrl.searchParams.get('due_date')).toBe('2026-02-10');
    expect(screen.getAllByTestId('progress-text').some(t => t.textContent === '65%')).toBeTruthy();

    const styleElement = { textContent: '' } as unknown as HTMLStyleElement;
    const fakeDoc = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => styleElement),
      querySelectorAll: vi.fn(() => []),
      location: { pathname: '/projects/ecookbook/issues/new' }
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: fakeDoc
    });

    fireEvent.load(iframe);

    expect(fakeDoc.head.appendChild).toHaveBeenCalledTimes(1);
    expect(styleElement.textContent).toContain('input[name="commit"]');
    expect(styleElement.textContent).toContain('input[name="continue"]');

    fireEvent.click(screen.getByRole('button', { name: /新規チケット作成ダイアログを閉じる/ }));
    expect(screen.queryByTitle('子チケット新規登録')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens edit issue dialog from the hovered row edit icon', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByTitle(/Edit in Redmine|チケットを編集/)[0]);

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe('/issues/10/edit');
  });

  it('keeps edit issue dialog open when validation error returns edit form on /issues/:id', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByTitle(/Edit in Redmine|チケットを編集/)[0]);

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const styleElement = { textContent: '' } as unknown as HTMLStyleElement;
    const fakeDoc = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => styleElement),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn((selector: string) => (selector === 'form#issue-form' ? ({}) : null)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { pathname: '/issues/10' }
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: fakeDoc
    });

    fireEvent.load(iframe);

    expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeTruthy();
  });

  it('reloads task details after a sub-issue is created', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-02-01',
          due_date: '2026-02-10',
          issue_url: '/issues/10'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-02-01',
          due_date: '2026-02-10',
          issue_url: '/issues/10'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-02-01',
          due_date: '2026-02-10',
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'New child issue',
          start_date: null,
          due_date: null,
          issue_url: '/issues/11'
        }
      ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('子チケットを追加'));

    const iframe = screen.getByTitle('子チケット新規登録') as HTMLIFrameElement;
    const fakeDoc = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => ({ textContent: '' })),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { pathname: '/issues/11' }
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: fakeDoc
    });

    fireEvent.load(iframe);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(3));
    const subjects = screen.getAllByTestId('task-subject');
    expect(subjects.some(s => s.textContent === 'New child issue')).toBeTruthy();
    expect(screen.queryByTitle('子チケット新規登録')).toBeNull();
  });
});
