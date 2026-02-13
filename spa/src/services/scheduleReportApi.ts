export type ReportFilterSet = {
  include_subprojects: boolean;
  months: number;
  start_month: string;
  status_scope: 'open' | 'all';
};

export type ProjectRow = {
  project_id: number;
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
  start_date: string;
  end_date: string;
  issue_count: number;
  delayed_issue_count: number;
  progress_rate: number;
  is_delayed: boolean;
  dependencies: string[];
};

export type ReportSnapshot = {
  meta: {
    generated_at: string;
    stale_after_seconds: number;
    limits: { max_rows: number; max_bars: number };
    warnings: string[];
    applied_filters: ReportFilterSet;
  };
  rows: ProjectRow[];
  bars: CategoryBar[];
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
  projectIdentifier: string,
  filters: Partial<ReportFilterSet> = {}
): Promise<ReportSnapshot> => {
  const qs = toQuery(filters);
  const path = `/projects/${projectIdentifier}/schedule_report/data${qs ? `?${qs}` : ''}`;
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule report: ${res.status}`);
  }
  return (await res.json()) as ReportSnapshot;
};
