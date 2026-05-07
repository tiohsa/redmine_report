import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { VersionAiDialog } from '../projectStatusReport/VersionAiDialog';

const generateWeeklyReportMock = vi.fn();
const prepareWeeklyPromptMock = vi.fn();
const addReportDetailAiCommentMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    prepareWeeklyPrompt: (...args: unknown[]) => prepareWeeklyPromptMock(...args),
    generateWeeklyReport: (...args: unknown[]) => generateWeeklyReportMock(...args)
  };
});

vi.mock('../../services/reportDetailApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/reportDetailApi')>('../../services/reportDetailApi');
  return {
    ...actual,
    addReportDetailAiComment: (...args: unknown[]) => addReportDetailAiCommentMock(...args)
  };
});

describe('VersionAiDialog', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    prepareWeeklyPromptMock.mockReset();
    addReportDetailAiCommentMock.mockReset();
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
        destinationIssueId={123}
        destinationIssueStatus="VALID"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
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

  it('shows the related issue summary and disables save when unbound', async () => {
    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        destinationIssueId={null}
        destinationIssueStatus="UNBOUND"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('AIレポートを生成する前に、詳細レポートエリアから関連チケットを設定してください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '関連チケットにコメントを追加' })).toBeDisabled();
  });

  it('adds an AI comment to the bound detail report issue', async () => {
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
    addReportDetailAiCommentMock.mockResolvedValue({
      saved: true,
      revision: 3,
      saved_at: '2026-02-15T10:00:00+09:00',
      destination_issue_id: 123
    });

    const onSaved = vi.fn();

    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        destinationIssueId={123}
        destinationIssueStatus="VALID"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
        onClose={() => undefined}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'プロンプト作成' }));
    await waitFor(() => expect(prepareWeeklyPromptMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'LLMへ送信' }));
    await waitFor(() => expect(generateWeeklyReportMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual edited markdown' } });
    fireEvent.click(screen.getByRole('button', { name: '関連チケットにコメントを追加' }));

    await waitFor(() => {
      expect(addReportDetailAiCommentMock).toHaveBeenCalledTimes(1);
      expect(addReportDetailAiCommentMock.mock.calls[0][1]).toMatchObject({
        destination_issue_id: 123,
        project_id: 1,
        version_id: 2,
        markdown: 'manual edited markdown',
        week: '2026-W07'
      });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves manual markdown without LLM submission', async () => {
    addReportDetailAiCommentMock.mockResolvedValue({
      saved: true,
      revision: 1,
      saved_at: '2026-02-15T10:00:00+09:00',
      destination_issue_id: 123
    });

    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        destinationIssueId={123}
        destinationIssueStatus="VALID"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
        onClose={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual only markdown' } });
    fireEvent.click(screen.getByRole('button', { name: '関連チケットにコメントを追加' }));

    await waitFor(() => {
      expect(addReportDetailAiCommentMock).toHaveBeenCalledTimes(1);
      expect(addReportDetailAiCommentMock.mock.calls[0][1]).toEqual(expect.objectContaining({
        markdown: 'manual only markdown',
        week: expect.stringMatching(/^\d{4}-W\d{2}$/)
      }));
    });
  });

  it('uses the report display period and keeps it in sync while editing dates', () => {
    const onDisplayDateRangeChange = vi.fn();

    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        destinationIssueId={123}
        destinationIssueStatus="VALID"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
        onDisplayDateRangeChange={onDisplayDateRangeChange}
        onClose={() => undefined}
      />
    );

    expect((screen.getByDisplayValue('2026-03-01') as HTMLInputElement).value).toBe('2026-03-01');
    expect((screen.getByDisplayValue('2026-03-07') as HTMLInputElement).value).toBe('2026-03-07');

    fireEvent.change(screen.getByDisplayValue('2026-03-01'), { target: { value: '2026-03-02' } });

    expect(onDisplayDateRangeChange).toHaveBeenLastCalledWith('2026-03-02', '2026-03-07');
  });
});
