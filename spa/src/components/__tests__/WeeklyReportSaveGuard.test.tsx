import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Weekly report save button guards', () => {
  beforeEach(() => {
    generateWeeklyReportMock.mockReset();
    prepareWeeklyPromptMock.mockReset();
    validateWeeklyDestinationMock.mockReset();
    saveWeeklyReportMock.mockReset();
    window.localStorage.clear();
  });

  it('enables save after destination validation and manual markdown input without LLM generation', async () => {
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

    const saveButton = screen.getByRole('button', { name: 'レポートを保存' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Issue ID'), { target: { value: '321' } });
    fireEvent.click(screen.getByRole('button', { name: '宛先を確認' }));
    await waitFor(() => expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1));

    expect(saveButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('生成プレビュー本文'), { target: { value: 'manual markdown' } });

    expect(saveButton.disabled).toBe(false);
  });
});
