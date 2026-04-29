export type WeeklyVersionItem = {
  id: number;
  name: string;
  status: 'open' | 'locked' | 'closed' | string;
  ai_action_enabled: boolean;
};

export type DestinationValidationResult = {
  valid: boolean;
  reason_code: 'OK' | 'NOT_FOUND' | 'FORBIDDEN' | 'PROJECT_MISMATCH' | 'INVALID_INPUT' | string;
  reason_message?: string;
};

export type WeeklyCommentExcerpt = {
  journal_id: number;
  created_on: string;
  author: string;
  content: string;
  excerpt?: string | null;
};

export type WeeklyTicketChange = {
  ticket_id: number;
  layer: 'A_WEEKLY_CHANGE' | 'B_CONTINUOUS_RISK';
  status: string;
  priority: string;
  due_date?: string | null;
  progress: number;
  changes_this_week: {
    status_change?: string | null;
    progress_delta?: number | null;
    due_date_change?: string | null;
    priority_change?: string | null;
    assignee_change?: string | null;
  };
  comments_this_week: WeeklyCommentExcerpt[];
};

export type WeeklyGenerateResponse = {
  header_preview: {
    project_id: number;
    version_id: number;
    week: string;
    generated_at: string;
  };
  kpi: {
    completed: number;
    wip: number;
    overdue: number;
    high_priority_open: number;
  };
  markdown: string;
  llm_response?: {
    major_achievements?: string[];
    next_actions?: string[];
    risks?: string[];
    decisions?: string[];
  };
  tickets: WeeklyTicketChange[];
};

export type WeeklyPrepareResponse = {
  header_preview: {
    project_id: number;
    version_id: number;
    week: string;
    generated_at: string;
  };
  kpi: {
    completed: number;
    wip: number;
    overdue: number;
    high_priority_open: number;
  };
  prompt: string;
  tickets: WeeklyTicketChange[];
};

export type WeeklySaveResponse = {
  saved: boolean;
  revision: number;
  mode: 'NOTE_ONLY' | 'NOTE_WITH_ATTACHMENT' | 'NOTE_SPLIT';
  part?: string | null;
  saved_at: string;
};

export type AiResponseStatus = 'AVAILABLE' | 'PARTIAL' | 'NOT_SAVED' | 'FETCH_FAILED' | 'FORBIDDEN';

export type AiResponseVersionTab = {
  version_id: number;
  version_name: string;
  active: boolean;
  has_saved_response: boolean;
};

export type AiResponseProjectTab = {
  project_identifier: string;
  project_name: string;
  active: boolean;
  versions: AiResponseVersionTab[];
};

export type AiResponseView = {
  status: AiResponseStatus;
  destination_issue_id: number;
  saved_at?: string | null;
  highlights_this_week?: string | null;
  next_week_actions?: string | null;
  risks_decisions?: string | null;
  missing_sections?: Array<'highlights_this_week' | 'next_week_actions' | 'risks_decisions' | string>;
  failure_reason_code?: 'NOT_FOUND' | 'FORBIDDEN' | 'UPSTREAM_ERROR' | 'INVALID_REFERENCE' | string | null;
  message?: string | null;
};

export type AiResponseTabsPayload = {
  project_tabs: AiResponseProjectTab[];
  selected_target: {
    project_identifier?: string | null;
    version_id?: number | null;
  };
  response: AiResponseView;
};

export type WeeklyAiResponseUpdatePayload = {
  selected_project_identifier?: string;
  version_id: number;
  destination_issue_id: number;
  highlights_this_week: string;
  next_week_actions: string;
  risks_decisions: string;
};

export type WeeklyAiResponseUpdateResponse = {
  saved: boolean;
  saved_at?: string | null;
  response: AiResponseView;
};
