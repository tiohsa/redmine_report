import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTaskDetails,
  fetchWeeklyAiResponses,
  generateWeeklyReport,
  saveWeeklyReport,
  updateTaskDates,
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

  it('maps ai response tabs payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project_tabs: [
          {
            project_identifier: 'ecookbook',
            project_name: 'eCookbook',
            active: true,
            versions: [{ version_id: 2, version_name: 'v1.0', active: true, has_saved_response: true }]
          }
        ],
        selected_target: { project_identifier: 'ecookbook', version_id: 2 },
        response: { status: 'AVAILABLE', destination_issue_id: 3 }
      })
    }));

    const res = await fetchWeeklyAiResponses('ecookbook', { selected_project_identifier: 'ecookbook', selected_version_id: 2 });

    expect(res.project_tabs[0].project_identifier).toBe('ecookbook');
    expect(res.response.status).toBe('AVAILABLE');
  });

  it('maps task details payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issues: [
          { issue_id: 10, subject: 'Parent', start_date: '2026-02-01', due_date: '2026-02-10', issue_url: '/issues/10' }
        ]
      })
    }));

    const rows = await fetchTaskDetails('ecookbook', 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].issue_id).toBe(10);
  });

  it('maps task date update payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        issue: { issue_id: 10, subject: 'Parent', start_date: '2026-02-02', due_date: '2026-02-11', issue_url: '/issues/10' }
      })
    }));

    const issue = await updateTaskDates('ecookbook', 10, { start_date: '2026-02-02', due_date: '2026-02-11' });
    expect(issue.start_date).toBe('2026-02-02');
    expect(issue.due_date).toBe('2026-02-11');
  });
});
