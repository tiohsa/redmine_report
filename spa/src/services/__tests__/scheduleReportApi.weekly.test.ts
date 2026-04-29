import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchScheduleReport,
  fetchChildIssues,
  fetchTaskDetails,
  fetchWeeklyAiResponses,
  generateWeeklyReport,
  saveWeeklyReport,
  updateWeeklyAiResponse,
  updateTaskFields,
  updateTaskDates,
  validateWeeklyDestination,
  WeeklyApiError
} from '../scheduleReportApi';

describe('scheduleReportApi weekly methods', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the fetchScheduleReport query string from filters and selected project', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [],
        bars: [],
        available_projects: [],
        selection_summary: {
          total_candidates: 0,
          excluded_not_visible: 0,
          excluded_invalid_hierarchy: 0,
          displayed_top_parent_count: 0
        },
        meta: {
          generated_at: '2026-02-15T10:00:00+09:00',
          stale_after_seconds: 300,
          limits: { max_rows: 500, max_bars: 2000 },
          warnings: [],
          applied_filters: {
            include_subprojects: false,
            months: 6,
            start_month: '2026-02',
            status_scope: 'all'
          }
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchScheduleReport('ecookbook', 'roadmap', {
      include_subprojects: false,
      months: 6,
      start_month: '2026-02',
      status_scope: 'all'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/projects/ecookbook/schedule_report/data?include_subprojects=0&months=6&start_month=2026-02&status_scope=all&selected_project_identifier=roadmap'
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({ credentials: 'same-origin' });
  });

  it.each([
    {
      name: 'updateTaskDates',
      run: () => updateTaskDates('ecookbook', 10, { start_date: '2026-02-02', due_date: '2026-02-11' }),
      response: {
        ok: true,
        json: async () => ({
          issue: { issue_id: 10, subject: 'Parent', start_date: '2026-02-02', due_date: '2026-02-11', issue_url: '/issues/10' }
        })
      }
    },
    {
      name: 'updateTaskFields',
      run: () => updateTaskFields('ecookbook', 10, {
        subject: 'Parent',
        tracker_id: 3,
        status_id: 4,
        priority_id: 5,
        assigned_to_id: 9,
        done_ratio: 50
      }),
      response: {
        ok: true,
        json: async () => ({
          issue: { issue_id: 10, subject: 'Parent', start_date: '2026-02-02', due_date: '2026-02-11', issue_url: '/issues/10' }
        })
      }
    }
  ])('sends the CSRF header for $name', async ({ run, response }) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(document, 'querySelector').mockReturnValue({ content: 'csrf-token' } as HTMLMetaElement);

    await run();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token'
      })
    }));
  });

  it('exposes message, code, and retryable from the error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'REVISION_CONFLICT',
        message: 'conflict',
        retryable: true
      })
    }));

    try {
      await saveWeeklyReport('ecookbook', {
        project_id: 1,
        version_id: 2,
        week_from: '2026-02-09',
        week_to: '2026-02-15',
        week: '2026-W07',
        destination_issue_id: 3,
        markdown: 'm',
        generated_at: '2026-02-15T10:00:00+09:00'
      });
      throw new Error('expected saveWeeklyReport to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(WeeklyApiError);
      const apiError = error as WeeklyApiError;
      expect(apiError.message).toBe('conflict');
      expect(apiError.status).toBe(409);
      expect(apiError.code).toBe('REVISION_CONFLICT');
      expect(apiError.retryable).toBe(true);
    }
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

  it('sends patch payload for weekly ai response updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        saved: true,
        saved_at: '2026-04-26T10:30:00+09:00',
        response: {
          status: 'AVAILABLE',
          destination_issue_id: 123,
          highlights_this_week: 'h',
          next_week_actions: 'n',
          risks_decisions: 'r'
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(document, 'querySelector').mockReturnValue({ content: 'csrf-token' } as HTMLMetaElement);

    const res = await updateWeeklyAiResponse('ecookbook', {
      selected_project_identifier: 'roadmap',
      version_id: 2,
      destination_issue_id: 123,
      highlights_this_week: 'h',
      next_week_actions: 'n',
      risks_decisions: 'r'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/projects/ecookbook/schedule_report/weekly/ai_response',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf-token'
        }),
        body: JSON.stringify({
          selected_project_identifier: 'roadmap',
          version_id: 2,
          destination_issue_id: 123,
          highlights_this_week: 'h',
          next_week_actions: 'n',
          risks_decisions: 'r'
        })
      })
    );
    expect(res.response.highlights_this_week).toBe('h');
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

    const response = await fetchTaskDetails('ecookbook', 10);
    expect(response.issues).toHaveLength(1);
    expect(response.issues[0].issue_id).toBe(10);
    expect(response.issue_edit_options).toEqual({});
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

  it('maps child issues response into parent keyed map', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            parent_issue_id: 10,
            children: [
              {
                bar_key: '1:issue:11',
                project_id: 1,
                category_id: 11,
                category_name: 'Child',
                version_id: 2,
                version_name: 'v1',
                ticket_subject: 'Child',
                start_date: '2026-02-02',
                end_date: '2026-02-03',
                issue_count: 1,
                delayed_issue_count: 0,
                progress_rate: 20,
                is_delayed: false,
                dependencies: []
              }
            ]
          }
        ]
      })
    }));

    const map = await fetchChildIssues('ecookbook', [{
      bar_key: '1:issue:10',
      project_id: 1,
      category_id: 10,
      category_name: 'Parent',
      version_id: 2,
      version_name: 'v1',
      ticket_subject: 'Parent',
      start_date: '2026-02-01',
      end_date: '2026-02-10',
      issue_count: 1,
      delayed_issue_count: 0,
      progress_rate: 0,
      is_delayed: false,
      dependencies: []
    }]);

    expect(map.get(10)).toHaveLength(1);
    expect(map.get(10)?.[0].category_id).toBe(11);
  });

  it('throws WeeklyApiError when child issues fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ code: 'UPSTREAM_FAILURE', message: 'unavailable' })
    }));

    await expect(
      fetchChildIssues('ecookbook', [{
        bar_key: '1:issue:10',
        project_id: 1,
        category_id: 10,
        category_name: 'Parent',
        ticket_subject: 'Parent',
        start_date: '2026-02-01',
        end_date: '2026-02-10',
        issue_count: 1,
        delayed_issue_count: 0,
        progress_rate: 0,
        is_delayed: false,
        dependencies: []
      }])
    ).rejects.toBeInstanceOf(WeeklyApiError);
  });
});
