import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIssue } from '../bulkIssueApi';

describe('bulkIssueApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes tracker_id in the form body when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal('fetch', fetchMock);

    await createIssue('ecookbook', 10, {
      subject: 'Child issue',
      tracker_id: 3,
      priority_id: 4,
      assigned_to_id: 9,
      start_date: '2026-02-01',
      due_date: '2026-02-10'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = String((request as RequestInit).body);

    expect(body).toContain('issue%5Btracker_id%5D=3');
    expect(body).toContain('issue%5Bpriority_id%5D=4');
    expect(body).toContain('issue%5Bassigned_to_id%5D=9');
  });
});
