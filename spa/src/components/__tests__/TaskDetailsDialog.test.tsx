import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailsDialog } from '../projectStatusReport/TaskDetailsDialog';

const fetchTaskDetailsMock = vi.fn();
const fetchTaskMastersMock = vi.fn();
const updateTaskDatesMock = vi.fn();
const updateTaskFieldsMock = vi.fn();
const createIssueMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    fetchTaskDetails: (...args: unknown[]) => fetchTaskDetailsMock(...args),
    fetchTaskMasters: (...args: unknown[]) => fetchTaskMastersMock(...args),
    updateTaskDates: (...args: unknown[]) => updateTaskDatesMock(...args),
    updateTaskFields: (...args: unknown[]) => updateTaskFieldsMock(...args)
  };
});

vi.mock('../bulkIssueRegistration/bulkIssueApi', () => ({
  createIssue: (...args: unknown[]) => createIssueMock(...args)
}));

const buildEmbeddedIssueDocument = ({
  formId = 'issue-form',
  action = '/issues',
  method = 'post',
  subject = 'Embedded issue',
  trackerId,
  priorityId,
  assignedToId,
  startDate,
  dueDate
}: {
  formId?: string;
  action?: string;
  method?: string;
  subject?: string;
  trackerId?: string;
  priorityId?: string;
  assignedToId?: string;
  startDate?: string;
  dueDate?: string;
}) => {
  const doc = document.implementation.createHTMLDocument('iframe');
  const form = doc.createElement('form');
  form.setAttribute('id', formId);
  form.setAttribute('action', action);
  form.setAttribute('method', method);

  const appendInput = (name: string, value?: string, id?: string) => {
    if (value === undefined) return;
    const input = doc.createElement('input');
    input.setAttribute('name', name);
    input.value = value;
    if (id) input.id = id;
    form.appendChild(input);
  };

  appendInput('issue[subject]', subject);
  appendInput('issue[tracker_id]', trackerId);
  appendInput('issue[priority_id]', priorityId);
  appendInput('issue[assigned_to_id]', assignedToId);
  appendInput('issue[start_date]', startDate);
  appendInput('issue[due_date]', dueDate);
  appendInput('issue_subject', subject, 'issue_subject');

  doc.body.appendChild(form);
  return { doc, form };
};

const flushDateSaveDebounce = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
};

const openDateEditor = async (displayTestId: string) => {
  fireEvent.doubleClick(screen.getByTestId(displayTestId));
  return screen.findByTestId(displayTestId.replace('-display-', '-input-'));
};

const mockTaskMasters = () => {
  fetchTaskMastersMock.mockResolvedValue({
    trackers: [
      { id: 1, name: 'Bug' },
      { id: 2, name: 'Feature' }
    ],
    priorities: [
      { id: 3, name: 'Normal' },
      { id: 4, name: 'High' }
    ],
    statuses: [
      { id: 1, name: 'New', is_closed: false },
      { id: 2, name: 'In Progress', is_closed: false },
      { id: 5, name: 'Closed', is_closed: true }
    ],
    members: [
      { id: null, name: '-' },
      { id: 8, name: 'Alice' },
      { id: 9, name: 'Bob' }
    ]
  });
};

const getLocalIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('TaskDetailsDialog', () => {
  beforeEach(() => {
    fetchTaskDetailsMock.mockReset();
    fetchTaskMastersMock.mockReset();
    updateTaskDatesMock.mockReset();
    updateTaskFieldsMock.mockReset();
    createIssueMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchTaskMastersMock.mockRejectedValue(new Error('masters unavailable'));
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });

    if (!(globalThis as any).ResizeObserver) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
    }
  });

  it('commits a date edit on Enter and refreshes the timeline only after the dialog closes', async () => {
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

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onTaskDatesUpdated={onTaskDatesUpdated}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('task-details-process-flow-canvas')).toBeTruthy();
    expect(screen.getAllByTestId('task-details-process-step')).toHaveLength(1);
    expect(screen.queryByTestId('task-details-process-step-hit-10')).toBeNull();
    expect(screen.getByTestId('task-details-process-step-hit-11')).toBeTruthy();

    await openDateEditor('start-date-display-10');
    expect(screen.getByTestId('start-date-display-10').textContent).toBe('2026/02/01');

    const picker = screen.getByRole('dialog', { name: 'Choose Date' });
    const day = picker.querySelector('[data-inline-date-picker-day][data-date="2026-02-03"]');
    expect(day).toBeTruthy();
    fireEvent.click(day as Element);

    await flushDateSaveDebounce();

    await waitFor(() => expect(updateTaskDatesMock).toHaveBeenCalledTimes(1));
    expect(updateTaskDatesMock).toHaveBeenCalledWith('ecookbook', 10, {
      start_date: '2026-02-03',
      due_date: '2026-02-10'
    });
    expect(onTaskDatesUpdated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Close dialog|ダイアログを閉じる/ }));

    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the report when the dialog closes without changes', async () => {
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

    const onTaskDatesUpdated = vi.fn();
    const onClose = vi.fn();

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onTaskDatesUpdated={onTaskDatesUpdated}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Close dialog|ダイアログを閉じる/ }));

    expect(onTaskDatesUpdated).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows date range as text until double click enables inline date editing', async () => {
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

    expect(screen.getByTestId('start-date-display-11').textContent).toBe('2026/02/03');
    expect(screen.getByTestId('due-date-display-11').textContent).toBe('2026/02/08');

    await openDateEditor('start-date-display-11');

    expect(screen.getByTestId('start-date-display-11').textContent).toBe('2026/02/03');
    expect(screen.getByTestId('due-date-display-11').textContent).toBe('2026/02/08');
  });

  it('supports Today action in the inline date picker', async () => {
    const today = getLocalIsoDate();

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
        due_date: null,
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);
    updateTaskDatesMock.mockResolvedValue({
      issue_id: 11,
      parent_id: 10,
      subject: 'Leaf issue',
      start_date: today,
      due_date: null,
      issue_url: '/issues/11'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    await openDateEditor('start-date-display-11');
    const picker = screen.getByRole('dialog', { name: 'Choose Date' });

    fireEvent.click(within(picker).getByTestId('date-today-footer-start_date-11'));
    await flushDateSaveDebounce();

    await waitFor(() => expect(updateTaskDatesMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('start-date-display-11').textContent).toBe(today.replace(/-/g, '/'));
  });

  it('supports Clear action in the inline date picker', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-04-19',
        due_date: '2026-04-30',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-04-19',
        due_date: null,
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);
    updateTaskDatesMock.mockResolvedValue({
      issue_id: 11,
      parent_id: 10,
      subject: 'Leaf issue',
      start_date: null,
      due_date: null,
      issue_url: '/issues/11'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    await openDateEditor('start-date-display-11');
    const picker = screen.getByRole('dialog', { name: 'Choose Date' });
    const clearButton = within(picker).getByTestId('date-clear-footer-start_date-11') as HTMLButtonElement;
    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton);
    await flushDateSaveDebounce();

    await waitFor(() => expect(updateTaskDatesMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('start-date-display-11').textContent).toBe('-');
  });

  it('renders the inline date picker calendar inside the dedicated portal layer', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-04-19',
        due_date: '2026-04-30',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-04-19',
        due_date: '2026-04-30',
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

    await openDateEditor('start-date-display-11');

    const portal = document.getElementById('redmine-report-inline-date-picker-portal');
    expect(portal).toBeTruthy();
    expect(portal?.querySelector('.react-datepicker-popper')).toBeTruthy();

    fireEvent.mouseDown(within(screen.getByRole('dialog', { name: 'Choose Date' })).getByText('19'));

    expect(screen.getByRole('dialog', { name: 'Choose Date' })).toBeTruthy();
  });

  it('commits a date change when clicking a calendar day in the inline date picker', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-04-19',
        due_date: '2026-04-30',
        done_ratio: 65,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-04-19',
        due_date: '2026-04-30',
        done_ratio: 40,
        issue_url: '/issues/11'
      }
    ]);
    updateTaskDatesMock.mockResolvedValue({
      issue_id: 11,
      parent_id: 10,
      subject: 'Leaf issue',
      start_date: '2026-04-22',
      due_date: '2026-04-30',
      issue_url: '/issues/11'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    await openDateEditor('start-date-display-11');
    fireEvent.click(screen.getByRole('gridcell', { name: /2026年4月22日/ }));
    await flushDateSaveDebounce();

    await waitFor(() => expect(updateTaskDatesMock).toHaveBeenCalledTimes(1));
    expect(updateTaskDatesMock).toHaveBeenCalledWith('ecookbook', 11, {
      start_date: '2026-04-22',
      due_date: '2026-04-30'
    });
    expect(screen.getByTestId('start-date-display-11').textContent).toBe('2026/04/22');
  });

  it('cancels a pending date edit on Escape and outside click', async () => {
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

    const escapeInput = (await openDateEditor('start-date-display-11')) as HTMLInputElement;
    fireEvent.keyDown(escapeInput, { key: 'Escape', code: 'Escape' });

    await flushDateSaveDebounce();

    expect(updateTaskDatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-date-display-11').textContent).toBe('2026/02/03');

    await openDateEditor('due-date-display-11');
    fireEvent.click(document.body);

    await flushDateSaveDebounce();

    expect(updateTaskDatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('due-date-display-11').textContent).toBe('2026/02/08');
  });

  it('rejects invalid start and due date selections through observable behavior', async () => {
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

    await openDateEditor('start-date-display-11');
    fireEvent.click(screen.getByRole('gridcell', { name: /2026年2月9日/ }));
    await flushDateSaveDebounce();

    expect(updateTaskDatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-date-display-11').textContent).toBe('2026/02/03');

    await openDateEditor('due-date-display-11');
    fireEvent.click(screen.getByRole('gridcell', { name: /2026年2月2日/ }));
    await flushDateSaveDebounce();

    expect(updateTaskDatesMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('due-date-display-11').textContent).toBe('2026/02/08');
  });

  it('prevents the browser default action when double clicking a date display', async () => {
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

    const startDateDisplay = screen.getByTestId('start-date-display-11');
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });

    let dispatchResult = true;
    await act(async () => {
      dispatchResult = startDateDisplay.dispatchEvent(dblClickEvent);
    });

    expect(dispatchResult).toBe(false);
    expect(dblClickEvent.defaultPrevented).toBe(true);
    expect(await screen.findByTestId('start-date-input-11')).toBeTruthy();
  });


  it('keeps the clicked child row active while selecting its parent process bar', async () => {
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
        subject: 'Parent process issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 11,
        subject: 'Leaf issue',
        start_date: '2026-02-04',
        due_date: '2026-02-07',
        done_ratio: 20,
        issue_url: '/issues/12'
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
    const scrollIntoViewMock = HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollIntoViewMock.mockClear();

    fireEvent.click(screen.getByTestId('task-row-12'));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-row-12').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('false');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('applies parent process selection when the child subject text is clicked', async () => {
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
        subject: 'Parent process issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 11,
        subject: 'Leaf issue',
        start_date: '2026-02-04',
        due_date: '2026-02-07',
        done_ratio: 20,
        issue_url: '/issues/12'
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

    fireEvent.click(within(screen.getByTestId('task-row-12')).getByTestId('task-subject'));

    expect(screen.getByTestId('task-row-12').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('selects the clicked issue in both panes when it has no parent in the current dataset', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 11,
        parent_id: 999,
        subject: 'External parent issue',
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
        issueId={999}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('task-row-11'));

    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('applies parent process selection before opening child inline editor on double click', async () => {
    mockTaskMasters();
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
        tracker_id: 1,
        tracker_name: 'Bug'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Parent process issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11',
        tracker_id: 1,
        tracker_name: 'Bug'
      },
      {
        issue_id: 12,
        parent_id: 11,
        subject: 'Leaf issue',
        start_date: '2026-02-04',
        due_date: '2026-02-07',
        done_ratio: 20,
        issue_url: '/issues/12',
        tracker_id: 1,
        tracker_name: 'Bug'
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
    await waitFor(() => expect(fetchTaskMastersMock).toHaveBeenCalledWith('ecookbook'));

    fireEvent.doubleClick(screen.getByTestId('tracker-cell-12'));

    expect(await screen.findByTestId('tracker-select-12')).toBeTruthy();
    expect(screen.getByTestId('task-row-12').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
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
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('style')).toContain('cursor: move;');
    expect(screen.getByTestId('task-details-process-step-left-11').getAttribute('style')).toContain('cursor: ew-resize;');
    expect(screen.getByTestId('task-details-process-step-right-11').getAttribute('style')).toContain('cursor: ew-resize;');
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
    expect(title.textContent).toBe('Root issue #10');
    expect(title.textContent).not.toContain('Sprint 1 / eCookbook');
  });

  it('shows comment icons only for issues that have comments in the ticket list', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
        comments: [
          {
            id: 901,
            author_name: 'Alice',
            notes: 'Reviewed',
            created_on: '2026-02-05T10:00:00Z'
          }
        ]
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-02-03',
        due_date: '2026-02-08',
        done_ratio: 40,
        issue_url: '/issues/11',
        comments: []
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

    expect(screen.getByText(/Comments|コメント/)).toBeTruthy();
    expect(screen.getByText(/Tracker|トラッカー/)).toBeTruthy();

    const indicators = screen.getAllByTestId('task-comment-indicator');
    expect(indicators).toHaveLength(1);
    expect(indicators[0].getAttribute('aria-label')).toMatch(/1 comments|1件のコメント/);
  });

  it('does not open a detail pane when clicking a task row', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
        description: 'Root description',
        comments: [
          {
            id: 901,
            author_name: 'Alice',
            notes: 'Reviewed and updated.',
            created_on: '2026-02-05T10:00:00Z'
          }
        ]
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

    fireEvent.click(screen.getByTestId('task-title-cell-10'));

    expect(screen.getByTestId('task-row-10').getAttribute('data-selected')).toBe('true');
  });

  it('does not open a detail pane when clicking a task row with empty details', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
        description: '',
        comments: []
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

    fireEvent.click(screen.getByTestId('task-title-cell-10'));

    expect(screen.getByTestId('task-row-10').getAttribute('data-selected')).toBe('true');
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

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('task-details-process-flow-canvas')).toBeTruthy();

    const designBar = screen.getByTestId('task-details-process-step-hit-11');
    const buildBar = screen.getByTestId('task-details-process-step-hit-12');
    const initialWidth = Number(designBar.getAttribute('width'));
    const designX = Number(designBar.getAttribute('x'));
    const buildX = Number(buildBar.getAttribute('x'));
    expect(designX).toBeGreaterThan(0);
    expect(buildX).toBeGreaterThan(designX);

    const startDateDisplay = screen.getByTestId('start-date-display-11');
    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });

    let dispatchResult = true;
    await act(async () => {
      dispatchResult = startDateDisplay.dispatchEvent(dblClickEvent);
    });

    expect(dispatchResult).toBe(false);
    expect(dblClickEvent.defaultPrevented).toBe(true);
    const startDateInput = (await screen.findByTestId('start-date-input-11')) as HTMLInputElement;
    expect(startDateInput).toBeTruthy();

    const picker = screen.getByRole('dialog', { name: 'Choose Date' });
    const day = picker.querySelector('[data-inline-date-picker-day][data-date="2026-02-01"]');
    expect(day).toBeTruthy();
    fireEvent.click(day as Element);

    await waitFor(() => {
      expect(Number(screen.getByTestId('task-details-process-step-hit-11').getAttribute('width'))).toBeGreaterThan(initialWidth);
    });

    await flushDateSaveDebounce();

    await waitFor(() => {
      expect(updateTaskDatesMock).toHaveBeenCalledWith('ecookbook', 11, {
        start_date: '2026-02-01',
        due_date: '2026-02-08'
      });
    });
  });

  it('adds extra vertical spacing between staggered process arrows', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'First',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 0,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 10,
        subject: 'Second',
        start_date: '2026-03-04',
        due_date: '2026-03-10',
        done_ratio: 0,
        issue_url: '/issues/12'
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

    const firstBarY = Number(screen.getByTestId('task-details-process-step-hit-11').getAttribute('y'));
    const secondBarY = Number(screen.getByTestId('task-details-process-step-hit-12').getAttribute('y'));

    expect(secondBarY - firstBarY).toBe(70);
  });

  it('keeps staggered process hit areas vertically aligned with the canvas when chartScale is applied', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'First',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 0,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 10,
        subject: 'Second',
        start_date: '2026-03-04',
        due_date: '2026-03-10',
        done_ratio: 0,
        issue_url: '/issues/12'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        chartScale={1.5}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    const firstBarY = Number(screen.getByTestId('task-details-process-step-hit-11').getAttribute('y'));
    const secondBarY = Number(screen.getByTestId('task-details-process-step-hit-12').getAttribute('y'));

    expect(secondBarY - firstBarY).toBe(105);
  });

  it('keeps process hit areas for start-only and due-only steps without resize handles', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Start only',
        start_date: '2026-03-03',
        due_date: null,
        done_ratio: 0,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 10,
        subject: 'Due only',
        start_date: null,
        due_date: '2026-03-10',
        done_ratio: 0,
        issue_url: '/issues/12'
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

    const startOnlyHit = screen.getByTestId('task-details-process-step-hit-11');
    const dueOnlyHit = screen.getByTestId('task-details-process-step-hit-12');
    expect(startOnlyHit).toBeTruthy();
    expect(dueOnlyHit).toBeTruthy();
    expect(screen.queryByTestId('task-details-process-step-left-11')).toBeNull();
    expect(screen.queryByTestId('task-details-process-step-right-11')).toBeNull();
    expect(screen.queryByTestId('task-details-process-step-left-12')).toBeNull();
    expect(screen.queryByTestId('task-details-process-step-right-12')).toBeNull();
  });

  it('aligns process hit areas below the header rows', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: null,
        done_ratio: 0,
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

    const hitArea = screen.getByTestId('task-details-process-step-hit-11');
    expect(hitArea.getAttribute('y')).toBe('96');
  });

  it('keeps process row spacing aligned when chartScale is not 1', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'First lane issue',
        start_date: '2026-03-03',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/11'
      },
      {
        issue_id: 12,
        parent_id: 10,
        subject: 'Second lane issue',
        start_date: '2026-03-04',
        due_date: '2026-03-21',
        done_ratio: 0,
        issue_url: '/issues/12'
      }
    ]);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        chartScale={1.5}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    const firstRow = screen.getByTestId('task-details-process-step-hit-11');
    const secondRow = screen.getByTestId('task-details-process-step-hit-12');
    const rowGap = Number(secondRow.getAttribute('y')) - Number(firstRow.getAttribute('y'));

    expect(rowGap).toBe(105);
  });

  it('selects a parent process bar on click and scrolls the matching row into view', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 0,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ]);

    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('task-details-process-step-hit-11'));

    expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('task-details-title').textContent).toBe('Root issue #10');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
  });

  it('keeps process bar selection working after a pointer down/up click without dragging', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Child issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    const processBar = screen.getByTestId('task-details-process-step-hit-11');

    fireEvent.pointerDown(processBar, { pointerId: 1, clientX: 120 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120 });
    fireEvent.click(processBar);

    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
  });

  it('drills down into a child subtree when the parent process bar is double-clicked', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 0,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
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

    fireEvent.doubleClick(screen.getByTestId('task-details-process-step-hit-11'));

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(2));
    expect(fetchTaskDetailsMock).toHaveBeenNthCalledWith(2, 'ecookbook', 11);
    expect(screen.getByTestId('task-details-title').textContent).toBe('Child issue #11');
    expect(screen.getByTestId('task-details-breadcrumb').textContent).toContain('Root issue #10');
    expect(screen.getByTestId('task-details-process-step-hit-12')).toBeTruthy();
    expect(screen.queryByTestId('task-details-process-step-hit-11')).toBeNull();
    expect(screen.queryByRole('link', { name: /新しいタブで開く|Open in Redmine|Open in New Tab/ })).toBeNull();
  });

  it('returns to an ancestor subtree from the breadcrumb', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 0,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 0,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
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
    fireEvent.doubleClick(screen.getByTestId('task-details-process-step-hit-11'));
    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Root issue #10' }));

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(3));
    expect(fetchTaskDetailsMock).toHaveBeenNthCalledWith(3, 'ecookbook', 10);
    expect(screen.getByTestId('task-details-title').textContent).toBe('Root issue #10');
    expect(screen.getByTestId('task-details-process-step-hit-11')).toBeTruthy();
    expect(screen.queryByTestId('task-details-process-step-hit-12')).toBeNull();
  });

  it('selects the issue details when clicking a leaf process bar', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    fireEvent.click(screen.getByTestId('task-details-process-step-hit-11'));

    expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('does not open a detail pane when clicking the title cell after drilldown', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 0,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
        }
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'Child issue',
          start_date: '2026-03-03',
          due_date: '2026-03-08',
          done_ratio: 25,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 11,
          subject: 'Grandchild issue',
          start_date: '2026-03-09',
          due_date: '2026-03-11',
          done_ratio: 10,
          issue_url: '/issues/12'
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

    fireEvent.doubleClick(screen.getByTestId('task-details-process-step-hit-11'));
    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: /新しいタブで開く|Open in Redmine|Open in New Tab/ })).toBeNull();

    fireEvent.click(screen.getByTestId('task-title-cell-11'));

    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.queryByTestId('task-details-process-step-hit-11')).toBeNull();
    expect(screen.queryByRole('link', { name: /新しいタブで開く|Open in Redmine|Open in New Tab/ })).toBeNull();
  });

  it('does not select a process bar when clicking a task title cell', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    fireEvent.click(screen.getByTestId('task-title-cell-11'));

    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('keeps task title clicks from changing the process selection', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    fireEvent.click(screen.getByTestId('task-title-cell-11'));

    fireEvent.click(screen.getByTestId('task-title-cell-11'));

    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('does not open the right panel when clicking outside the title column', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    fireEvent.click(screen.getByTestId('task-row-11'));

    expect(screen.getByTestId('task-row-11').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('task-details-process-step-hit-11').getAttribute('data-selected')).toBe('true');
  });

  it('resizes the top and bottom areas from the horizontal divider control', async () => {
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

    const topPane = screen.getByTestId('task-details-top-pane');
    const resizer = screen.getByTestId('task-details-horizontal-resizer');

    await waitFor(() => expect(topPane.style.height).toBe('182px'));

    resizer.focus();
    fireEvent.keyDown(resizer, { key: 'ArrowDown' });

    await waitFor(() => expect(topPane.style.height).toBe('206px'));

    fireEvent.keyDown(resizer, { key: 'PageUp' });

    await waitFor(() => expect(topPane.style.height).toBe('182px'));
  });

  it('auto fits the top pane again when the process flow height changes after reload', async () => {
    fetchTaskDetailsMock
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-02-01',
          due_date: '2026-02-20',
          done_ratio: 65,
          issue_url: '/issues/10'
        },
        {
          issue_id: 11,
          parent_id: 10,
          subject: 'First',
          start_date: '2026-02-03',
          due_date: '2026-02-08',
          done_ratio: 10,
          issue_url: '/issues/11'
        },
        {
          issue_id: 12,
          parent_id: 10,
          subject: 'Second',
          start_date: '2026-02-04',
          due_date: '2026-02-10',
          done_ratio: 20,
          issue_url: '/issues/12'
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

    const topPane = screen.getByTestId('task-details-top-pane');
    const reloadButton = screen.getByTitle('チケット一覧を再読込');
    const resizer = screen.getByTestId('task-details-horizontal-resizer');

    await waitFor(() => expect(topPane.style.height).toBe('182px'));

    resizer.focus();
    fireEvent.keyDown(resizer, { key: 'ArrowDown' });
    await waitFor(() => expect(topPane.style.height).toBe('206px'));

    fireEvent.click(reloadButton);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(2));
    await waitFor(
      () => expect(screen.getByTestId('task-details-top-pane').style.height).toBe('232px'),
      { timeout: 2000 }
    );
  });

  it('suppresses process bar click after a resize interaction', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: '2026-03-03',
        due_date: '2026-03-08',
        done_ratio: 25,
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

    const bar = screen.getByTestId('task-details-process-step-hit-11');
    const rightHandle = screen.getByTestId('task-details-process-step-right-11');
    fireEvent.pointerDown(rightHandle, { pointerId: 1, clientX: 120 });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120 });

    fireEvent.click(bar);

    expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1);
    expect(bar.getAttribute('data-selected')).toBe('false');
  });

  it('commits the live progress input value on blur even when React state is stale', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 0,
        issue_url: '/issues/10'
      }
    ]);
    updateTaskFieldsMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-03-01',
      due_date: '2026-03-20',
      done_ratio: 10,
      issue_url: '/issues/10'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.doubleClick(screen.getByTestId('progress-text'));

    const progressInput = screen.getByRole('spinbutton') as HTMLInputElement;
    progressInput.value = '10';
    fireEvent.blur(progressInput);

    await waitFor(() => {
      expect(updateTaskFieldsMock).toHaveBeenCalledWith('ecookbook', 10, { done_ratio: 10 });
    });
  });

  it('keeps the previous progress when the progress input is blurred empty', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 25,
        issue_url: '/issues/10'
      }
    ]);
    updateTaskFieldsMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-03-01',
      due_date: '2026-03-20',
      done_ratio: 25,
      issue_url: '/issues/10'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.doubleClick(screen.getByTestId('progress-text'));

    const progressInput = screen.getByRole('spinbutton') as HTMLInputElement;
    progressInput.value = '';
    fireEvent.blur(progressInput);

    await waitFor(() => {
      expect(updateTaskFieldsMock).toHaveBeenCalledWith('ecookbook', 10, { done_ratio: 25 });
    });
  });

  it.each([
    {
      label: 'tracker',
      cellTestId: 'tracker-cell-10',
      selectTestId: 'tracker-select-10',
      displayTestId: 'tracker-display-10',
      field: 'tracker_id',
      nextValue: '2',
      nextLabel: 'Feature',
      updatedFields: { tracker_id: 2, tracker_name: 'Feature' }
    },
    {
      label: 'priority',
      cellTestId: 'priority-cell-10',
      selectTestId: 'priority-select-10',
      displayTestId: 'priority-display-10',
      field: 'priority_id',
      nextValue: '4',
      nextLabel: 'High',
      updatedFields: { priority_id: 4, priority_name: 'High' }
    },
    {
      label: 'status',
      cellTestId: 'status-cell-10',
      selectTestId: 'status-select-10',
      displayTestId: 'status-display-10',
      field: 'status_id',
      nextValue: '2',
      nextLabel: 'In Progress',
      updatedFields: { status_id: 2, status_name: 'In Progress', status_is_closed: false }
    }
  ])('edits the $label column from a table cell click', async ({
    cellTestId,
    selectTestId,
    displayTestId,
    field,
    nextValue,
    nextLabel,
    updatedFields
  }) => {
    mockTaskMasters();
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 25,
        issue_url: '/issues/10',
        tracker_id: 1,
        tracker_name: 'Bug',
        priority_id: 3,
        priority_name: 'Normal',
        status_id: 1,
        status_name: 'New',
        status_is_closed: false,
        assignee_id: 8,
        assignee_name: 'Alice'
      }
    ]);
    updateTaskFieldsMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-03-01',
      due_date: '2026-03-20',
      done_ratio: 25,
      issue_url: '/issues/10',
      tracker_id: 1,
      tracker_name: 'Bug',
      priority_id: 3,
      priority_name: 'Normal',
      status_id: 1,
      status_name: 'New',
      status_is_closed: false,
      assignee_id: 8,
      assignee_name: 'Alice',
      ...updatedFields
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchTaskMastersMock).toHaveBeenCalledWith('ecookbook'));

    fireEvent.doubleClick(screen.getByTestId(cellTestId));
    const select = await screen.findByTestId(selectTestId);

    fireEvent.change(select, { target: { value: nextValue } });

    await waitFor(() => {
      expect(updateTaskFieldsMock).toHaveBeenCalledWith('ecookbook', 10, { [field]: Number(nextValue) });
    });
    await waitFor(() => {
      expect(screen.getByTestId(displayTestId).textContent).toBe(nextLabel);
    });
  });

  it('edits the assignee column from a table cell click and sends null for empty selection', async () => {
    mockTaskMasters();
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-03-01',
        due_date: '2026-03-20',
        done_ratio: 25,
        issue_url: '/issues/10',
        tracker_id: 1,
        tracker_name: 'Bug',
        priority_id: 3,
        priority_name: 'Normal',
        status_id: 1,
        status_name: 'New',
        status_is_closed: false,
        assignee_id: 8,
        assignee_name: 'Alice'
      }
    ]);
    updateTaskFieldsMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-03-01',
      due_date: '2026-03-20',
      done_ratio: 25,
      issue_url: '/issues/10',
      tracker_id: 1,
      tracker_name: 'Bug',
      priority_id: 3,
      priority_name: 'Normal',
      status_id: 1,
      status_name: 'New',
      status_is_closed: false,
      assignee_id: null,
      assignee_name: ''
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchTaskMastersMock).toHaveBeenCalledWith('ecookbook'));

    fireEvent.doubleClick(screen.getByTestId('assignee-cell-10'));
    const select = await screen.findByTestId('assignee-select-10');

    fireEvent.change(select, { target: { value: '' } });

    await waitFor(() => {
      expect(updateTaskFieldsMock).toHaveBeenCalledWith('ecookbook', 10, { assigned_to_id: null });
    });
    await waitFor(() => {
      expect(screen.getByTestId('assignee-display-10').textContent).toBe('-');
    });
  });

  it('uses issue-specific edit options and skips duplicate inline updates', async () => {
    fetchTaskDetailsMock.mockResolvedValue({
      issues: [
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 25,
          issue_url: '/issues/10',
          tracker_id: 1,
          tracker_name: 'Bug',
          priority_id: 3,
          priority_name: 'Normal',
          status_id: 1,
          status_name: 'New',
          status_is_closed: false,
          assignee_id: 8,
          assignee_name: 'Alice'
        }
      ],
      issue_edit_options: {
        10: {
          editable: true,
          fields: {
            tracker_id: true,
            priority_id: true,
            status_id: true,
            assigned_to_id: true
          },
          trackers: [
            { id: 1, name: 'Bug' },
            { id: 7, name: 'Support' }
          ],
          priorities: [{ id: 3, name: 'Normal' }],
          statuses: [{ id: 1, name: 'New', is_closed: false }],
          members: [{ id: 8, name: 'Alice' }]
        }
      }
    });
    updateTaskFieldsMock.mockResolvedValue({
      issue_id: 10,
      parent_id: null,
      subject: 'Root issue',
      start_date: '2026-03-01',
      due_date: '2026-03-20',
      done_ratio: 25,
      issue_url: '/issues/10',
      tracker_id: 7,
      tracker_name: 'Support'
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.doubleClick(screen.getByTestId('tracker-cell-10'));
    const select = await screen.findByTestId('tracker-select-10');
    expect(within(select).queryByText('Feature')).toBeNull();

    fireEvent.change(select, { target: { value: '1' } });
    expect(updateTaskFieldsMock).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByTestId('tracker-cell-10'));
    fireEvent.change(await screen.findByTestId('tracker-select-10'), { target: { value: '7' } });

    await waitFor(() => {
      expect(updateTaskFieldsMock).toHaveBeenCalledWith('ecookbook', 10, { tracker_id: 7 });
    });
  });

  it('does not open inline selects for read-only issue options', async () => {
    fetchTaskDetailsMock.mockResolvedValue({
      issues: [
        {
          issue_id: 10,
          parent_id: null,
          subject: 'Root issue',
          start_date: '2026-03-01',
          due_date: '2026-03-20',
          done_ratio: 25,
          issue_url: '/issues/10',
          tracker_id: 1,
          tracker_name: 'Bug'
        }
      ],
      issue_edit_options: {
        10: {
          editable: false,
          fields: {
            tracker_id: false,
            priority_id: false,
            status_id: false,
            assigned_to_id: false
          },
          trackers: [{ id: 1, name: 'Bug' }],
          priorities: [],
          statuses: [],
          members: []
        }
      }
    });

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.doubleClick(screen.getByTestId('tracker-cell-10'));

    expect(screen.queryByTestId('tracker-select-10')).toBeNull();
    expect(updateTaskFieldsMock).not.toHaveBeenCalled();
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
        issue_url: '/issues/10',
        tracker_id: 3,
        priority_id: 4,
        assignee_id: 8
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
    expect(srcUrl.searchParams.get('issue[tracker_id]')).toBe('3');
    expect(srcUrl.searchParams.get('issue[priority_id]')).toBe('4');
    expect(srcUrl.searchParams.get('issue[assigned_to_id]')).toBe('8');
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

  it('omits empty inherited fields from the create issue dialog URL', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
        tracker_id: 3,
        priority_id: 4,
        assignee_id: 8
      },
      {
        issue_id: 11,
        parent_id: 10,
        subject: 'Leaf issue',
        start_date: null,
        due_date: null,
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

    const addButton = screen.getAllByTitle('子チケットを追加')[1];
    fireEvent.click(addButton);

    const iframe = screen.getByTitle('子チケット新規登録') as HTMLIFrameElement;
    const srcUrl = new URL(iframe.getAttribute('src') as string, 'http://localhost');

    expect(srcUrl.searchParams.get('issue[tracker_id]')).toBeNull();
    expect(srcUrl.searchParams.get('issue[priority_id]')).toBeNull();
    expect(srcUrl.searchParams.get('issue[assigned_to_id]')).toBeNull();
    expect(srcUrl.searchParams.get('issue[start_date]')).toBeNull();
    expect(srcUrl.searchParams.get('issue[due_date]')).toBeNull();
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

  it('closes the title-opened view dialog after saving', async () => {
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

    const submitClick = vi.fn();
    const onTaskDatesUpdated = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <TaskDetailsDialog
          open
          projectIdentifier="ecookbook"
          issueId={10}
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={() => setOpen(false)}
        />
      ) : null;
    }

    render(<Harness />);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('チケットを表示'));

    const iframe = screen.getByTitle(/Issue Details|チケット詳細/) as HTMLIFrameElement;
    const { doc, form } = buildEmbeddedIssueDocument({
      action: '/issues/10'
    });
    const submitter = doc.createElement('button');
    submitter.setAttribute('name', 'commit');
    submitter.type = 'submit';
    submitter.textContent = 'Save';
    Object.defineProperty(submitter, 'click', {
      configurable: true,
      value: submitClick
    });
    form.appendChild(submitter);
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    const saveButton = screen.getByRole('button', { name: /保存|Save/ }) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    fireEvent.click(saveButton);

    expect(submitClick).toHaveBeenCalledTimes(1);

    const successDoc = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => ({ textContent: '' })),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      location: { pathname: '/issues/10' }
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: successDoc
    });

    fireEvent.load(iframe);

    await waitFor(() => {
      expect(screen.queryByTitle(/Issue Details|チケット詳細/)).toBeNull();
    });
    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
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

    const onClose = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      redirected: false,
      url: 'http://localhost/issues/10',
      headers: { get: () => null },
      text: async () =>
        '<!doctype html><html><body><div id="errorExplanation"><ul><li>Validation failed</li></ul></div><form id="edit_issue"></form></body></html>'
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TaskDetailsDialog
        open
        projectIdentifier="ecookbook"
        issueId={10}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByTitle(/Edit in Redmine|チケットを編集/)[0]);

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const { doc, form } = buildEmbeddedIssueDocument({
      formId: 'edit_issue',
      action: '/issues/10',
      trackerId: '8',
      priorityId: '2',
      assignedToId: '15',
      startDate: '2026-02-07',
      dueDate: '2026-02-18',
      subject: 'Edited parent issue'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeTruthy());
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/issues/10')).toBe(true));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('edit-issue-dialog-error').textContent).toContain('Validation failed');
    });
    expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeTruthy();
  });

  it('closes the edit issue dialog immediately after a successful save', async () => {
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

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      url: 'http://localhost/issues/10',
      headers: { get: () => null },
      text: async () => '<!doctype html><html><body><div id="content"><div class="issue">Updated issue</div></div></body></html>'
    });
    createIssueMock.mockResolvedValue({ success: true });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const [open, setOpen] = useState(true);
      const handleClose = () => {
        setOpen(false);
      };
      return open ? (
        <TaskDetailsDialog
          open
          projectIdentifier="ecookbook"
          issueId={10}
          onClose={handleClose}
        />
      ) : null;
    }

    render(<Harness />);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle(/Edit in Redmine|チケットを編集/));

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const { doc } = buildEmbeddedIssueDocument({
      formId: 'edit_issue',
      action: '/issues/10',
      trackerId: '8',
      priorityId: '2',
      assignedToId: '15',
      startDate: '2026-02-07',
      dueDate: '2026-02-18',
      subject: 'Edited parent issue'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    fireEvent.click(screen.getByText('チケット一括登録'));
    fireEvent.change(screen.getByPlaceholderText('作成するチケットの件名を1行に1つずつ入力してください...'), {
      target: { value: 'Child C' }
    });

    const saveButton = screen.getByRole('button', { name: '保存' });
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, options]) => url === '/issues/10' && (options as RequestInit | undefined)?.credentials === 'same-origin')
      ).toBe(true)
    );
    await waitFor(() => expect(createIssueMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeNull();
    });
  });

  it('closes the edit issue dialog when the embedded form submits successfully', async () => {
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

    const onTaskDatesUpdated = vi.fn();
    const onClose = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      url: 'http://localhost/issues/10',
      headers: { get: () => null },
      text: async () => '<!doctype html><html><body><div id="content"><div class="issue">Updated issue</div></div></body></html>'
    });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const [open, setOpen] = useState(true);
      const handleClose = () => {
        onClose();
        setOpen(false);
      };
      return open ? (
        <TaskDetailsDialog
          open
          projectIdentifier="ecookbook"
          issueId={10}
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={handleClose}
        />
      ) : null;
    }

    render(<Harness />);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle(/Edit in Redmine|チケットを編集/));

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const { doc, form } = buildEmbeddedIssueDocument({
      formId: 'edit_issue',
      action: '/issues/10',
      trackerId: '8',
      priorityId: '2',
      assignedToId: '15',
      startDate: '2026-02-07',
      dueDate: '2026-02-18',
      subject: 'Edited parent issue'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeTruthy());
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, options]) => url === '/issues/10' && (options as RequestInit | undefined)?.credentials === 'same-origin')
      ).toBe(true)
    );
    await waitFor(() => {
      expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeNull();
    });

    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Close dialog|ダイアログを閉じる/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
  });

  it('refreshes the report when the edit iframe dialog closes after navigating to the issue page', async () => {
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

    const onTaskDatesUpdated = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <TaskDetailsDialog
          open
          projectIdentifier="ecookbook"
          issueId={10}
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={() => setOpen(false)}
        />
      ) : null;
    }

    render(<Harness />);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle(/Edit in Redmine|チケットを編集/));

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const { doc } = buildEmbeddedIssueDocument({
      formId: 'edit_issue',
      action: '/issues/10'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);
    expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeTruthy();

    const successDoc = {
      head: { appendChild: vi.fn() },
      createElement: vi.fn(() => ({ textContent: '' })),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      location: { pathname: '/issues/10' }
    } as unknown as Document;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: successDoc
    });

    fireEvent.load(iframe);

    await waitFor(() => {
      expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeNull();
    });
    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
  });

  it('uses compact canvas-gantt dialog chrome for sub-issue dialog', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
      },
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

    const header = screen.getByTestId('sub-issue-dialog-header');
    const footer = screen.getByTestId('sub-issue-dialog-footer');
    const openButton = screen.getByRole('link', { name: '新しいタブで開く' });
    const closeButton = screen.getByRole('button', { name: /新規チケット作成ダイアログを閉じる/ });
    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    const saveButton = screen.getByRole('button', { name: '保存' });

    expect(header).toBeTruthy();
    expect(footer.className).toContain('justify-start');
    expect(openButton.getAttribute('style')).toContain('width: 32px');
    expect(openButton.getAttribute('style')).toContain('height: 32px');
    expect(openButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(closeButton.getAttribute('style')).toContain('width: 32px');
    expect(closeButton.getAttribute('style')).toContain('height: 32px');
    expect(closeButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(cancelButton.getAttribute('style')).toContain('height: 28px');
    expect(cancelButton.getAttribute('style')).toContain('min-width: 88px');
    expect(saveButton.getAttribute('style')).toContain('height: 28px');
    expect(saveButton.getAttribute('style')).toContain('min-width: 88px');
  });

  it('uses compact canvas-gantt dialog chrome for edit issue dialog', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        done_ratio: 65,
        issue_url: '/issues/10',
      },
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
    fireEvent.click(screen.getByTitle(/Edit in Redmine|チケットを編集/));

    const header = screen.getByTestId('edit-issue-dialog-header');
    const footer = screen.getByTestId('edit-issue-dialog-footer');
    const openButton = screen.getByRole('link', { name: '新しいタブで開く' });
    const closeButton = screen.getByRole('button', { name: /編集ダイアログを閉じる/ });
    const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
    const saveButton = screen.getByRole('button', { name: '保存' });

    expect(header).toBeTruthy();
    expect(footer.className).toContain('justify-start');
    expect(openButton.getAttribute('style')).toContain('width: 32px');
    expect(openButton.getAttribute('style')).toContain('height: 32px');
    expect(openButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(closeButton.getAttribute('style')).toContain('width: 32px');
    expect(closeButton.getAttribute('style')).toContain('height: 32px');
    expect(closeButton.getAttribute('style')).toContain('border-radius: 6px');
    expect(cancelButton.getAttribute('style')).toContain('height: 28px');
    expect(cancelButton.getAttribute('style')).toContain('min-width: 88px');
    expect(saveButton.getAttribute('style')).toContain('height: 28px');
    expect(saveButton.getAttribute('style')).toContain('min-width: 88px');
  });

  it('reloads task details after a sub-issue is created', async () => {
    const onTaskDatesUpdated = vi.fn();

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
        onTaskDatesUpdated={onTaskDatesUpdated}
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
    expect(onTaskDatesUpdated).toHaveBeenCalledTimes(1);
  });

  it('inherits current embedded form fields for bulk child creation from the create dialog', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        issue_url: '/issues/10'
      }
    ]);
    createIssueMock.mockResolvedValue({ success: true });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: 'http://localhost/issues/21',
      headers: { get: () => null }
    });
    vi.stubGlobal('fetch', fetchMock);

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
    const { doc } = buildEmbeddedIssueDocument({
      trackerId: '7',
      priorityId: '5',
      assignedToId: '9',
      startDate: '2026-02-05',
      dueDate: '2026-02-12',
      subject: 'New parent issue'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    fireEvent.click(screen.getByText('チケット一括登録'));
    fireEvent.change(screen.getByPlaceholderText('作成するチケットの件名を1行に1つずつ入力してください...'), {
      target: { value: 'Child A\nChild B' }
    });
    await waitFor(() => expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(createIssueMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.some(([url]) => url === '/issues')).toBe(true);
    expect(createIssueMock).toHaveBeenNthCalledWith(1, 'ecookbook', 21, {
      subject: 'Child A',
      tracker_id: 7,
      priority_id: 5,
      assigned_to_id: 9,
      start_date: '2026-02-05',
      due_date: '2026-02-12'
    });
    expect(createIssueMock).toHaveBeenNthCalledWith(2, 'ecookbook', 21, {
      subject: 'Child B',
      tracker_id: 7,
      priority_id: 5,
      assigned_to_id: 9,
      start_date: '2026-02-05',
      due_date: '2026-02-12'
    });
  });

  it('inherits current embedded form fields for bulk child creation from the edit dialog', async () => {
    fetchTaskDetailsMock.mockResolvedValue([
      {
        issue_id: 10,
        parent_id: null,
        subject: 'Root issue',
        start_date: '2026-02-01',
        due_date: '2026-02-10',
        issue_url: '/issues/10'
      }
    ]);
    createIssueMock.mockResolvedValue({ success: true });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      url: 'http://localhost/issues/10',
      headers: { get: () => null },
      text: async () => '<!doctype html><html><body><div id="content"><div class="issue">Updated issue</div></div></body></html>'
    });
    vi.stubGlobal('fetch', fetchMock);

    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <TaskDetailsDialog
          open
          projectIdentifier="ecookbook"
          issueId={10}
          onClose={() => setOpen(false)}
        />
      ) : null;
    }

    render(<Harness />);

    await waitFor(() => expect(fetchTaskDetailsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle(/Edit in Redmine|チケットを編集/));

    const iframe = screen.getByTitle(/Edit Issue|チケット編集/) as HTMLIFrameElement;
    const { doc } = buildEmbeddedIssueDocument({
      formId: 'edit_issue',
      action: '/issues/10',
      trackerId: '8',
      priorityId: '2',
      assignedToId: '15',
      startDate: '2026-02-07',
      dueDate: '2026-02-18',
      subject: 'Edited parent issue'
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: doc
    });

    fireEvent.load(iframe);

    fireEvent.click(screen.getByText('チケット一括登録'));
    fireEvent.change(screen.getByPlaceholderText('作成するチケットの件名を1行に1つずつ入力してください...'), {
      target: { value: 'Child C' }
    });
    await waitFor(() => expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(createIssueMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some(([url]) => url === '/issues/10')).toBe(true);
    expect(createIssueMock).toHaveBeenCalledWith('ecookbook', 10, {
      subject: 'Child C',
      tracker_id: 8,
      priority_id: 2,
      assigned_to_id: 15,
      start_date: '2026-02-07',
      due_date: '2026-02-18'
    });
    await waitFor(() => {
      expect(screen.queryByTitle(/Edit Issue|チケット編集/)).toBeNull();
    });
  });
});
