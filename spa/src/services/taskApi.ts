import { t } from '../i18n';
import { requestJson, requestJsonWithBody, weeklyError } from './apiClient';
import { type TaskDetailIssue, type TaskMasters, type TaskUpdatePayload } from './scheduleReportTypes';

export const fetchTaskDetails = async (
  projectIdentifier: string,
  issueId: number
): Promise<TaskDetailIssue[]> => {
  const json = await requestJson<{ issues: TaskDetailIssue[] }>(
    `/projects/${projectIdentifier}/schedule_report/task_details/${issueId}`,
    weeklyError((status) => t('api.fetchTaskDetails', { status }))
  );
  return json.issues || [];
};

export const updateTaskDates = async (
  projectIdentifier: string,
  issueId: number,
  payload: {
    start_date?: string | null;
    due_date?: string | null;
  }
): Promise<TaskDetailIssue> => {
  const json = await requestJsonWithBody<{ issue: TaskDetailIssue }>(
    `/projects/${projectIdentifier}/schedule_report/task_dates/${issueId}`,
    'PATCH',
    payload,
    weeklyError((status) => t('api.updateTaskDates', { status }))
  );
  return json.issue;
};

export const fetchTaskMasters = async (projectIdentifier: string): Promise<TaskMasters> =>
  requestJson<TaskMasters>(
    `/projects/${projectIdentifier}/schedule_report/task_masters`,
    weeklyError((status) => t('api.fetchTaskMasters', { status, defaultValue: `Failed to load masters (${status})` }))
  );

export const updateTaskFields = async (
  projectIdentifier: string,
  issueId: number,
  payload: TaskUpdatePayload
): Promise<TaskDetailIssue> => {
  const json = await requestJsonWithBody<{ issue: TaskDetailIssue }>(
    `/projects/${projectIdentifier}/schedule_report/task_update/${issueId}`,
    'PATCH',
    payload,
    weeklyError((status) => t('api.updateTaskFields', { status, defaultValue: `Failed to update issue (${status})` }))
  );
  return json.issue;
};

export const updateTaskJournal = async (
  projectIdentifier: string,
  journalId: number,
  notes: string
): Promise<void> => {
  await requestJsonWithBody<unknown>(
    `/projects/${projectIdentifier}/schedule_report/task_journal/${journalId}`,
    'PATCH',
    { notes },
    weeklyError((status) => t('api.updateTaskJournal', { status, defaultValue: `Failed to update journal (${status})` }))
  );
};
