import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailReportTargetSaveDialog } from '../projectStatusReport/DetailReportTargetSaveDialog';
import { weeklyDestinationStorage } from '../../services/weeklyDestinationStorage';

const validateWeeklyDestinationMock = vi.fn();

vi.mock('../../services/scheduleReportApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/scheduleReportApi')>('../../services/scheduleReportApi');
  return {
    ...actual,
    validateWeeklyDestination: (...args: unknown[]) => validateWeeklyDestinationMock(...args)
  };
});

describe('DetailReportTargetSaveDialog', () => {
  beforeEach(() => {
    validateWeeklyDestinationMock.mockReset();
    window.localStorage.clear();
  });

  it('saves the validated destination issue for every visible target', async () => {
    validateWeeklyDestinationMock.mockResolvedValue({ valid: true, reason_code: 'OK' });
    const onSaved = vi.fn();

    render(
      <DetailReportTargetSaveDialog
        rootProjectIdentifier="ecookbook"
        targets={[
          {
            projectId: 1,
            projectIdentifier: 'ecookbook',
            projectName: 'eCookbook',
            versionId: 101,
            versionName: 'v1'
          },
          {
            projectId: 1,
            projectIdentifier: 'ecookbook',
            projectName: 'eCookbook',
            versionId: 102,
            versionName: 'v2'
          }
        ]}
        onSaved={onSaved}
        onClose={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Issue ID|チケットID/), { target: { value: '321' } });
    fireEvent.click(screen.getByRole('button', { name: /Validate Destination|宛先を確認/ }));

    await waitFor(() => expect(validateWeeklyDestinationMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Save Detail Targets|詳細レポート対象を保存/ }));

    expect(weeklyDestinationStorage.getDestinationIssueId(1, 101)).toBe(321);
    expect(weeklyDestinationStorage.getDestinationIssueId(1, 102)).toBe(321);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
