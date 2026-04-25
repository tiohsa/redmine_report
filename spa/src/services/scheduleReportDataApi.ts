import { t } from '../i18n';
import { appendQuery, parseFetchScheduleReportError, requestJson, requestJsonWithBody, weeklyError } from './apiClient';
import { type CategoryBar, type ReportFilterSet, type ReportSnapshot } from './scheduleReportTypes';

type ChildIssueBarsResponse = {
  items?: Array<{
    parent_issue_id: number;
    children: CategoryBar[];
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
  const query = new URLSearchParams(toQuery(filters));
  if (selectedProjectIdentifier) {
    query.set('selected_project_identifier', selectedProjectIdentifier);
  }

  return requestJson<ReportSnapshot>(
    appendQuery(`/projects/${rootProjectIdentifier}/schedule_report/data`, query),
    parseFetchScheduleReportError
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
