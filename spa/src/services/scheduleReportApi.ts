import type {
  AiResponseTabsPayload,
  DestinationValidationResult,
  WeeklyGenerateResponse,
  WeeklyPrepareResponse,
  WeeklySaveResponse,
  WeeklyVersionItem
} from '../types/weeklyReport';
import { t } from '../i18n';

export type ReportFilterSet = {
  include_subprojects: boolean;
  months: number;
  start_month: string;
  status_scope: 'open' | 'all';
  filter_rule?: 'open_version_top_parent';
};

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

export type TaskMasterItem = { id: number | null; name: string };
export type TaskStatusItem = { id: number; name: string; is_closed: boolean };

export type TaskMasters = {
  trackers: TaskMasterItem[];
  statuses: TaskStatusItem[];
  priorities: TaskMasterItem[];
  members: TaskMasterItem[];
};

export type TaskUpdatePayload = {
  subject?: string;
  tracker_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  assigned_to_id?: number | null;
  done_ratio?: number | null;
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

type ResponseErrorParser = (res: Response) => Promise<Error>;
type ErrorMessageFactory = (status: number) => string;

type ChildIssueBarsResponse = {
  items?: Array<{
    parent_issue_id: number;
    children: CategoryBar[];
  }>;
};

const SAME_ORIGIN_CREDENTIALS: RequestCredentials = 'same-origin';
const JSON_CONTENT_TYPE = 'application/json';

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

const appendQuery = (path: string, query: URLSearchParams | string) => {
  const suffix = typeof query === 'string' ? query : query.toString();
  return suffix ? `${path}?${suffix}` : path;
};

const csrfToken = () =>
  (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

const jsonHeaders = (headers?: HeadersInit): HeadersInit => ({
  'Content-Type': JSON_CONTENT_TYPE,
  'X-CSRF-Token': csrfToken(),
  ...(headers || {})
});

const request = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: SAME_ORIGIN_CREDENTIALS, ...init });

const parseFetchScheduleReportError = async (res: Response) => {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return new Error(String(body.error || t('api.fetchScheduleReport', { status: res.status })));
};

const parseWeeklyError = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  return new WeeklyApiError(
    String(body.message || body.error || fallback),
    res.status,
    typeof body.code === 'string' ? body.code : undefined,
    typeof body.retryable === 'boolean' ? body.retryable : undefined
  );
};

const weeklyError = (messageForStatus: ErrorMessageFactory): ResponseErrorParser => (res) =>
  parseWeeklyError(res, messageForStatus(res.status));

const requestJson = async <T>(
  path: string,
  parseError: ResponseErrorParser,
  init?: RequestInit
): Promise<T> => {
  const res = await request(path, init);
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
};

const requestJsonWithBody = <T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  parseError: ResponseErrorParser,
  init?: Omit<RequestInit, 'method' | 'headers' | 'body'>
) =>
  requestJson<T>(path, parseError, {
    ...init,
    method,
    headers: jsonHeaders(init?.headers),
    body: JSON.stringify(body)
  });

export const fetchScheduleReport = async (
  rootProjectIdentifier: string,
  selectedProjectIdentifier: string,
  filters: Partial<ReportFilterSet> = {}
): Promise<ReportSnapshot> => {
  const query = new URLSearchParams(toQuery(filters));
  if (selectedProjectIdentifier) {
    query.set('selected_project_identifier', selectedProjectIdentifier);
  }

  return requestJson<ReportSnapshot>(
    appendQuery(`/projects/${rootProjectIdentifier}/schedule_report/data`, query),
    parseFetchScheduleReportError
  );
};

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

export const fetchWeeklyVersions = async (
  projectIdentifier: string
): Promise<WeeklyVersionItem[]> => {
  const json = await requestJson<{ versions: WeeklyVersionItem[] }>(
    `/projects/${projectIdentifier}/schedule_report/weekly/versions`,
    weeklyError((status) => t('api.fetchWeeklyVersions', { status }))
  );
  return json.versions || [];
};

export const validateWeeklyDestination = async (
  projectIdentifier: string,
  payload: { project_id: number; version_id: number; destination_issue_id: number }
): Promise<DestinationValidationResult> =>
  requestJsonWithBody<DestinationValidationResult>(
    `/projects/${projectIdentifier}/schedule_report/weekly/destination/validate`,
    'POST',
    payload,
    weeklyError((status) => t('api.validateDestination', { status }))
  );

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
): Promise<WeeklyGenerateResponse> =>
  requestJsonWithBody<WeeklyGenerateResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/generate`,
    'POST',
    payload,
    weeklyError((status) => t('api.generateWeeklyReport', { status }))
  );

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
): Promise<WeeklyPrepareResponse> =>
  requestJsonWithBody<WeeklyPrepareResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/prepare`,
    'POST',
    payload,
    weeklyError((status) => t('api.prepareWeeklyPrompt', { status }))
  );

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
): Promise<WeeklySaveResponse> =>
  requestJsonWithBody<WeeklySaveResponse>(
    `/projects/${projectIdentifier}/schedule_report/weekly/save`,
    'POST',
    payload,
    weeklyError((status) => t('api.saveWeeklyReport', { status }))
  );

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

  return requestJson<AiResponseTabsPayload>(
    appendQuery(`/projects/${projectIdentifier}/schedule_report/weekly/ai_responses`, query),
    weeklyError((status) => t('api.fetchWeeklyAiResponses', { status }))
  );
};

export const fetchChildIssues = async (
  projectIdentifier: string,
  parentBars: CategoryBar[],
  signal?: AbortSignal
): Promise<Map<number, CategoryBar[]>> => {
  const parentIssueIds = Array.from(
    new Set(parentBars.map((bar) => bar.category_id).filter((id) => Number.isInteger(id)))
  );
  if (parentIssueIds.length === 0) return new Map();

  const json = await requestJsonWithBody<ChildIssueBarsResponse>(
    `/projects/${projectIdentifier}/schedule_report/child_issues`,
    'POST',
    { parent_issue_ids: parentIssueIds },
    weeklyError((status) => t('api.fetchChildIssues', {
      status,
      defaultValue: `Failed to load child issues (${status})`
    })),
    { signal }
  );

  const childMap = new Map<number, CategoryBar[]>();
  (json.items || []).forEach((item) => {
    if (!Number.isInteger(item.parent_issue_id) || !Array.isArray(item.children)) return;
    childMap.set(item.parent_issue_id, item.children);
  });
  return childMap;
};
