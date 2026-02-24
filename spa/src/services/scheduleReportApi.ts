export type ReportFilterSet = {
  include_subprojects: boolean;
  months: number;
  start_month: string;
  status_scope: 'open' | 'all';
  filter_rule?: 'open_version_top_parent';
};
import type {
  AiResponseTabsPayload,
  DestinationValidationResult,
  WeeklyGenerateResponse,
  WeeklyPrepareResponse,
  WeeklySaveResponse,
  WeeklyVersionItem
} from '../types/weeklyReport';
import { t } from '../i18n';

export type ProjectRow = {
  project_id: number;
  identifier: string;
  name: string;
  parent_project_id: number | null;
  level: number;
  expanded: boolean;
};

export type CategoryBar = {
  bar_key: string;
  project_id: number;
  category_id: number;
  category_name: string;
  version_id?: number;
  version_name?: string;
  ticket_subject?: string;
  start_date: string;
  end_date: string;
  issue_count: number;
  delayed_issue_count: number;
  progress_rate: number;
  is_delayed: boolean;
  dependencies: string[];
};

export type ReportSnapshot = {
  rows: ProjectRow[];
  bars: CategoryBar[];
  available_projects: ProjectInfo[];
  selection_summary: {
    total_candidates: number;
    excluded_not_visible: number;
    excluded_invalid_hierarchy: number;
    displayed_top_parent_count: number;
  };
  meta: {
    generated_at: string;
    stale_after_seconds: number;
    limits: { max_rows: number; max_bars: number };
    warnings: string[];
    applied_filters: ReportFilterSet;
  };
};

export type ProjectInfo = {
  project_id: number;
  identifier: string;
  name: string;
  level: number;
  parent_project_id?: number | null;
  selectable?: boolean;
};

export type TaskDetailIssue = {
  issue_id: number;
  parent_id: number | null;
  subject: string;
  start_date: string | null;
  due_date: string | null;
  done_ratio?: number | null;
  issue_url: string;
  tracker_name?: string;
  tracker_id?: number;
  status_name?: string;
  status_id?: number;
  status_is_closed?: boolean;
  assignee_name?: string;
  assignee_id?: number | null;
  priority_name?: string;
  priority_id?: number;
  description?: string;
  comments?: Array<{
    id?: number;
    author_name?: string;
    notes: string;
    created_on?: string | null;
  }>;
};

const toQuery = (filters: Partial<ReportFilterSet>) => {
  const query = new URLSearchParams();
  if (filters.include_subprojects !== undefined) {
    query.set('include_subprojects', filters.include_subprojects ? '1' : '0');
  }
  if (filters.months !== undefined) query.set('months', String(filters.months));
  if (filters.start_month) query.set('start_month', filters.start_month);
  if (filters.status_scope) query.set('status_scope', filters.status_scope);
  return query.toString();
};




export const fetchScheduleReport = async (
  rootProjectIdentifier: string,
  selectedProjectIdentifier: string,
  filters: Partial<ReportFilterSet> = {}
): Promise<ReportSnapshot> => {
  const qs = toQuery(filters);
  const query = new URLSearchParams(qs);
  if (selectedProjectIdentifier) {
    query.set('selected_project_identifier', selectedProjectIdentifier);
  }
  const path = `/projects/${rootProjectIdentifier}/schedule_report/data${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || t('api.fetchScheduleReport', { status: res.status }));
  }
  return (await res.json()) as ReportSnapshot;
};

export const fetchTaskDetails = async (
  projectIdentifier: string,
  issueId: number
): Promise<TaskDetailIssue[]> => {
  const path = `/projects/${projectIdentifier}/schedule_report/task_details/${issueId}`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.fetchTaskDetails', { status: res.status }));
  }
  const json = (await res.json()) as { issues: TaskDetailIssue[] };
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
  const path = `/projects/${projectIdentifier}/schedule_report/task_dates/${issueId}`;
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.updateTaskDates', { status: res.status }));
  }
  const json = (await res.json()) as { issue: TaskDetailIssue };
  return json.issue;
};

export type TaskMasterItem = { id: number | null; name: string };
export type TaskStatusItem = { id: number; name: string; is_closed: boolean };

export type TaskMasters = {
  trackers: TaskMasterItem[];
  statuses: TaskStatusItem[];
  priorities: TaskMasterItem[];
  members: TaskMasterItem[];
};

export const fetchTaskMasters = async (projectIdentifier: string): Promise<TaskMasters> => {
  const path = `/projects/${projectIdentifier}/schedule_report/task_masters`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.fetchTaskMasters', { status: res.status, defaultValue: `Failed to load masters (${res.status})` }));
  }
  return (await res.json()) as TaskMasters;
};

export type TaskUpdatePayload = {
  subject?: string;
  tracker_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  assigned_to_id?: number | null;
  done_ratio?: number | null;
};

export const updateTaskFields = async (
  projectIdentifier: string,
  issueId: number,
  payload: TaskUpdatePayload
): Promise<TaskDetailIssue> => {
  const path = `/projects/${projectIdentifier}/schedule_report/task_update/${issueId}`;
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.updateTaskFields', { status: res.status, defaultValue: `Failed to update issue (${res.status})` }));
  }
  const json = (await res.json()) as { issue: TaskDetailIssue };
  return json.issue;
};

export const updateTaskJournal = async (
  projectIdentifier: string,
  journalId: number,
  notes: string
): Promise<void> => {
  const path = `/projects/${projectIdentifier}/schedule_report/task_journal/${journalId}`;
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify({ notes })
  });

  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.updateTaskJournal', { status: res.status, defaultValue: `Failed to update journal (${res.status})` }));
  }
};

export class WeeklyApiError extends Error {
  status: number;
  code?: string;
  retryable?: boolean;

  constructor(message: string, status: number, code?: string, retryable?: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const parseWeeklyError = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return new WeeklyApiError(
    String(body.message || body.error || fallback),
    res.status,
    typeof body.code === 'string' ? body.code : undefined,
    typeof body.retryable === 'boolean' ? body.retryable : undefined
  );
};

export const fetchWeeklyVersions = async (
  projectIdentifier: string
): Promise<WeeklyVersionItem[]> => {
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/versions`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.fetchWeeklyVersions', { status: res.status }));
  }
  const json = (await res.json()) as { versions: WeeklyVersionItem[] };
  return json.versions || [];
};

