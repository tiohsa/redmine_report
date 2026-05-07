import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionAiDialog } from '../projectStatusReport/VersionAiDialog';

const generateWeeklyReportMock = vi.fn();
const prepareWeeklyPromptMock = vi.fn();
const saveWeeklyReportMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
    return {
      ...actual,
      prepareWeeklyPrompt: (...args: unknown[]) => prepareWeeklyPromptMock(...args),
      generateWeeklyReport: (...args: unknown[]) => generateWeeklyReportMock(...args),
      saveWeeklyReport: (...args: unknown[]) => saveWeeklyReportMock(...args)
    };
});

describe('Weekly report save button guards', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    prepareWeeklyPromptMock.mockReset();
    saveWeeklyReportMock.mockReset();
    window.localStorage.clear();
  });

  it('enables save after destination is bound and manual markdown is entered', async () => {
    render(
      <VersionAiDialog
        open
        projectIdentifier="ecookbook"
        projectId={1}
        versionId={2}
        versionName="v1.0"
        destinationIssueId={321}
        destinationIssueStatus="VALID"
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-07"
        onClose={() => undefined}
      />
    );

    const saveButton = screen.getByRole('button', { name: '関連チケットにコメントを追加' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual markdown' } });

    expect(saveButton.disabled).toBe(false);
  });
});
