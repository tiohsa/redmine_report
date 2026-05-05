import { describe, expect, it, vi, afterEach } from 'vitest';
import { addReportDetailAiComment } from '../reportDetailApi';

describe('reportDetailApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts AI comment payload to the dedicated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        saved: true,
        revision: 2,
        saved_at: '2026-02-15T10:00:00+09:00',
        destination_issue_id: 123
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(document, 'querySelector').mockReturnValue({ content: 'csrf-token' } as HTMLMetaElement);

    await addReportDetailAiComment('ecookbook', {
      destination_issue_id: 123,
      project_id: 1,
      version_id: 2,
      week_from: '2026-02-09',
      week_to: '2026-02-15',
      week: '2026-W07',
      markdown: '# report',
      generated_at: '2026-02-15T10:00:00+09:00'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/projects/ecookbook/schedule_report/report_detail/ai_comment');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token'
      })
    }));
  });
});
