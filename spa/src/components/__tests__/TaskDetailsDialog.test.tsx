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

    const startDateInput = container.querySelector('input[type="date"]');
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
    const addButton = screen.getByTitle('子チケットを追加');
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
    expect(screen.getByText('65%')).toBeTruthy();

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
    expect(screen.getByText('New child issue')).toBeTruthy();
    expect(screen.queryByTitle('子チケット新規登録')).toBeNull();
  });
});
