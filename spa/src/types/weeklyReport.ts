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
  tickets: WeeklyTicketChange[];
};

export type WeeklySaveResponse = {
  saved: boolean;
  revision: number;
  mode: 'NOTE_ONLY' | 'NOTE_WITH_ATTACHMENT' | 'NOTE_SPLIT';
  part?: string | null;
  saved_at: string;
};
