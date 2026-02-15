import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VersionAiDialog } from '../projectStatusReport/VersionAiDialog';

const generateWeeklyReportMock = vi.fn();
const prepareWeeklyPromptMock = vi.fn();
const validateWeeklyDestinationMock = vi.fn();
const saveWeeklyReportMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    prepareWeeklyPrompt: (...args: unknown[]) => prepareWeeklyPromptMock(...args),
    generateWeeklyReport: (...args: unknown[]) => generateWeeklyReportMock(...args),
    validateWeeklyDestination: (...args: unknown[]) => validateWeeklyDestinationMock(...args),
    saveWeeklyReport: (...args: unknown[]) => saveWeeklyReportMock(...args)
  };
});

describe('VersionAiDialog', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    prepareWeeklyPromptMock.mockReset();
    validateWeeklyDestinationMock.mockReset();
    saveWeeklyReportMock.mockReset();
    window.localStorage.clear();
  });

  it('opens dialog and triggers generate from start button', async () => {
    prepareWeeklyPromptMock.mockResolvedValue({
      header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
      kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
      prompt: 'prompt text',
      tickets: []
    });
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

    fireEvent.click(screen.getByRole('button', { name: 'プロンプト作成' }));
    await waitFor(() => expect(prepareWeeklyPromptMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'LLMへ送信' }));

    await waitFor(() => {
      expect(generateWeeklyReportMock).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText('生成プレビュー本文') as HTMLTextAreaElement).value).toBe('generated markdown');
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

    fireEvent.change(screen.getByPlaceholderText('Issue ID'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '宛先を確認' }));

    await waitFor(() => {
      expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(window.localStorage.getItem('redmine_ai_weekly.destinationIssueId.1.2')).toBe('123');
  });

  it('saves edited markdown from preview textarea', async () => {
    validateWeeklyDestinationMock.mockResolvedValue({ valid: true, reason_code: 'OK', reason_message: 'ok' });
    prepareWeeklyPromptMock.mockResolvedValue({
      header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
      kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
      prompt: 'prompt text',
      tickets: []
    });
    generateWeeklyReportMock.mockResolvedValue({
      header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
      kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
      markdown: 'generated markdown',
      tickets: []
    });
    saveWeeklyReportMock.mockResolvedValue({
      saved: true,
      revision: 3,
      mode: 'NOTE_ONLY',
      part: null,
      saved_at: '2026-02-15T10:00:00+09:00'
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

    fireEvent.change(screen.getByPlaceholderText('Issue ID'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '宛先を確認' }));
    await waitFor(() => expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'プロンプト作成' }));
    await waitFor(() => expect(prepareWeeklyPromptMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'LLMへ送信' }));
    await waitFor(() => expect(generateWeeklyReportMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual edited markdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'レポートを保存' }));

    await waitFor(() => {
      expect(saveWeeklyReportMock).toHaveBeenCalledTimes(1);
      expect(saveWeeklyReportMock.mock.calls[0][1]).toMatchObject({
        markdown: 'manual edited markdown'
      });
    });
  });

  it('saves manual markdown without LLM submission', async () => {
    validateWeeklyDestinationMock.mockResolvedValue({ valid: true, reason_code: 'OK', reason_message: 'ok' });
    saveWeeklyReportMock.mockResolvedValue({
      saved: true,
      revision: 1,
      mode: 'NOTE_ONLY',
      part: null,
      saved_at: '2026-02-15T10:00:00+09:00'
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

    fireEvent.change(screen.getByPlaceholderText('Issue ID'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '宛先を確認' }));
    await waitFor(() => expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual only markdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'レポートを保存' }));

    await waitFor(() => {
      expect(saveWeeklyReportMock).toHaveBeenCalledTimes(1);
      expect(saveWeeklyReportMock.mock.calls[0][1]).toEqual(expect.objectContaining({
        markdown: 'manual only markdown',
        week: expect.stringMatching(/^\d{4}-W\d{2}$/)
      }));
    });
  });
});