export const validateWeeklyDestination = async (
  projectIdentifier: string,
  payload: { project_id: number; version_id: number; destination_issue_id: number }
): Promise<DestinationValidationResult> => {
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/destination/validate`;
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.validateDestination', { status: res.status }));
  }
  return (await res.json()) as DestinationValidationResult;
};

export const generateWeeklyReport = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    top_topics_limit?: number;
    top_tickets_limit?: number;
    prompt?: string;
  }
): Promise<WeeklyGenerateResponse> => {
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/generate`;
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.generateWeeklyReport', { status: res.status }));
  }
  return (await res.json()) as WeeklyGenerateResponse;
};

export const prepareWeeklyPrompt = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    top_topics_limit?: number;
    top_tickets_limit?: number;
  }
): Promise<WeeklyPrepareResponse> => {
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/prepare`;
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.prepareWeeklyPrompt', { status: res.status }));
  }
  return (await res.json()) as WeeklyPrepareResponse;
};

export const saveWeeklyReport = async (
  projectIdentifier: string,
  payload: {
    project_id: number;
    version_id: number;
    week_from: string;
    week_to: string;
    week: string;
    destination_issue_id: number;
    markdown: string;
    generated_at: string;
  }
): Promise<WeeklySaveResponse> => {
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/save`;
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.saveWeeklyReport', { status: res.status }));
  }
  return (await res.json()) as WeeklySaveResponse;
};

export const fetchWeeklyAiResponses = async (
  projectIdentifier: string,
  params: {
    selected_project_identifier?: string;
    selected_version_id?: number;
  } = {}
): Promise<AiResponseTabsPayload> => {
  const query = new URLSearchParams();
  if (params.selected_project_identifier) {
    query.set('selected_project_identifier', params.selected_project_identifier);
  }
  if (params.selected_version_id) {
    query.set('selected_version_id', String(params.selected_version_id));
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const path = `/projects/${projectIdentifier}/schedule_report/weekly/ai_responses${suffix}`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw await parseWeeklyError(res, t('api.fetchWeeklyAiResponses', { status: res.status }));
  }
  return (await res.json()) as AiResponseTabsPayload;
};

export const fetchChildIssues = async (
  parentBars: CategoryBar[]
): Promise<Map<number, CategoryBar[]>> => {
  const childMap = new Map<number, CategoryBar[]>();

  // Mock implementation for demonstration
  // In a real scenario, this would fetch from an API endpoint
  // Simulating network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  parentBars.forEach((parent) => {
    // skip if no valid dates
    if (!parent.start_date || !parent.end_date) return;

    // Generate 2-3 children
    const numChildren = 2 + (parent.category_id % 2);
    const children: CategoryBar[] = [];
    const parentStart = new Date(parent.start_date);
    const parentEnd = new Date(parent.end_date);
    const totalDays = Math.max(1, (parentEnd.getTime() - parentStart.getTime()) / (1000 * 3600 * 24));
    const stepDays = Math.max(1, Math.floor(totalDays / numChildren));

    for (let i = 0; i < numChildren; i++) {
      const start = new Date(parentStart);
      start.setDate(parentStart.getDate() + i * stepDays);
      const end = new Date(start);
      end.setDate(start.getDate() + stepDays - 1);

      // Ensure strictly within parent range for last item
      if (i === numChildren - 1 || end > parentEnd) {
        end.setTime(parentEnd.getTime());
      }

      children.push({
        ...parent,
        category_id: parent.category_id * 1000 + i, // Mock ID
        category_name: `${parent.category_name} - Step ${i + 1}`,
        ticket_subject: `${parent.ticket_subject || parent.category_name} - Step ${i + 1}`,
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
        progress_rate: parent.progress_rate, // Inherit
        issue_count: 0,
        delayed_issue_count: 0,
        is_delayed: false
      });
    }
    childMap.set(parent.category_id, children);
  });

  return childMap;
};
