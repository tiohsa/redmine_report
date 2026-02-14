import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionAiDialog } from '../projectStatusReport/VersionAiDialog';

const generateWeeklyReportMock = vi.fn();
const validateWeeklyDestinationMock = vi.fn();
const saveWeeklyReportMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    generateWeeklyReport: (...args: unknown[]) => generateWeeklyReportMock(...args),
    validateWeeklyDestination: (...args: unknown[]) => validateWeeklyDestinationMock(...args),
    saveWeeklyReport: (...args: unknown[]) => saveWeeklyReportMock(...args)
  };
});

describe('Weekly report save button guards', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    validateWeeklyDestinationMock.mockReset();
    saveWeeklyReportMock.mockReset();
    window.localStorage.clear();
  });

  it('keeps save button disabled until generation and validation succeed', async () => {
    generateWeeklyReportMock.mockResolvedValue({
      header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
      kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
      markdown: 'generated markdown',
      tickets: []
    });
    validateWeeklyDestinationMock.mockResolvedValue({ valid: true, reason_code: 'OK' });

    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        onClose={() => undefined}
      />
    );

    const saveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Destination Issue ID'), { target: { value: '321' } });
    fireEvent.click(screen.getByRole('button', { name: '検証' }));
    await waitFor(() => expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1));

    expect(saveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    await waitFor(() => expect(generateWeeklyReportMock).toHaveBeenCalledTimes(1));

    expect(saveButton.disabled).toBe(false);
  });
});
