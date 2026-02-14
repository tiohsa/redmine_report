export type ReportFilterSet = {
  include_subprojects: boolean;
  months: number;
  start_month: string;
  status_scope: 'open' | 'all';
  filter_rule?: 'open_version_top_parent';
};
import type {
  DestinationValidationResult,
  WeeklyGenerateResponse,
  WeeklySaveResponse,
  WeeklyVersionItem
} from '../types/weeklyReport';

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

export type ReportContent = {
  progress: ReportItem[];
  next_steps: ReportItem[];
  risks: ReportItem[];
};

export type ReportItem = {
  text: string;
  type?: "normal" | "highlight";
  subText?: string;
  badge?: string;
  badgeColor?: string;
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
    throw new Error(errorBody.error || `Failed to fetch schedule report: ${res.status}`);
  }
  return (await res.json()) as ReportSnapshot;
};

export const generateScheduleReport = async (
  projectIdentifier: string,
  filters: Partial<ReportFilterSet> = {}
): Promise<ReportContent> => {
  const qs = toQuery(filters);
  // Using POST for generation
  const path = `/projects/${projectIdentifier}/schedule_report/generate${qs ? `?${qs}` : ''}`;
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      // Start CSRF token if needed by Rails
      'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || ''
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to generate report: ${res.status}`);
  }
  return (await res.json()) as ReportContent;
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
    throw await parseWeeklyError(res, `Failed to fetch weekly versions: ${res.status}`);
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
    throw await parseWeeklyError(res, `Failed to validate destination: ${res.status}`);
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
    throw await parseWeeklyError(res, `Failed to generate weekly report: ${res.status}`);
  }
  return (await res.json()) as WeeklyGenerateResponse;
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
    throw await parseWeeklyError(res, `Failed to save weekly report: ${res.status}`);
  }
  return (await res.json()) as WeeklySaveResponse;
};
