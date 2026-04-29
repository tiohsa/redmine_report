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

export type TaskEditableField = 'tracker_id' | 'priority_id' | 'status_id' | 'assigned_to_id';

export type TaskIssueEditOptions = {
  editable: boolean;
  fields: Record<TaskEditableField, boolean>;
  trackers: TaskMasterItem[];
  statuses: TaskStatusItem[];
  priorities: TaskMasterItem[];
  members: TaskMasterItem[];
  reasons?: Partial<Record<TaskEditableField, string>>;
};

export type TaskDetailsResponse = {
  issues: TaskDetailIssue[];
  issue_edit_options?: Record<number, TaskIssueEditOptions>;
};

export type TaskUpdatePayload = {
  subject?: string;
  tracker_id?: number | null;
  status_id?: number | null;
  priority_id?: number | null;
  assigned_to_id?: number | null;
  done_ratio?: number | null;
};
