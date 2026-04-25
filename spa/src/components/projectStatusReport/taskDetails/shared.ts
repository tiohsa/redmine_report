import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import { type BulkIssuePayload } from '../../bulkIssueRegistration/bulkIssueApi';
import { readEmbeddedIssueHeader, EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS } from '../embeddedIssueDialog';

export type TreeNodeType = TaskDetailIssue & { children: TreeNodeType[] };

export type TableDensity = 'compact' | 'standard' | 'relaxed';

export type InheritedSubIssueFields = Pick<
  BulkIssuePayload,
  'tracker_id' | 'priority_id' | 'assigned_to_id' | 'start_date' | 'due_date'
>;

export const TABLE_DENSITY_STORAGE_KEY = 'redmine_report_task_details_density';
export const COLUMN_WIDTH_STORAGE_KEY = 'redmine_report_task_details_column_widths';

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  task: 300,
  comments: 80,
  tracker: 120,
  priority: 100,
  status: 120,
  progress: 120,
  startDate: 110,
  dueDate: 110,
  assignee: 150
};

export const DENSITY_CONFIG = {
  compact: {
    rowHeight: 'min-h-[38px]',
    headerHeight: 'h-9',
    subjectSize: 'text-[12px]',
    badgeSize: 'text-[10px]',
    iconSize: 'w-3.5 h-3.5',
    idSize: 'text-[10px]',
    cellPadding: 'px-6',
    progressTextSize: 'text-[10px]',
    progressGap: 'gap-2',
    dateSize: 'text-[10px]'
  },
  standard: {
    rowHeight: 'min-h-[52px]',
    headerHeight: 'h-11',
    subjectSize: 'text-[14px]',
    badgeSize: 'text-[11px]',
    iconSize: 'w-4 h-4',
    idSize: 'text-xs',
    cellPadding: 'px-6',
    progressTextSize: 'text-[12px]',
    progressGap: 'gap-3',
    dateSize: 'text-[11px]'
  },
  relaxed: {
    rowHeight: 'min-h-[64px]',
    headerHeight: 'h-14',
    subjectSize: 'text-[16px]',
    badgeSize: 'text-[12px]',
    iconSize: 'w-4.5 h-4.5',
    idSize: 'text-sm',
    cellPadding: 'px-6',
    progressTextSize: 'text-[13px]',
    progressGap: 'gap-4',
    dateSize: 'text-[12px]'
  }
} as const satisfies Record<TableDensity, {
  rowHeight: string;
  headerHeight: string;
  subjectSize: string;
  badgeSize: string;
  iconSize: string;
  idSize: string;
  cellPadding: string;
  progressTextSize: string;
  progressGap: string;
  dateSize: string;
}>;

export const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY = 'var(--font-sans)';
export { EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS };
export const EMBEDDED_ISSUE_EDIT_EXTRA_CSS = `
                  ${EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS}
                  #issue-form > .buttons,
                  #issue-form > p.buttons,
                  #edit_issue > .buttons,
                  #edit_issue > p.buttons,
                  #new_issue > .buttons,
                  #new_issue > p.buttons {
                    position: absolute !important;
                    opacity: 0 !important;
                    height: 0 !important;
                    width: 0 !important;
                    overflow: hidden !important;
                    pointer-events: none !important;
                  }
`;

export const EMBEDDED_ISSUE_VIEW_EXTRA_CSS = `
                  ${EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS}
                  body {
                    font-family: var(--font-sans) !important;
                    color: var(--color-text-00) !important;
                    padding: 20px 24px !important;
                    background: transparent !important;
                  }
                  .contextual, #content .contextual {
                    display: block !important;
                    margin-bottom: 16px !important;
                  }
                  .contextual a, #content .contextual a {
                    display: inline-block !important;
                    border-radius: 9999px !important;
                    padding: 4px 12px !important;
                    background: #f3f4f6 !important;
                    color: #4b5563 !important;
                    font-size: 12px !important;
                    border: 1px solid #e5e7eb !important;
                    transition: all 0.2s !important;
                  }
                  .contextual a:hover {
                    background: #e5e7eb !important;
                    text-decoration: none !important;
                  }
                  #issue-form > .buttons,
                  #issue-form > p.buttons,
                  #edit_issue > .buttons,
                  #edit_issue > p.buttons,
                  #new_issue > .buttons,
                  #new_issue > p.buttons {
                    position: absolute !important;
                    opacity: 0 !important;
                    height: 0 !important;
                    width: 0 !important;
                    overflow: hidden !important;
                    pointer-events: none !important;
                  }
`;

const readNumericField = (formData: FormData, fieldName: string): number | undefined => {
  const raw = formData.get(fieldName);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const readDateField = (formData: FormData, fieldName: string): string | undefined => {
  const raw = formData.get(fieldName);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
};

export const buildInheritedSubIssueFields = (source: {
  trackerId?: number | null;
  priorityId?: number | null;
  assignedToId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}): InheritedSubIssueFields => ({
  tracker_id: source.trackerId && source.trackerId > 0 ? source.trackerId : undefined,
  priority_id: source.priorityId && source.priorityId > 0 ? source.priorityId : undefined,
  assigned_to_id: source.assignedToId && source.assignedToId > 0 ? source.assignedToId : undefined,
  start_date: source.startDate || undefined,
  due_date: source.dueDate || undefined
});

export const extractInheritedSubIssueFieldsFromForm = (form: HTMLFormElement): InheritedSubIssueFields => {
  const formData = new FormData(form);
  return {
    tracker_id: readNumericField(formData, 'issue[tracker_id]'),
    priority_id: readNumericField(formData, 'issue[priority_id]'),
    assigned_to_id: readNumericField(formData, 'issue[assigned_to_id]'),
    start_date: readDateField(formData, 'issue[start_date]'),
    due_date: readDateField(formData, 'issue[due_date]')
  };
};

export const buildSubIssueQuery = (parentIssueId: number, inheritedFields: InheritedSubIssueFields): string => {
  const params = new URLSearchParams();
  params.set('issue[parent_issue_id]', String(parentIssueId));

  if (inheritedFields.tracker_id) params.set('issue[tracker_id]', String(inheritedFields.tracker_id));
  if (inheritedFields.priority_id) params.set('issue[priority_id]', String(inheritedFields.priority_id));
  if (inheritedFields.assigned_to_id) params.set('issue[assigned_to_id]', String(inheritedFields.assigned_to_id));
  if (inheritedFields.start_date) {
    params.set('issue[start_date]', inheritedFields.start_date);
    params.set('start_date', inheritedFields.start_date);
  }
  if (inheritedFields.due_date) {
    params.set('issue[due_date]', inheritedFields.due_date);
    params.set('due_date', inheritedFields.due_date);
  }

  return params.toString();
};

export const syncEmbeddedIssueHeaderState = (
  doc: Document,
  setHeader: (value: string) => void,
  setSubject: (value: string) => void
) => {
  const { header, subject } = readEmbeddedIssueHeader(doc);
  setHeader(header);
  setSubject(subject);

  const subjectInput = doc.querySelector<HTMLInputElement>('#issue_subject');
  if (subjectInput) {
    const handleInput = (event: Event) => {
      setSubject((event.target as HTMLInputElement).value);
    };
    subjectInput.addEventListener('input', handleInput);
  }
};
