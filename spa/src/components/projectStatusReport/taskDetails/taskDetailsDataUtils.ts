import {
  WeeklyApiError,
  type TaskDetailIssue,
  type TaskDetailsResponse,
  type TaskIssueEditOptions
} from '../../../services/scheduleReportApi';

export const normalizeTaskDetailsResponse = (
  response: TaskDetailIssue[] | TaskDetailsResponse
): {
  issues: TaskDetailIssue[];
  editOptionsByIssueId: Record<number, TaskIssueEditOptions>;
} => {
  if (Array.isArray(response)) {
    return { issues: response, editOptionsByIssueId: {} };
  }

  return {
    issues: response.issues,
    editOptionsByIssueId: response.issue_edit_options || {}
  };
};

export const indexTaskDetailsById = (issues: TaskDetailIssue[]) =>
  issues.reduce<Record<number, TaskDetailIssue>>((acc, issue) => {
    acc[issue.issue_id] = issue;
    return acc;
  }, {});

export const replaceTaskDetail = (
  issues: TaskDetailIssue[],
  nextIssue: TaskDetailIssue
) => issues.map((issue) => (issue.issue_id === nextIssue.issue_id ? { ...issue, ...nextIssue } : issue));

export const restoreTaskDetailFromBaseline = (
  issues: TaskDetailIssue[],
  baselineById: Record<number, TaskDetailIssue>,
  issueId: number
) => {
  const baseline = baselineById[issueId];
  if (!baseline) return issues;

  return issues.map((issue) => (issue.issue_id === issueId ? { ...issue, ...baseline } : issue));
};

export const mergeUpdatedTaskDetail = (
  updated: TaskDetailIssue,
  parentId: number | null
): TaskDetailIssue => ({
  ...updated,
  parent_id: parentId
});

export const getTaskUpdateErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof WeeklyApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallbackMessage;
};
