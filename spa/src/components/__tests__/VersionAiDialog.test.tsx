import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
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

describe('VersionAiDialog', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    validateWeeklyDestinationMock.mockReset();
    saveWeeklyReportMock.mockReset();
    window.localStorage.clear();
  });

  it('opens dialog and triggers generate from start button', async () => {
    generateWeeklyReportMock.mockResolvedValue({
      header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
      kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
      markdown: 'generated markdown',
      tickets: []
    });

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

    fireEvent.click(screen.getByRole('button', { name: '開始' }));

    await waitFor(() => {
      expect(generateWeeklyReportMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('generated markdown')).toBeTruthy();
    });
  });

  it('validates and saves destination mapping', async () => {
    validateWeeklyDestinationMock.mockResolvedValue({ valid: true, reason_code: 'OK', reason_message: 'ok' });

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

    fireEvent.change(screen.getByPlaceholderText('Destination Issue ID'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '検証' }));

    await waitFor(() => {
      expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '保存（設定を保存）' }));
    expect(window.localStorage.getItem('redmine_ai_weekly.destinationIssueId.1.2')).toBe('123');
  });
});
