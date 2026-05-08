import { describe, expect, it } from 'vitest';
import { WeeklyApiError } from '../../../services/apiClient';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import {
  getTaskUpdateErrorMessage,
  indexTaskDetailsById,
  mergeUpdatedTaskDetail,
  normalizeTaskDetailsResponse,
  replaceTaskDetail,
  restoreTaskDetailFromBaseline
} from './taskDetailsDataUtils';

const buildIssue = (overrides: Partial<TaskDetailIssue>): TaskDetailIssue => ({
  issue_id: 1,
  parent_id: null,
  subject: 'Issue',
  start_date: '2026-05-01',
  due_date: '2026-05-02',
  issue_url: '/issues/1',
  ...overrides
});

describe('taskDetailsDataUtils', () => {
  it('normalizes both response shapes', () => {
    const arrayResponse = [buildIssue({ issue_id: 1 })];
    expect(normalizeTaskDetailsResponse(arrayResponse)).toEqual({
      issues: arrayResponse,
      editOptionsByIssueId: {}
    });

    const objectResponse = {
      issues: [buildIssue({ issue_id: 2 })],
      issue_edit_options: {
        2: {
          editable: true,
          fields: {
            tracker_id: true,
            priority_id: false,
            status_id: true,
            assigned_to_id: false
          },
          trackers: [],
          statuses: [],
          priorities: [],
          members: []
        }
      }
    };

    expect(normalizeTaskDetailsResponse(objectResponse)).toEqual({
      issues: objectResponse.issues,
      editOptionsByIssueId: objectResponse.issue_edit_options
    });
  });

  it('indexes and replaces issues by id', () => {
    const issueA = buildIssue({ issue_id: 1, subject: 'A' });
    const issueB = buildIssue({ issue_id: 2, subject: 'B' });

    expect(indexTaskDetailsById([issueA, issueB])).toEqual({
      1: issueA,
      2: issueB
    });

    expect(replaceTaskDetail([issueA, issueB], { ...issueB, subject: 'B updated' })).toEqual([
      issueA,
      { ...issueB, subject: 'B updated' }
    ]);
  });

  it('restores a row from the baseline when present', () => {
    const issueA = buildIssue({ issue_id: 1, subject: 'A current' });
    const issueB = buildIssue({ issue_id: 2, subject: 'B current' });
    const baseline = {
      1: buildIssue({ issue_id: 1, subject: 'A baseline' })
    };

    expect(restoreTaskDetailFromBaseline([issueA, issueB], baseline, 1)).toEqual([
      { ...issueA, subject: 'A baseline' },
      issueB
    ]);
    expect(restoreTaskDetailFromBaseline([issueA, issueB], baseline, 2)).toEqual([issueA, issueB]);
  });

  it('preserves the parent id when merging updated details', () => {
    const issue = buildIssue({ issue_id: 1, parent_id: 8 });

    expect(mergeUpdatedTaskDetail({ ...issue, subject: 'Updated' }, 42)).toEqual({
      ...issue,
      subject: 'Updated',
      parent_id: 42
    });
  });

  it('formats update errors consistently', () => {
    expect(getTaskUpdateErrorMessage(new WeeklyApiError('boom', 500), 'fallback')).toBe('boom');
    expect(getTaskUpdateErrorMessage(new Error('broken'), 'fallback')).toBe('broken');
    expect(getTaskUpdateErrorMessage({} as unknown, 'fallback')).toBe('fallback');
  });
});
