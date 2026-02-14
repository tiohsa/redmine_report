import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateWeeklyReport,
  saveWeeklyReport,
  validateWeeklyDestination,
  WeeklyApiError
} from '../scheduleReportApi';

describe('scheduleReportApi weekly methods', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps validate response payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, reason_code: 'OK' })
    }));

    const res = await validateWeeklyDestination('ecookbook', {
      project_id: 1,
      version_id: 2,
      destination_issue_id: 3
    });

    expect(res.valid).toBe(true);
    expect(res.reason_code).toBe('OK');
  });

  it('maps generate response payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        header_preview: { project_id: 1, version_id: 2, week: '2026-W07', generated_at: '2026-02-15T10:00:00+09:00' },
        kpi: { completed: 1, wip: 2, overdue: 0, high_priority_open: 1 },
        markdown: 'preview',
        tickets: []
      })
    }));

    const res = await generateWeeklyReport('ecookbook', {
      project_id: 1,
      version_id: 2,
      week_from: '2026-02-09',
      week_to: '2026-02-15'
    });

    expect(res.markdown).toBe('preview');
    expect(res.header_preview.week).toBe('2026-W07');
  });

  it('throws WeeklyApiError on save failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'REVISION_CONFLICT', message: 'conflict', retryable: true })
    }));

    await expect(
      saveWeeklyReport('ecookbook', {
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-09',
        week_to: '2026-02-15',
        week: '2026-W07',
        destination_issue_id: 3,
        markdown: 'm',
        generated_at: '2026-02-15T10:00:00+09:00'
      })
    ).rejects.toBeInstanceOf(WeeklyApiError);
  });
});
