import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  fetchTaskDetails,
  fetchTaskMasters,
  TaskDetailIssue,
  TaskMasters,
  updateTaskDates,
  updateTaskFields,
  WeeklyApiError
} from '../../services/scheduleReportApi';
import { createIssue, BulkIssuePayload } from '../bulkIssueRegistration/bulkIssueApi';
import {
  applyEmbeddedIssueDialogStyles,
  bindIframeEscapeHandler,
  COMPACT_ACTION_BUTTON_HEIGHT,
  COMPACT_ACTION_BUTTON_MIN_WIDTH,
  COMPACT_ICON_BUTTON_SIZE,
  DEFAULT_DIALOG_WIDTH_PX,
  getEmbeddedDialogDefaultHeight,
  getEmbeddedIssueDialogErrorMessage,
  ISSUE_DIALOG_STYLE_ID,
  MAX_DIALOG_VIEWPORT_HEIGHT_RATIO,
  useEmbeddedIssueDialogLayout,
} from './embeddedIssueDialog';
import { buildTimelineAxis, calculateStaggeredLanes, createDateToX, createRangeToWidth } from './timelineAxis';
import {
  drawChevron,
  drawDiamond, truncateCanvasText,
  drawTriangle,
  drawStrokeText,
  prepareHiDPICanvas
} from './canvasTimelineRenderer';
import { getProgressFillColor, getProgressTrackColor } from './constants';

type TaskDetailsDialogProps = {
  open: boolean;
  projectIdentifier: string;
  issueId: number;
  issueTitle?: string;
  projectName?: string;
  versionName?: string;
  chartScale?: number;

  onTaskDatesUpdated?: () => void;
  onClose: () => void;
};

type TreeNodeType = TaskDetailIssue & { children: TreeNodeType[] };

type TableDensity = 'compact' | 'standard' | 'relaxed';

type IssueTreeNodeProps = {
  node: TreeNodeType;
  depth: number;
  activeLines: boolean[];
  isLast: boolean;
  rootIssueId: number;
  savingIssueIds: Record<number, boolean>;
  handleDateChange: (row: TaskDetailIssue, key: 'start_date' | 'due_date', value: string) => void;
  onAddSubIssue: (parentIssue: TaskDetailIssue) => void;
  onEditIssue: (issue: TaskDetailIssue) => void;
  onViewIssue: (issue: TaskDetailIssue) => void;
  onSelectIssue?: (node: TreeNodeType) => void;
  selectedIssueId?: number | null;
  masters: TaskMasters | null;
  onFieldUpdate: (issueId: number, field: string, value: string | number | null) => Promise<void>;
  columnWidths: Record<string, number>;
  density: TableDensity;
};

type EditingCell = { field: string; value: string };
type EditingDateRange = {
  issueId: number;
  focusField: 'start_date' | 'due_date';
  startDate: string;
  dueDate: string;
};

type ProcessFlowStep = {
  id: number;
  title: string;
  rangeLabel: string;
  startDate: string | null;
  dueDate: string | null;
  anchorDate: string;
  shapeKind: 'range' | 'start-only' | 'due-only';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  progress: number;
  hasChildren: boolean;
};

type ProcessFlowRenderStep = ProcessFlowStep & {
  anchorX: number;
  shapeX: number;
  visualWidth: number;
  hitX: number;
  hitWidth: number;
  laneIndex: number;
  isFirst: boolean;
  hasLeftNotch: boolean;
  joinsPrevious: boolean;
  x: number;
  width: number;
  textX: number;
};

type DrilldownCrumb = {
  issueId: number;
  title?: string;
};

const processStatusStyles: Record<ProcessFlowStep['status'], {
  fill: string;
  text: string;
  stroke: string;
  accent: string;
  progressText: string;
  dateText: string;
}> = {
  COMPLETED: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#2563eb', progressText: '#1f2937', dateText: '#475569' },
  IN_PROGRESS: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#f97316', progressText: '#1f2937', dateText: '#475569' },
  PENDING: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#64748b', progressText: '#1f2937', dateText: '#475569' }
};

const PROCESS_FLOW_MIN_WIDTH = 640;
const PROCESS_FLOW_YEAR_ROW_HEIGHT = 25;
const PROCESS_FLOW_MONTH_ROW_HEIGHT = 25;
const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
const PROCESS_FLOW_LANE_HEIGHT = 122;
const PROCESS_FLOW_BAR_HEIGHT = 36;
const PROCESS_FLOW_BAR_Y = 28;
const PROCESS_FLOW_BAR_SPACING_Y = 17;
const PROCESS_FLOW_POINT_DEPTH = 22;
const PROCESS_FLOW_DIAMOND_WIDTH = PROCESS_FLOW_BAR_HEIGHT;
const PROCESS_FLOW_TRIANGLE_WIDTH = (PROCESS_FLOW_BAR_HEIGHT * Math.sqrt(3)) / 2;
const PROCESS_FLOW_PROGRESS_LABEL_Y = PROCESS_FLOW_BAR_Y + PROCESS_FLOW_BAR_HEIGHT + 18;
const PROCESS_FLOW_LEFT_NOTCH_RATIO = 0.55;
const PROCESS_FLOW_RIGHT_HEAD_RATIO = 0.62;
const PROCESS_FLOW_DATE_LABEL_INSET = 8;
const PROCESS_FLOW_DRAG_THRESHOLD_PX = 4;
const DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX = 320;
const DETAILS_TOP_PANE_MIN_HEIGHT_PX = 180;
const DETAILS_BOTTOM_PANE_MIN_HEIGHT_PX = 240;
const DETAILS_LAYOUT_FALLBACK_HEIGHT_PX = 760;

const TABLE_DENSITY_STORAGE_KEY = 'redmine_report_task_details_density';
const COLUMN_WIDTH_STORAGE_KEY = 'redmine_report_task_details_column_widths';

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
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

const DENSITY_CONFIG = {
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
};

const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY: string = "var(--font-sans)";
const TASK_ROW_BASE_CLASS = 'flex items-center min-h-[56px] transition-all duration-200 relative group px-6 border-b border-gray-100 font-sans text-[var(--color-text-04)]';
const TASK_BADGE_BASE_CLASS = 'inline-flex max-w-full items-center justify-center rounded-[9999px] px-3 py-1 text-[11px] font-semibold font-sans truncate transition-all duration-300';
const REDMINE_DIALOG_ACTION_CLASS = 'inline-flex items-center justify-center h-8 min-w-8 px-4 rounded-[9999px] border border-gray-200 bg-white text-[13px] font-medium font-sans text-[#222222] hover:bg-gray-100 transition-colors cursor-pointer shadow-subtle';

const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-9 w-9 rounded-[9999px] bg-[rgba(0,0,0,0.04)] text-[#45515e] hover:bg-[rgba(0,0,0,0.08)] hover:text-[#222222] transition-all duration-300 cursor-pointer';
const REDMINE_DIALOG_PRIMARY_ACTION_CLASS = 'inline-flex items-center justify-center h-9 min-w-[100px] px-6 rounded-[9999px] bg-[#181e25] text-[13px] font-semibold font-sans text-[#ffffff] hover:bg-black transition-all shadow-subtle disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

const REDMINE_DIALOG_SECTION_TITLE_CLASS = 'text-[13px] font-display font-semibold uppercase text-[#18181b] tracking-wider';
const REDMINE_DIALOG_TEXTAREA_CLASS = 'w-full min-h-[120px] resize-y border border-gray-100 rounded-[16px] bg-[#f8fafc] px-4 py-3 text-[16px] leading-[1.50] font-sans text-[#222222] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] focus:border-[var(--color-primary-500)] transition-all';
const REDMINE_DIALOG_SECTION_CLASS = 'border-b border-gray-50 px-8 py-6';
const EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS = `
                  #issue-form p:has(#issue_subject),
                  #new_issue p:has(#issue_subject),
                  #edit_issue p:has(#issue_subject) {
                    margin-bottom: 8px !important;
                  }
                  #issue-form label[for="issue_subject"],
                  #new_issue label[for="issue_subject"],
                  #edit_issue label[for="issue_subject"] {
                    margin-bottom: 2px !important;
                    font-size: 12px !important;
                    line-height: 1.2 !important;
                  }
                  #issue_subject {
                    min-height: 28px !important;
                    height: 28px !important;
                    padding-top: 3px !important;
                    padding-bottom: 3px !important;
                    font-size: 13px !important;
                    line-height: 1.2 !important;
                  }
`;

const EMBEDDED_ISSUE_EDIT_EXTRA_CSS = `
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

const EMBEDDED_ISSUE_VIEW_EXTRA_CSS = `
                  ${EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS}
                  body {
                    font-family: var(--font-sans) !important;
                    color: var(--color-text-00) !important;
                    padding: 20px 24px !important;
                    background: transparent !important;
                  }
                  /* Contextual menu (Update, Edit etc. links) */
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

                  /* Hide main issue form buttons as per user request (use dialog's Save). */
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

const getProcessChevronMetrics = (width: number, pointDepth: number) => {
  const leftNotchDepth = Math.min(pointDepth * PROCESS_FLOW_LEFT_NOTCH_RATIO, Math.max(width * 0.18, 8));
  const rightHeadDepth = Math.min(pointDepth * PROCESS_FLOW_RIGHT_HEAD_RATIO, Math.max(width * 0.16, 10));
  const leftShoulder = Math.max(4, Math.round(leftNotchDepth * 0.38));

  return {
    leftNotchDepth,
    rightHeadDepth,
    leftShoulder
  };
};

const buildProcessChevronPathData = (
  x: number,
  y: number,
  width: number,
  height: number,
  pointDepth: number,
  hasLeftNotch: boolean
) => {
  const { leftNotchDepth, rightHeadDepth, leftShoulder } = getProcessChevronMetrics(width, pointDepth);
  const leftShoulderX = x + leftShoulder;
  const leftNotchTipX = x + leftNotchDepth;
  const rightBaseX = x + Math.max(width - rightHeadDepth, leftShoulder);
  const rightTipX = x + width;

  const pathData = [
    `M ${hasLeftNotch ? leftShoulderX : x} ${y}`,
    hasLeftNotch ? `L ${leftNotchTipX} ${y + height / 2}` : '',
    hasLeftNotch ? `L ${leftShoulderX} ${y + height}` : `L ${x} ${y + height}`,
    `L ${rightBaseX} ${y + height}`,
    `L ${rightTipX} ${y + height / 2}`,
    `L ${rightBaseX} ${y}`,
    'Z'
  ].filter(Boolean).join(' ');

  return {
    pathData,
    leftShoulderX,
    leftNotchTipX,
    rightBaseX,
    rightTipX
  };
};

const drawSelectedProcessOutline = (
  context: CanvasRenderingContext2D,
  step: {
    shapeKind: 'range' | 'start-only' | 'due-only';
    stepY: number;
    x: number;
    width: number;
    hasLeftNotch: boolean;
    shapeX: number;
    visualWidth: number;
        textX: number;
    barHeight: number;
    pointDepth: number;
  }


) => {
  context.save();
  context.strokeStyle = '#2563eb';
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.shadowColor = 'rgba(37, 99, 235, 0.18)';
  context.shadowBlur = 6;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 1;

  if (step.shapeKind === 'due-only') {
    const halfWidth = step.visualWidth / 2;
    const halfHeight = step.barHeight / 2;
    context.beginPath();
    context.moveTo(step.textX, step.stepY - 3);
    context.lineTo(step.textX + halfWidth + 3, step.stepY + halfHeight);
    context.lineTo(step.textX, step.stepY + step.barHeight + 3);
    context.lineTo(step.textX - halfWidth - 3, step.stepY + halfHeight);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  if (step.shapeKind === 'start-only') {
    context.beginPath();
    context.moveTo(step.shapeX - 3, step.stepY - 3);
    context.lineTo(step.shapeX + step.visualWidth + 4, step.stepY + step.barHeight / 2);
    context.lineTo(step.shapeX - 3, step.stepY + step.barHeight + 3);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  const leftEdgeX = step.x - 3;
  const topY = step.stepY - 3;
  const bottomY = step.stepY + step.barHeight + 3;
  const {
    leftShoulderX,
    leftNotchTipX,
    rightBaseX,
    rightTipX
  } = buildProcessChevronPathData(step.x, step.stepY, step.width, step.barHeight, step.pointDepth, step.hasLeftNotch);

  context.beginPath();
  if (step.hasLeftNotch) {
    context.moveTo(leftShoulderX - 3, topY);
    context.lineTo(leftNotchTipX + 3, step.stepY + step.barHeight / 2);
    context.lineTo(leftShoulderX - 3, bottomY);
  } else {
    context.moveTo(leftEdgeX, topY);
    context.lineTo(leftEdgeX, bottomY);
  }
  context.lineTo(rightBaseX + 3, bottomY);
  context.lineTo(rightTipX + 3, step.stepY + step.barHeight / 2);
  context.lineTo(rightBaseX + 3, topY);
  context.closePath();
  context.stroke();
  context.restore();
};

const shiftIsoDate = (isoDate: string, deltaDays: number) => format(addDays(parseISO(isoDate), deltaDays), 'yyyy-MM-dd');
const extractMD = (isoDate: string) => {
  const parts = isoDate.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}`;
};

type ProcessDragMode = 'move' | 'resize-left' | 'resize-right';
type DetailsVerticalResizeSession = {
  pointerId: number;
  startClientY: number;
  startTopPaneHeight: number;
  containerHeight: number;
};

type ProcessDragSession = {
  issueId: number;
  pointerId: number;
  mode: ProcessDragMode;
  startClientX: number;
  originalStartDate: string;
  originalDueDate: string;
  currentStartDate: string;
  currentDueDate: string;
  moved: boolean;
};

const ColumnResizer = ({ onResize }: { onResize: (deltaX: number) => void }) => {
  const [resizing, setResizing] = useState(false);
  const startXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!resizing) return;
    const deltaX = e.clientX - startXRef.current;
    if (deltaX !== 0) {
      onResize(deltaX);
      startXRef.current = e.clientX;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setResizing(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-1 border-r border-slate-300 cursor-ew-resize z-30 transition-colors ${resizing ? 'bg-blue-500 border-blue-500' : 'hover:bg-blue-400 group-hover:bg-slate-300'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
};

const IssueTreeNode = ({
  node,
  depth,
  activeLines,
  isLast,
  rootIssueId,
  savingIssueIds,
  handleDateChange,
  onAddSubIssue,
  onEditIssue,
  onViewIssue,
  onSelectIssue,
  selectedIssueId,
  masters,
  onFieldUpdate,
  columnWidths,
  density
}: IssueTreeNodeProps) => {
  const progressRatio = Math.max(0, Math.min(100, Number(node.done_ratio ?? 0)));
  const isDone = progressRatio === 100;
  const isSelected = selectedIssueId === node.issue_id;
  const [collapsed, setCollapsed] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingDateRange, setEditingDateRange] = useState<EditingDateRange | null>(null);
  const [isSavingField, setIsSavingField] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const dueDateInputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      }
    } catch {
      // ignore browsers that block scripted picker opening
    }

    input.focus();
  };

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.type === 'text') {
        inputRef.current.select();
      }
    }
  }, [editingCell]);

  useEffect(() => {
    if (!editingDateRange || editingDateRange.issueId !== node.issue_id) return;

    const targetInput = editingDateRange.focusField === 'start_date'
      ? startDateInputRef.current
      : dueDateInputRef.current;

    if (!targetInput) return;

    const timer = window.setTimeout(() => {
      openDatePicker(targetInput);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editingDateRange, node.issue_id]);

  const statusLabel = node.status_name || t('status.pending');
  const isClosed = node.status_is_closed ?? false;
  const isInProgress = !isClosed && progressRatio > 0;
  const statusBg = isClosed ? 'bg-blue-600' : isInProgress ? 'bg-blue-500' : 'bg-slate-300';
  const statusText = isClosed ? 'text-white' : isInProgress ? 'text-white' : 'text-slate-600';
  const commentCount = node.comments?.length ?? 0;
  const hasComments = commentCount > 0;

  const dateRange = (() => {
    const s = node.start_date ? node.start_date.replace(/-/g, '/') : '';
    const d = node.due_date ? node.due_date.replace(/-/g, '/') : '';
    if (s && d) return `${s} - ${d}`;
    if (s) return s;
    if (d) return d;
    return '';
  })();
  const hasBothDates = Boolean(node.start_date && node.due_date);
  const trackerBadgeClass = node.tracker_name
    ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
    : 'bg-slate-50 text-slate-400 ring-1 ring-slate-200/70';
  const priorityBadgeClass = (() => {
    const priorityId = Number(node.priority_id ?? 0);
    if (!node.priority_name) return 'bg-slate-50 text-slate-400 ring-1 ring-slate-200/70';
    if (priorityId >= 5) return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    if (priorityId >= 4) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    if (priorityId >= 3) return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
    return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
  })();

  const startEdit = (field: string, currentValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCell({ field, value: currentValue });
    setEditingDateRange(null);
  };

  const cancelEdit = () => setEditingCell(null);
  const cancelDateRangeEdit = () => setEditingDateRange(null);
  const startDateRangeEdit = (field: 'start_date' | 'due_date', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCell(null);
    setEditingDateRange({
      issueId: node.issue_id,
      focusField: field,
      startDate: node.start_date || '',
      dueDate: node.due_date || ''
    });
  };
  const updateDateRangeDraft = (key: 'startDate' | 'dueDate', value: string) => {
    setEditingDateRange((prev) => {
      if (!prev || prev.issueId !== node.issue_id) return prev;
      return { ...prev, [key]: value };
    });
  };
  const commitDateRangeEdit = () => {
    if (!editingDateRange || editingDateRange.issueId !== node.issue_id) return;

    if ((node.start_date || '') !== editingDateRange.startDate) {
      handleDateChange(node, 'start_date', editingDateRange.startDate);
    }

    if ((node.due_date || '') !== editingDateRange.dueDate) {
      handleDateChange(node, 'due_date', editingDateRange.dueDate);
    }

    cancelDateRangeEdit();
  };

  const commitEdit = async (field: string, rawValue: string) => {
    setEditingCell(null);
    let value: string | number | null = rawValue;
    if (field === 'done_ratio') {
      if (rawValue === '') {
        await onFieldUpdate(node.issue_id, field, progressRatio);
        return;
      }
      value = Math.max(0, Math.min(100, Number(rawValue)));
    } else if (['tracker_id', 'status_id', 'priority_id'].includes(field)) {
      value = rawValue === '' ? null : Number(rawValue);
    } else if (field === 'assigned_to_id') {
      value = rawValue === '' || rawValue === '0' ? null : Number(rawValue);
    }
    setIsSavingField(true);
    try {
      await onFieldUpdate(node.issue_id, field, value);
    } finally {
      setIsSavingField(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit(editingCell!.field, e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const isEditing = (field: string) => editingCell?.field === field;
  const isEditingDateRange = editingDateRange?.issueId === node.issue_id;
  const isSaving = savingIssueIds[node.issue_id] || isSavingField;
  const dateRangeDraft = isEditingDateRange ? editingDateRange : null;
  const displayStartDate = dateRangeDraft?.startDate || node.start_date || '';
  const displayDueDate = dateRangeDraft?.dueDate || node.due_date || '';

  const cellClass = 'group/cell cursor-pointer';

  return (
    <>
      <div
        data-testid={`task-row-${node.issue_id}`}
        data-selected={isSelected ? 'true' : 'false'}
        className={`flex items-center ${DENSITY_CONFIG[density].rowHeight} transition-all duration-200 relative group px-6 border-b border-gray-100 font-sans text-[var(--color-text-04)] ${isSelected ? 'bg-[rgba(20,86,240,0.04)] shadow-[inset_0_0_0_1px_rgba(20,86,240,0.1)]' : 'bg-white hover:bg-slate-50'}
`}
      >
        {/* Tree connectors */}
        <div className="absolute left-4 top-0 bottom-0 flex pointer-events-none" style={{ width: `${depth * 20}px` }}>
          {activeLines.map((isActive, level) => (
            <svg key={level} width="20" height="100%" className="flex-shrink-0 overflow-visible">
              {isActive && (
                <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" />
              )}
            </svg>
          ))}
          {depth > 0 && (
            <svg width="20" height="100%" className="flex-shrink-0 overflow-visible">
              <line x1="10" y1="0" x2="10" y2={isLast ? '50%' : '100%'} stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="10" y1="50%" x2="20" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
            </svg>
          )}
        </div>

        {node.children.length > 0 && (
          <div className="absolute pointer-events-none" style={{ left: `${16 + depth * 20}px`, top: '50%', bottom: 0, width: '20px' }}>
            {!collapsed && (
              <svg width="20" height="100%" className="overflow-visible">
                <line x1="10" y1="0" x2="10" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" />
              </svg>
            )}
          </div>
        )}

        {/* TASK Column */}
        <div
          className="shrink-0 flex items-center border-r border-slate-200/80 self-stretch overflow-hidden"
          style={{ paddingLeft: `${depth * 20}px`, width: `${columnWidths.task}px`, minWidth: `${columnWidths.task}px` }}
          onClick={() => onSelectIssue?.(node)}
          data-testid={`task-title-cell-${node.issue_id}`}
        >
          <div className="w-5 mr-1 flex-shrink-0 flex items-center justify-center">
            {node.children.length > 0 && (
              <button
                type="button"
                className="p-0.5 !border-0 ring-0 shadow-none bg-transparent appearance-none rounded-sm text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 focus:outline-none cursor-pointer flex-shrink-0 z-10"
                onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
              >
                <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  {collapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  }
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center min-w-0 z-10 flex-1">
            <span
              className={`flex-shrink-0 text-slate-400 ${DENSITY_CONFIG[density].idSize} font-semibold mr-1.5 cursor-pointer hover:text-blue-500`}
              onClick={(e) => { e.stopPropagation(); onSelectIssue?.(node); }}
            >#{node.issue_id}</span>
            {isEditing('subject') ? (
              <input
                ref={inputRef}
                type="text"
                className={`flex-1 ${DENSITY_CONFIG[density].subjectSize} h-8 px-2 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-800 min-w-0 shadow-sm`}
                value={editingCell!.value}
                onChange={(e) => setEditingCell({ field: 'subject', value: e.target.value })}
                onBlur={() => { void commitEdit('subject', editingCell!.value); }}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                data-testid="task-subject"
                className={`${DENSITY_CONFIG[density].subjectSize} leading-5 ${depth === 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'} truncate hover:text-blue-700 block cursor-pointer`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewIssue(node);
                }}
                title={node.subject ? `${node.subject} (${t('timeline.viewIssue')})` : t('timeline.viewIssue')}
              >
                {node.subject}
              </span>
            )}
            {!isEditing('subject') && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 ml-1 flex-shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-6 h-6 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddSubIssue(node); }}
                  title={t('timeline.addSubIssue')}
                >
                  <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-6 h-6 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditIssue(node); }}
                  title={t('timeline.editIssue')}
                  aria-label={t('timeline.editIssue')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* COMMENTS Column */}
        <div className="shrink-0 flex items-center justify-center px-2 border-r border-slate-200/80 self-stretch" style={{ width: `${columnWidths.comments}px`, minWidth: `${columnWidths.comments}px` }}>
          {hasComments ? (
            <span
              data-testid="task-comment-indicator"
              role="img"
              className="inline-flex items-center justify-center text-blue-600"
              title={t('timeline.hasCommentsCount', {
                count: commentCount,
                defaultValue: `${commentCount} comments`
              })}
              aria-label={t('timeline.hasCommentsCount', {
                count: commentCount,
                defaultValue: `${commentCount} comments`
              })}
            >
              <svg className="h-[17px] w-[17px]" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l2.8-2.1a2 2 0 011.2-.4H19a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h.5a2 2 0 011.2.4L8 20z" />
              </svg>
            </span>
          ) : null}
        </div>

        {/* TRACKER Column */}
        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`}
          style={{ width: `${columnWidths.tracker}px`, minWidth: `${columnWidths.tracker}px` }}
          onDoubleClick={(e) => startEdit('tracker_id', String(node.tracker_id || ''), e)}
        >
          {isEditing('tracker_id') && masters ? (
            <select
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('tracker_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.trackers.map((tr) => (
                <option key={tr.id} value={String(tr.id)}>{tr.name}</option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex max-w-full items-center justify-center rounded-[9999px] px-3 py-1 ${DENSITY_CONFIG[density].badgeSize} font-semibold font-sans truncate transition-all duration-300 ${trackerBadgeClass} group/cell:hover:ring-1 group/cell:hover:ring-blue-300`}
              title={node.tracker_name || ''}
            >
              {node.tracker_name || '-'}
            </span>
          )}
        </div>

        {/* PRIORITY Column */}
        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`} style={{ width: `${columnWidths.priority}px`, minWidth: `${columnWidths.priority}px` }}
          onDoubleClick={(e) => startEdit('priority_id', String(node.priority_id || ''), e)}
        >
          {isEditing('priority_id') && masters ? (
            <select
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('priority_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.priorities.filter(p => p.id !== null).map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex max-w-full items-center justify-center rounded-[9999px] px-3 py-1 ${DENSITY_CONFIG[density].badgeSize} font-semibold font-sans truncate transition-all duration-300 ${priorityBadgeClass}`}
              title={node.priority_name || ''}
            >
              {node.priority_name || '-'}
            </span>
          )}
        </div>

        {/* STATUS Column */}
        <div
          className={`shrink-0 flex items-center justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`} style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}
          onDoubleClick={(e) => startEdit('status_id', String(node.status_id || ''), e)}
        >
          {isEditing('status_id') && masters ? (
            <select
              className={`w-full ${DENSITY_CONFIG[density].badgeSize} h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm`}
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('status_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className={`inline-flex items-center justify-center min-w-[56px] ${DENSITY_CONFIG[density].badgeSize} font-bold px-2.5 py-1 rounded-full ${statusBg} ${statusText} shadow-sm`}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* PROGRESS Column */}
        <div
          className={`shrink-0 flex items-center gap-2 justify-start px-2 border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`} style={{ width: `${columnWidths.progress}px`, minWidth: `${columnWidths.progress}px` }}
          onDoubleClick={(e) => startEdit('done_ratio', String(progressRatio), e)}
        >
          {isEditing('done_ratio') ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={100}
              step={10}
              className={`w-[72px] ${DENSITY_CONFIG[density].progressTextSize} h-8 px-2 border border-[var(--color-brand-6)] rounded-[9999px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] bg-white text-slate-700 shadow-sm font-sans font-medium`}
              defaultValue={editingCell!.value}
              onBlur={(e) => { void commitEdit('done_ratio', e.currentTarget.value); }}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={`flex items-center ${DENSITY_CONFIG[density].progressGap}`}>
              <div
                className="h-2 w-full max-w-[80px] overflow-hidden rounded-[9999px] relative cursor-help bg-gray-100"
                title={`${progressRatio}% ${t('timeline.progress')}`}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-[9999px] transition-all duration-700 ease-out"
                  style={{
                    width: progressRatio === 0 ? '100%' : `${progressRatio}%`,
                    backgroundColor: getProgressFillColor(progressRatio)
                  }}
                />
              </div>
              <span className={`${DENSITY_CONFIG[density].progressTextSize} text-[#45515e] font-semibold tabular-nums min-w-[32px]`} data-testid="progress-text">{progressRatio}%</span>
            </div>
          )}
        </div>

        {/* START DATE Column */}
        <div
          className={`shrink-0 flex items-center px-2 justify-start border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`}
          style={{ width: `${columnWidths.startDate ?? 130}px`, minWidth: `${columnWidths.startDate ?? 130}px` }}
        >
          <div className="relative w-full h-8">
            <span
              data-testid={`start-date-display-${node.issue_id}`}
              className={`inline-flex w-full h-full items-center rounded-md border border-transparent px-1.5 ${DENSITY_CONFIG[density].dateSize} text-slate-700 tabular-nums select-none hover:border-blue-200 hover:bg-blue-50/70 truncate`}
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
              onDoubleClick={(e) => startDateRangeEdit('start_date', e)}
              onClick={(e) => e.stopPropagation()}
            >
              {displayStartDate ? displayStartDate.replace(/-/g, '/') : '-'}
            </span>
            {isEditingDateRange && (editingDateRange.focusField === 'start_date' || !node.start_date) && (
              <input
                ref={startDateInputRef}
                type="date"
                data-testid={`start-date-input-${node.issue_id}`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={dateRangeDraft?.startDate || ''}
                max={dateRangeDraft?.dueDate || undefined}
                onChange={(e) => {
                  updateDateRangeDraft('startDate', e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelDateRangeEdit();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDateRangeEdit();
                  }
                }}
                onBlur={commitDateRangeEdit}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDatePicker(e.currentTarget);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>

        {/* DUE DATE Column */}
        <div
          className={`shrink-0 flex items-center px-2 justify-start border-r border-slate-200/80 self-stretch overflow-hidden ${cellClass}`}
          style={{ width: `${columnWidths.dueDate ?? 130}px`, minWidth: `${columnWidths.dueDate ?? 130}px` }}
        >
          <div className="relative w-full h-8 flex items-center">
            <span
              data-testid={`due-date-display-${node.issue_id}`}
              className={`inline-flex w-full h-full items-center rounded-md border border-transparent px-1.5 ${DENSITY_CONFIG[density].dateSize} text-slate-700 tabular-nums select-none hover:border-blue-200 hover:bg-blue-50/70 truncate`}
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
              onDoubleClick={(e) => startDateRangeEdit('due_date', e)}
              onClick={(e) => e.stopPropagation()}
            >
              {displayDueDate ? displayDueDate.replace(/-/g, '/') : '-'}
            </span>
            {isEditingDateRange && (editingDateRange.focusField === 'due_date' || !node.due_date) && (
              <input
                ref={dueDateInputRef}
                type="date"
                data-testid={`due-date-input-${node.issue_id}`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={dateRangeDraft?.dueDate || ''}
                min={dateRangeDraft?.startDate || undefined}
                onChange={(e) => {
                  updateDateRangeDraft('dueDate', e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelDateRangeEdit();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDateRangeEdit();
                  }
                }}
                onBlur={commitDateRangeEdit}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDatePicker(e.currentTarget);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {isSaving && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 ml-1 flex-shrink-0"></div>
            )}
          </div>
        </div>

        {/* ASSIGNEE Column */}
        <div
          className={`shrink-0 flex items-center justify-start gap-1.5 px-2 overflow-hidden ${cellClass}`}
          style={{ width: `${columnWidths.assignee}px`, minWidth: `${columnWidths.assignee}px` }}
          onDoubleClick={(e) => startEdit('assigned_to_id', String(node.assignee_id || ''), e)}
        >
          {isEditing('assigned_to_id') && masters ? (
            <select
              className={`w-full ${DENSITY_CONFIG[density].dateSize} h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700`}
              value={editingCell!.value}
              onChange={(e) => { void commitEdit('assigned_to_id', e.target.value); }}
              onBlur={() => cancelEdit()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            >
              {masters.members.map((m) => (
                <option key={m.id ?? 'none'} value={m.id === null ? '' : String(m.id)}>{m.name}</option>
              ))}
            </select>
          ) : (
            node.assignee_name ? (
              <>
                <div className={`${DENSITY_CONFIG[density].idSize === 'text-sm' ? 'w-7 h-7' : 'w-6 h-6'} rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0`}>
                  <svg className={DENSITY_CONFIG[density].iconSize} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                </div>
                <span className={`${DENSITY_CONFIG[density].subjectSize} font-medium text-slate-700 truncate`}>{node.assignee_name}</span>
              </>
            ) : (
              <span className={`${DENSITY_CONFIG[density].badgeSize} text-slate-400`}>-</span>
            )
          )}
        </div>

      </div>

      {!collapsed && node.children.map((child, idx) => (
        <IssueTreeNode
          key={child.issue_id}
          node={child}
          depth={depth + 1}
          activeLines={depth === 0 ? [] : [...activeLines, !isLast]}
          isLast={idx === node.children.length - 1}
          rootIssueId={rootIssueId}
          savingIssueIds={savingIssueIds}
          handleDateChange={handleDateChange}
          onAddSubIssue={onAddSubIssue}
          onEditIssue={onEditIssue}
          onViewIssue={onViewIssue}
          onSelectIssue={onSelectIssue}
          selectedIssueId={selectedIssueId}
          masters={masters}
          onFieldUpdate={onFieldUpdate}
          columnWidths={columnWidths}
          density={density}
        />
      ))}
    </>
  );
};

type SubIssueCreationDialogProps = {
  projectIdentifier: string;
  parentIssueId: number;
  inheritedFields: InheritedSubIssueFields;
  onCreated?: (createdIssueId?: number) => void;
  onClose: () => void;
};

type IssueEditDialogProps = {
  projectIdentifier: string;
  issueId: number;
  issueUrl: string;
  onSaved?: (updatedIssueId?: number) => void;
  onClose: () => void;
};

type InheritedSubIssueFields = Pick<BulkIssuePayload, 'tracker_id' | 'priority_id' | 'assigned_to_id' | 'start_date' | 'due_date'>;

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

const buildInheritedSubIssueFields = (source: {
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

const extractInheritedSubIssueFieldsFromForm = (form: HTMLFormElement): InheritedSubIssueFields => {
  const formData = new FormData(form);
  return {
    tracker_id: readNumericField(formData, 'issue[tracker_id]'),
    priority_id: readNumericField(formData, 'issue[priority_id]'),
    assigned_to_id: readNumericField(formData, 'issue[assigned_to_id]'),
    start_date: readDateField(formData, 'issue[start_date]'),
    due_date: readDateField(formData, 'issue[due_date]')
  };
};

const buildSubIssueQuery = (parentIssueId: number, inheritedFields: InheritedSubIssueFields): string => {
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

function SubIssueCreationDialog({
  projectIdentifier,
  parentIssueId,
  inheritedFields,
  onCreated,
  onClose
}: SubIssueCreationDialogProps) {
  const issueQuery = useMemo(
    () => buildSubIssueQuery(parentIssueId, inheritedFields),
    [inheritedFields, parentIssueId]
  );
  const iframeUrl = `/projects/${projectIdentifier}/issues/new?${issueQuery}`;
  const externalUrl = iframeUrl;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const [iframeError, setIframeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const handledCreationRef = useRef(false);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    sectionRef,
    errorRef,
  });

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    handledCreationRef.current = false;
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  const findEmbeddedNewIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));

    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));

    return { doc, form };
  };

  const createBulkIssues = async (newParentIssueId: number, lines: string[], defaults: InheritedSubIssueFields) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject, ...defaults };
      await createIssue(projectIdentifier, newParentIssueId, payload);
    }
  };

  const submitDefaultIssueForm = () => {
    try {
      const { form } = findEmbeddedNewIssueForm();
      const submitter =
        form.querySelector<HTMLElement>('input[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('input[type="submit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[type="submit"]:not([disabled])');
      if (submitter) {
        submitter.click();
        return;
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      if (form.dispatchEvent(submitEvent)) form.submit();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    }
  };

  const createParentIssueFromEmbeddedForm = async (form: HTMLFormElement): Promise<number> => {
    const action = form.getAttribute('action') || '/issues';
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(t('embeddedIssueForm.createParentIssueFailed', { status: res.status }));
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || ''];
    const createdIssueId = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));

    if (!createdIssueId) {
      throw new Error(t('embeddedIssueForm.createdParentIssueIdNotFound'));
    }
    return Number(createdIssueId[1]);
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      submitDefaultIssueForm();
      return;
    }

    setIsSubmitting(true);
    try {
      const { form } = findEmbeddedNewIssueForm();
      const defaults = extractInheritedSubIssueFieldsFromForm(form);
      const newParentIssueId = await createParentIssueFromEmbeddedForm(form);
      await createBulkIssues(newParentIssueId, lines, defaults);
      setBulkText('');
      setBulkOpen(false);
      onCreated?.(newParentIssueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizeEmbeddedFormActions = (doc: Document) => {
    const forms = Array.from(doc.querySelectorAll('form[action]'));
    forms.forEach((form) => {
      const rawAction = form.getAttribute('action');
      if (!rawAction) return;
      try {
        const actionUrl = new URL(rawAction, window.location.origin);
        if (actionUrl.origin === window.location.origin) return;
        const normalized = `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`;
        form.setAttribute('action', normalized);
      } catch {
        // Ignore invalid URL and keep original action.
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[6px] shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
        style={{
          width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
          maxWidth: '98vw',
          height: `${dialogHeightPx ?? getEmbeddedDialogDefaultHeight()}px`,
          maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          data-testid="sub-issue-dialog-header"
          className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ padding: '2px 12px' }}
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {iframeHeader ? (
              <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} #${parentIssueId} ${iframeSubject}`}>
                {iframeHeader} #{parentIssueId} {iframeSubject}
              </span>
            ) : (
              <React.Fragment>
                <span className="text-[14px] font-bold text-slate-800 truncate">
                  {t('subIssueDialog.iframeTitle')} #{parentIssueId}
                </span>
              </React.Fragment>
            )}
          </div>
          <div className="flex items-center gap-[6px] flex-shrink-0">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              title={t('common.openInNewTab')}
              aria-label={t('common.openInNewTab')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('timeline.closeCreateIssueDialogAria')}
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              onClick={onClose}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
          {iframeError ? (
            <div
              ref={errorRef}
              data-testid="sub-issue-dialog-error"
              style={{
                flex: '0 0 auto',
                padding: '12px 16px',
                backgroundColor: '#fdecea',
                color: '#b71c1c',
                borderBottom: '1px solid #f5c6cb',
                fontSize: 13,
              }}
            >
              {iframeError}
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            title={t('subIssueDialog.iframeTitle')}
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;

                applyEmbeddedIssueDialogStyles(doc, {
                  contentPadding: '16px',
                  extraCss: EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
                  styleId: `${ISSUE_DIALOG_STYLE_ID}-subissue`,
                });
                setIframeError(getEmbeddedIssueDialogErrorMessage(doc));
                bindIframeSizeObservers(doc);
                cleanupIframeEscRef.current?.();
                cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
                normalizeEmbeddedFormActions(doc);

                try {
                  const h2Ele = doc.querySelector('h2');
                  if (h2Ele) setIframeHeader(h2Ele.textContent || '');
                  const subjectInput = doc.querySelector<HTMLInputElement>('#issue_subject');
                  if (subjectInput) {
                    setIframeSubject(subjectInput.value);
                    subjectInput.addEventListener('input', (event) => {
                      setIframeSubject((event.target as HTMLInputElement).value);
                    });
                  }
                } catch {
                  // Ignore iframe parsing failures.
                }

                const pathname = doc.location?.pathname || '';
                if (!handledCreationRef.current && /^\/issues\/\d+(?:\/)?$/.test(pathname)) {
                  handledCreationRef.current = true;
                  const createdIssueId = Number(pathname.split('/').pop());
                  onCreated?.(Number.isFinite(createdIssueId) ? createdIssueId : undefined);
                  onClose();
                  return;
                }
              } catch {
                setIframeError(null);
              }
              requestAnimationFrame(() => {
                setIframeReady(true);
                measureDialogHeight();
              });
            }}
          />
          {!iframeReady ? (
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
            </div>
          ) : null}
        </div>

        <div
          ref={sectionRef}
          className="border-t border-slate-200 bg-white flex-shrink-0"
          style={{ padding: '8px 12px 0 12px' }}
        >
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors"
            onClick={() => setBulkOpen(!bulkOpen)}
          >
            <span
              className="inline-block transition-transform duration-200 text-xs"
              style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              ▶
            </span>
            <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
          </button>

          {bulkOpen ? (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder={t('subIssueDialog.bulkPlaceholder')}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div
          ref={footerRef}
          data-testid="sub-issue-dialog-footer"
          className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center"
          style={{ padding: '2px 12px 4px 12px' }}
        >
          <button
            type="button"
            className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              borderColor: '#cbd5e1',
              color: '#334155',
            }}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-[6px] text-[13px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              backgroundColor: '#1b69e3',
              color: '#fff',
            }}
            disabled={isSubmitting || !iframeReady}
            onClick={handleSave}
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueEditDialog({
  projectIdentifier,
  issueId,
  issueUrl,
  onSaved,
  onClose
}: IssueEditDialogProps) {
  const iframeUrl = `${issueUrl}/edit`;
  const externalUrl = iframeUrl;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const saveInFlightRef = useRef(false);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const cleanupEmbeddedSubmitRef = useRef<(() => void) | null>(null);
  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    sectionRef,
    errorRef,
  });

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;
  }, []);

  const createBulkIssues = async (parentIssueId: number, lines: string[], defaults: InheritedSubIssueFields) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject, ...defaults };
      await createIssue(projectIdentifier, parentIssueId, payload);
    }
  };

  const normalizeEmbeddedFormActions = (doc: Document) => {
    const forms = Array.from(doc.querySelectorAll('form[action]'));
    forms.forEach((form) => {
      const rawAction = form.getAttribute('action');
      if (!rawAction) return;
      try {
        const actionUrl = new URL(rawAction, window.location.origin);
        if (actionUrl.origin === window.location.origin) return;
        form.setAttribute('action', `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`);
      } catch {
        // Ignore invalid URL and keep original action.
      }
    });
  };

  const findEmbeddedIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));
    return { doc, form };
  };

  const parseEmbeddedIssueDocument = (html: string): Document =>
    new DOMParser().parseFromString(html, 'text/html');

  const hasEmbeddedIssueForm = (doc: Document): boolean =>
    Boolean(
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue')
    );

  const bindEmbeddedIssueFormSubmit = (doc: Document) => {
    cleanupEmbeddedSubmitRef.current?.();
    cleanupEmbeddedSubmitRef.current = null;

    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) return;

    const handleSubmit = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void handleSave();
    };

    form.addEventListener('submit', handleSubmit);
    cleanupEmbeddedSubmitRef.current = () => {
      form.removeEventListener('submit', handleSubmit);
    };
  };

  const syncEmbeddedIssueFrame = (doc: Document) => {
    applyEmbeddedIssueDialogStyles(doc, {
      contentPadding: '16px',
      extraCss: EMBEDDED_ISSUE_EDIT_EXTRA_CSS,
      styleId: `${ISSUE_DIALOG_STYLE_ID}-edit`,
    });
    setIframeError(getEmbeddedIssueDialogErrorMessage(doc));
    bindIframeSizeObservers(doc);

    try {
      const h2Ele = doc.querySelector('h2');
      if (h2Ele) setIframeHeader(h2Ele.textContent || '');
      const subjectInput = doc.querySelector<HTMLInputElement>('#issue_subject');
      if (subjectInput) {
        setIframeSubject(subjectInput.value);
        subjectInput.addEventListener('input', (event) => {
          setIframeSubject((event.target as HTMLInputElement).value);
        });
      } else {
        const subjectDiv = doc.querySelector('.subject h3');
        if (subjectDiv) setIframeSubject(subjectDiv.textContent || '');
      }
    } catch {
      // Ignore iframe parsing failures.
    }

    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
    normalizeEmbeddedFormActions(doc);
    bindEmbeddedIssueFormSubmit(doc);

    requestAnimationFrame(() => {
      setIframeReady(true);
      measureDialogHeight();
    });
  };

  const renderValidationResponseInIframe = (html: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    try {
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      return;
    }

    syncEmbeddedIssueFrame(doc);
  };

  const saveEditedIssueFromEmbeddedForm = async (): Promise<
    | { kind: 'saved'; issueId: number }
    | { kind: 'validation-error'; errorMessage: string | null }
  > => {
    const { form } = findEmbeddedIssueForm();
    const action = form.getAttribute('action') || `/issues/${issueId}`;
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData
    });

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || '', action];
    const matched = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));
    const updatedIssueId = matched ? Number(matched[1]) : issueId;

    // Redmine redirects (302) to the issue show page after a successful update.
    // The show page may contain an inline edit form, so we must check for redirect
    // first to avoid misidentifying a successful save as a validation error.
    const isRedirectedToShowPage = res.redirected ||
      /\/issues\/\d+(?:[/?#]|$)/.test(new URL(res.url, window.location.origin).pathname);

    if (isRedirectedToShowPage && res.ok) {
      return {
        kind: 'saved',
        issueId: updatedIssueId
      };
    }

    const responseHtml = await res.text();
    const responseDoc = parseEmbeddedIssueDocument(responseHtml);
    const validationMessage = getEmbeddedIssueDialogErrorMessage(responseDoc);

    if (validationMessage || hasEmbeddedIssueForm(responseDoc)) {
      renderValidationResponseInIframe(responseHtml);
      return {
        kind: 'validation-error',
        errorMessage: validationMessage
      };
    }

    if (!res.ok) {
      throw new Error(t('common.alertError', { message: `status=${res.status}` }));
    }

    return {
      kind: 'saved',
      issueId: updatedIssueId
    };
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const { form } = findEmbeddedIssueForm();
      const saveResult = await saveEditedIssueFromEmbeddedForm();

      if (saveResult.kind === 'validation-error') {
        return;
      }

      if (lines.length > 0) {
        const defaults = extractInheritedSubIssueFieldsFromForm(form);
        await createBulkIssues(saveResult.issueId, lines, defaults);
        setBulkText('');
        setBulkOpen(false);
      }

      onSaved?.(saveResult.issueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      saveInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[6px] shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
        style={{
          width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
          maxWidth: '98vw',
          height: `${dialogHeightPx ?? getEmbeddedDialogDefaultHeight()}px`,
          maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          data-testid="edit-issue-dialog-header"
          className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ padding: '2px 12px' }}
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {iframeHeader ? (
              <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} ${iframeSubject}`}>
                {iframeHeader} {iframeSubject}
              </span>
            ) : (
              <React.Fragment>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0 text-[10px] font-semibold text-slate-600">
                  #{issueId}
                </span>
                <span className="text-[14px] font-bold text-slate-800 truncate">{t('timeline.editIssueDialogTitle')}</span>
              </React.Fragment>
            )}
          </div>
          <div className="flex items-center gap-[6px] flex-shrink-0">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              title={t('common.openInNewTab')}
              aria-label={t('common.openInNewTab')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('timeline.closeEditIssueDialogAria')}
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              onClick={onClose}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
          {iframeError ? (
            <div
              ref={errorRef}
              data-testid="edit-issue-dialog-error"
              style={{
                flex: '0 0 auto',
                padding: '12px 16px',
                backgroundColor: '#fdecea',
                color: '#b71c1c',
                borderBottom: '1px solid #f5c6cb',
                fontSize: 13,
              }}
            >
              {iframeError}
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            title={t('timeline.editIssueDialogTitle')}
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;
                syncEmbeddedIssueFrame(doc);
              } catch {
                setIframeError(null);
              }
            }}
          />
          {!iframeReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
            </div>
          )}
        </div>

        <div
          ref={sectionRef}
          className="border-t border-slate-200 bg-white flex-shrink-0"
          style={{ padding: '8px 12px 0 12px' }}
        >
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors"
            onClick={() => setBulkOpen(!bulkOpen)}
          >
            <span
              className="inline-block transition-transform duration-200 text-xs"
              style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              ▶
            </span>
            <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
          </button>

          {bulkOpen && (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder={t('subIssueDialog.bulkPlaceholder')}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          )}
        </div>

        <div
          ref={footerRef}
          data-testid="edit-issue-dialog-footer"
          className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center"
          style={{ padding: '2px 12px 4px 12px' }}
        >
          <button
            type="button"
            className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              borderColor: '#cbd5e1',
              color: '#334155',
            }}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-[6px] text-[13px] font-bold text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              backgroundColor: '#1b69e3',
              color: '#fff',
            }}
            disabled={isSubmitting || !iframeReady}
            onClick={handleSave}
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueViewDialog({
  projectIdentifier,
  issueId,
  issueUrl,
  inheritedFields = {},
  onSaved,
  onClose
}: {
  projectIdentifier: string;
  issueId: number;
  issueUrl: string;
  inheritedFields?: InheritedSubIssueFields;
  onSaved?: (updatedIssueId?: number) => void;
  onClose: () => void;
}) {
  const iframeUrl = issueUrl;
  const externalUrl = iframeUrl;
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeHeader, setIframeHeader] = useState('');
  const [iframeSubject, setIframeSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const cleanupIframeEscRef = useRef<(() => void) | null>(null);
  const handledSaveRef = useRef(false);
  const awaitingRedirectRef = useRef(false);

  const { dialogHeightPx, measureDialogHeight, bindIframeSizeObservers, resetLayout } = useEmbeddedIssueDialogLayout({
    isOpen: true,
    iframeRef,
    headerRef,
    footerRef,
    errorRef,
    sectionRef,
  });

  const createBulkIssues = async (parentIssueId: number, lines: string[], defaults: InheritedSubIssueFields) => {
    for (const subject of lines) {
      const payload: BulkIssuePayload = { subject, ...defaults };
      await createIssue(projectIdentifier, parentIssueId, payload);
    }
  };

  const findEmbeddedIssueForm = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) throw new Error(t('embeddedIssueForm.formNotLoaded'));
    const form =
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue');
    if (!form) throw new Error(t('embeddedIssueForm.formNotFound'));
    return { doc, form };
  };

  const submitDefaultIssueForm = () => {
    try {
      const { form } = findEmbeddedIssueForm();
      const submitter =
        form.querySelector<HTMLElement>('input[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[name="commit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('input[type="submit"]:not([disabled])') ||
        form.querySelector<HTMLElement>('button[type="submit"]:not([disabled])');
      if (submitter) {
        submitter.click();
        return;
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      if (form.dispatchEvent(submitEvent)) form.submit();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    }
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        awaitingRedirectRef.current = true;
        submitDefaultIssueForm();
        return;
      }
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await createBulkIssues(issueId, lines, inheritedFields);
      setBulkText('');
      setBulkOpen(false);
      onSaved?.(issueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    setIframeReady(false);
    setIframeError(null);
    setIframeHeader('');
    setIframeSubject('');
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
    handledSaveRef.current = false;
    awaitingRedirectRef.current = false;
    resetLayout();
  }, [iframeUrl, resetLayout]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  useEffect(() => () => {
    cleanupIframeEscRef.current?.();
    cleanupIframeEscRef.current = null;
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[6px] shadow-2xl ring-1 ring-slate-900/5 flex flex-col overflow-hidden"
        style={{
          width: `${DEFAULT_DIALOG_WIDTH_PX}px`,
          maxWidth: '98vw',
          height: `${dialogHeightPx ?? getEmbeddedDialogDefaultHeight()}px`,
          maxHeight: `${Math.floor(window.innerHeight * MAX_DIALOG_VIEWPORT_HEIGHT_RATIO)}px`,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          data-testid="view-issue-dialog-header"
          className="border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-white"
          style={{ padding: '2px 12px' }}
        >
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {iframeHeader ? (
              <span className="text-[14px] font-bold text-slate-800 truncate" title={`${iframeHeader} ${iframeSubject}`}>
                {iframeHeader} {iframeSubject}
              </span>
            ) : (
              <React.Fragment>
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0 text-[10px] font-semibold text-slate-600">
                  #{issueId}
                </span>
                <span className="text-[14px] font-bold text-slate-800 truncate">{t('timeline.viewIssueDialogTitle')}</span>
              </React.Fragment>
            )}
          </div>
          <div className="flex items-center gap-[6px] flex-shrink-0">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              title={t('common.openInNewTab')}
              aria-label={t('common.openInNewTab')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={t('timeline.closeDialogAria')}
              className="inline-flex items-center justify-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              style={{ width: `${COMPACT_ICON_BUTTON_SIZE}px`, height: `${COMPACT_ICON_BUTTON_SIZE}px` }}
              onClick={onClose}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-white overflow-hidden">
          {iframeError ? (
            <div
              ref={errorRef}
              data-testid="view-issue-dialog-error"
              style={{
                flex: '0 0 auto',
                padding: '12px 16px',
                backgroundColor: '#fdecea',
                color: '#b71c1c',
                borderBottom: '1px solid #f5c6cb',
                fontSize: 13,
              }}
            >
              {iframeError}
            </div>
          ) : null}
          <iframe
            ref={iframeRef}
            title={t('timeline.viewIssueDialogTitle')}
            src={iframeUrl}
            className={`absolute inset-0 w-full h-full border-0 bg-white ${iframeReady ? 'opacity-100' : 'opacity-0'}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentDocument;
                if (!doc) return;

                const iframeErrorMessage = getEmbeddedIssueDialogErrorMessage(doc);
                applyEmbeddedIssueDialogStyles(doc, {
                  contentPadding: '16px',
                  extraCss: EMBEDDED_ISSUE_VIEW_EXTRA_CSS,
                  styleId: `${ISSUE_DIALOG_STYLE_ID}-view`,
                });
                setIframeError(iframeErrorMessage);
                bindIframeSizeObservers(doc);

                const pathname = doc.location?.pathname || '';
                if (
                  !handledSaveRef.current &&
                  awaitingRedirectRef.current &&
                  new RegExp(`^/issues/${issueId}(?:[/?#]|$)`).test(pathname) &&
                  !iframeErrorMessage
                ) {
                  handledSaveRef.current = true;
                  awaitingRedirectRef.current = false;
                  onSaved?.(issueId);
                  onClose();
                  return;
                }

                try {
                  const h2Ele = doc.querySelector('h2');
                  if (h2Ele) setIframeHeader(h2Ele.textContent || '');
                  const subjectDiv = doc.querySelector('.subject h3');
                  if (subjectDiv) setIframeSubject(subjectDiv.textContent || '');
                } catch {
                  // Ignore iframe parsing failures.
                }
                cleanupIframeEscRef.current?.();
                cleanupIframeEscRef.current = bindIframeEscapeHandler(doc, onClose);
              } catch {
                setIframeError(null);
              }
              requestAnimationFrame(() => {
                setIframeReady(true);
                measureDialogHeight();
              });
            }}
          />
          {!iframeReady && (
            <div className="absolute inset-0 bg-white flex items-center justify-center pointer-events-none">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
            </div>
          )}
        </div>

        <div
          ref={sectionRef}
          className="border-t border-slate-200 bg-white flex-shrink-0"
          style={{ padding: '8px 12px 0 12px' }}
        >
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold bg-transparent border-0 p-0 hover:text-blue-600 transition-colors"
            onClick={() => setBulkOpen(!bulkOpen)}
          >
            <span
              className="inline-block transition-transform duration-200 text-xs"
              style={{ transform: bulkOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              ▶
            </span>
            <span className="text-[13px]">{t('subIssueDialog.bulkSectionTitle')}</span>
          </button>

          {bulkOpen && (
            <div className="mt-3">
              <textarea
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[13px] bg-white text-slate-800 resize-y"
                placeholder={t('subIssueDialog.bulkPlaceholder')}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          )}
        </div>

        <div
          ref={footerRef}
          data-testid="view-issue-dialog-footer"
          className="bg-white flex justify-start gap-[6px] flex-shrink-0 items-center border-t border-slate-200"
          style={{ padding: '8px 12px 12px 12px' }}
        >
          <button
            type="button"
            className="rounded-[6px] border bg-white text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              borderColor: '#cbd5e1',
              color: '#334155',
            }}
            onClick={onClose}
          >
            {t('common.close')}
          </button>
          <button
            type="button"
            className="rounded-[6px] border text-[13px] transition-colors cursor-pointer flex items-center justify-center antialiased"
            style={{
              fontFamily: EMBEDDED_DIALOG_BUTTON_FONT_FAMILY,
              height: `${COMPACT_ACTION_BUTTON_HEIGHT}px`,
              minWidth: `${COMPACT_ACTION_BUTTON_MIN_WIDTH}px`,
              borderColor: '#2563eb',
              backgroundColor: '#1b69e3',
              color: '#fff',
            }}
            disabled={isSubmitting || !iframeReady}
            onClick={handleSave}
          >
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}


export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  chartScale,

  onTaskDatesUpdated,
  onClose
}: TaskDetailsDialogProps) {
  const effectiveScale = chartScale ?? 1;
  const scaledLaneHeight = Math.round(PROCESS_FLOW_LANE_HEIGHT * effectiveScale);
  const scaledBarHeight = Math.round(PROCESS_FLOW_BAR_HEIGHT * effectiveScale);
  const scaledBarY = Math.round(PROCESS_FLOW_BAR_Y * effectiveScale);
  const scaledBarSpacingY = Math.round(PROCESS_FLOW_BAR_SPACING_Y * effectiveScale);
  const scaledPointDepth = Math.round(PROCESS_FLOW_POINT_DEPTH * effectiveScale);
  const scaledTriangleWidth = Math.round(PROCESS_FLOW_TRIANGLE_WIDTH * effectiveScale);
  const scaledDiamondWidth = Math.round(PROCESS_FLOW_DIAMOND_WIDTH * effectiveScale);
  const scaledProgressLabelY = Math.round(PROCESS_FLOW_PROGRESS_LABEL_Y * effectiveScale);

  const [issues, setIssues] = useState<TaskDetailIssue[]>([]);
  const [baselineById, setBaselineById] = useState<Record<number, TaskDetailIssue>>({});
  const [savingIssueIds, setSavingIssueIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [masters, setMasters] = useState<import('../../services/scheduleReportApi').TaskMasters | null>(null);
  const [createIssueContext, setCreateIssueContext] = useState<{
    issueId: number;
    inheritedFields: InheritedSubIssueFields;
  } | null>(null);
  const [editIssueContext, setEditIssueContext] = useState<{
    issueId: number;
    issueUrl: string;
  } | null>(null);
  const [viewIssueContext, setViewIssueContext] = useState<{
    issueId: number;
    issueUrl: string;
  } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<TreeNodeType | null>(null);
  const [drilldownPath, setDrilldownPath] = useState<DrilldownCrumb[]>([]);
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasAnyChangesRef = useRef(false);
  const [density, setDensity] = useState<TableDensity>(() => {
    const saved = localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    if (saved && (saved === 'compact' || saved === 'standard' || saved === 'relaxed')) {
      return saved as TableDensity;
    }
    return 'standard';
  });
  const [densityMenuOpen, setDensityMenuOpen] = useState(false);

  const handleDensityChange = (next: TableDensity) => {
    setDensity(next);
    localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, next);
    setDensityMenuOpen(false);
  };

  const [processDragSession, setProcessDragSession] = useState<ProcessDragSession | null>(null);
  const [suppressProcessClickIssueId, setSuppressProcessClickIssueId] = useState<number | null>(null);
  const processDragRef = useRef<ProcessDragSession | null>(null);
  const processFlowContainerRef = useRef<HTMLDivElement | null>(null);
  const processFlowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [processFlowContainerWidth, setProcessFlowContainerWidth] = useState(0);
  const detailsLayoutRef = useRef<HTMLDivElement | null>(null);
  const [topPaneHeight, setTopPaneHeight] = useState(DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX);
  const [verticalResizeSession, setVerticalResizeSession] = useState<DetailsVerticalResizeSession | null>(null);
  const verticalResizeRef = useRef<DetailsVerticalResizeSession | null>(null);
  const lastAutoFitKeyRef = useRef<string | null>(null);
  const manualResizeSuppressedKeyRef = useRef<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_COLUMN_WIDTHS;
      }
    }
    return DEFAULT_COLUMN_WIDTHS;
  });

  const handleColumnResize = useCallback((columnKey: string, deltaX: number) => {
    setColumnWidths((prev) => {
      const currentWidth = prev[columnKey] ?? DEFAULT_COLUMN_WIDTHS[columnKey] ?? 100;
      const nextWidth = Math.max(40, currentWidth + deltaX);
      const next = { ...prev, [columnKey]: nextWidth };
      localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const currentRoot = drilldownPath[drilldownPath.length - 1] || { issueId, title: issueTitle };
  const currentRootIssueId = currentRoot.issueId;
  const currentRootIssueTitle = currentRoot.title;

  const selectIssue = useCallback((issue: TaskDetailIssue | TreeNodeType | null) => {
    const nextIssue = issue
      ? { ...issue, children: 'children' in issue ? issue.children : [] }
      : null;
    setSelectedIssue(nextIssue);
  }, []);

  // Load master data when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchTaskMasters(projectIdentifier).then(setMasters).catch(() => { /* best-effort */ });
  }, [open, projectIdentifier]);

  useLayoutEffect(() => {
    if (!open || loading || issues.length === 0 || !processFlowContainerRef.current) return;

    const element = processFlowContainerRef.current;
    const updateWidth = () => {
      setProcessFlowContainerWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, [open, loading, issues.length]);

  const reloadTaskDetails = useCallback(async (
    targetIssueId: number,
    options: {
      expectedIssueId?: number;
      selectedIssueId?: number | null;
    } = {}
  ) => {
    setLoading(true);
    try {
      let latestRows: TaskDetailIssue[] = [];
      const maxAttempts = options.expectedIssueId ? 3 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        latestRows = await fetchTaskDetails(projectIdentifier, targetIssueId);
        const found = !options.expectedIssueId || latestRows.some((row) => row.issue_id === options.expectedIssueId);
        if (found) break;
        if (attempt < maxAttempts - 1) {
          await sleep(250);
        }
      }

      setIssues(latestRows);
      setBaselineById(latestRows.reduce<Record<number, TaskDetailIssue>>((acc, row) => {
        acc[row.issue_id] = row;
        return acc;
      }, {}));

      const rootRow = latestRows.find((row) => row.issue_id === targetIssueId);
      if (rootRow) {
        setDrilldownPath((prev) => {
          if (prev.length === 0) {
            return [{ issueId: targetIssueId, title: rootRow.subject }];
          }
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], issueId: targetIssueId, title: rootRow.subject };
          return next;
        });
      }

      const nextSelectedIssue = options.selectedIssueId
        ? latestRows.find((row) => row.issue_id === options.selectedIssueId) || null
        : null;
      selectIssue(nextSelectedIssue);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectIdentifier, selectIssue]);

  const handleClose = useCallback(() => {
    if (hasAnyChangesRef.current) {
      onTaskDatesUpdated?.();
      hasAnyChangesRef.current = false;
    }
    setCreateIssueContext(null);
    setEditIssueContext(null);
    setViewIssueContext(null);
    onClose();
  }, [onClose, onTaskDatesUpdated]);

  useEffect(() => {
    if (!open) return;
    hasAnyChangesRef.current = false;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    setDrilldownPath([{ issueId, title: issueTitle }]);
    setIssues([]);
    setBaselineById({});
    setSavingIssueIds({});
    setProcessDragSession(null);
    processDragRef.current = null;
    setTopPaneHeight(DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX);
    setVerticalResizeSession(null);
    verticalResizeRef.current = null;
    lastAutoFitKeyRef.current = null;
    manualResizeSuppressedKeyRef.current = null;
    setSuppressProcessClickIssueId(null);
    selectIssue(null);
    void reloadTaskDetails(issueId, { selectedIssueId: null }).catch(() => {
      // Errors are handled in reloadTaskDetails.
    });
  }, [open, issueId, issueTitle, reloadTaskDetails, selectIssue]);

  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  useEffect(() => {
    baselineByIdRef.current = baselineById;
  }, [baselineById]);

  useEffect(() => {
    savingIssueIdsRef.current = savingIssueIds;
  }, [savingIssueIds]);

  useEffect(() => {
    processDragRef.current = processDragSession;
  }, [processDragSession]);

  useEffect(() => {
    verticalResizeRef.current = verticalResizeSession;
  }, [verticalResizeSession]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
    saveTimersRef.current = {};
  }, []);

  const isRowDirty = (row: TaskDetailIssue) => {
    const baseline = baselineByIdRef.current[row.issue_id];
    if (!baseline) return false;
    return baseline.start_date !== row.start_date || baseline.due_date !== row.due_date;
  };

  const saveRow = async (row: TaskDetailIssue) => {
    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: row.start_date,
        due_date: row.due_date
      });
      // Preserve parent_id in the updated row
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      hasAnyChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  };

  const saveProcessFlowDates = useCallback(async (row: TaskDetailIssue, startDate: string, dueDate: string) => {
    if (saveTimersRef.current[row.issue_id]) {
      clearTimeout(saveTimersRef.current[row.issue_id]);
      delete saveTimersRef.current[row.issue_id];
    }

    setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: true }));
    setIssues((prev) => prev.map((item) => (
      item.issue_id === row.issue_id ? { ...item, start_date: startDate, due_date: dueDate } : item
    )));

    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: startDate,
        due_date: dueDate
      });
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      setSelectedIssue((prev) => (
        prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev
      ));
      hasAnyChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
    } finally {
      setSavingIssueIds((prev) => ({ ...prev, [row.issue_id]: false }));
    }
  }, [projectIdentifier, setSelectedIssue]);

  const handleDateChange = (row: TaskDetailIssue, key: 'start_date' | 'due_date', value: string) => {
    setIssues((prev) => {
      const next = prev.map((item) => (item.issue_id === row.issue_id ? { ...item, [key]: value || null } : item));
      const updatedRow = next.find((item) => item.issue_id === row.issue_id);
      if (!updatedRow) return next;

      if (saveTimersRef.current[row.issue_id]) {
        clearTimeout(saveTimersRef.current[row.issue_id]);
      }

      if (!isRowDirty(updatedRow)) {
        delete saveTimersRef.current[row.issue_id];
        return next;
      }

      saveTimersRef.current[row.issue_id] = setTimeout(() => {
        const latestRow = issuesRef.current.find((item) => item.issue_id === row.issue_id);
        delete saveTimersRef.current[row.issue_id];
        if (!latestRow || !isRowDirty(latestRow) || savingIssueIdsRef.current[row.issue_id]) return;
        void saveRow(latestRow);
      }, 500);

      return next;
    });
  };

  const handleFieldUpdate = useCallback(async (issueId: number, field: string, value: string | number | null) => {
    const payload: Record<string, unknown> = { [field]: value };
    try {
      const updated = await updateTaskFields(projectIdentifier, issueId, payload as import('../../services/scheduleReportApi').TaskUpdatePayload);
      setIssues(prev => prev.map(item => item.issue_id === updated.issue_id ? { ...item, ...updated } : item));
      setBaselineById(prev => ({ ...prev, [updated.issue_id]: { ...prev[updated.issue_id], ...updated } }));
      setSelectedIssue(prev => prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev);
      hasAnyChangesRef.current = true;

      if (field === 'done_ratio') {
        // 進捗更新時は親チケットにも影響があるため、全体を再読み込みする
        void reloadTaskDetails(currentRootIssueId, { selectedIssueId: selectedIssue?.issue_id ?? null });
      }
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      alert(message);

      const baseline = baselineByIdRef.current[issueId];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === issueId ? { ...item, ...baseline } : item)));
        setSelectedIssue((prev) => (prev?.issue_id === issueId ? { ...prev, ...baseline, children: prev.children } : prev));
      }

      throw error;
    }
  }, [projectIdentifier, issues, setSelectedIssue, reloadTaskDetails, currentRootIssueId]);

  const handleSaveDescription = async () => {
    if (!selectedIssue) return;
    try {
      await handleFieldUpdate(selectedIssue.issue_id, 'description', descriptionDraft);
      setEditingDescription(false);
    } catch (error) {
      // Error is handled in handleFieldUpdate
    }
  };

  const handleAddComment = async () => {
    if (!selectedIssue || !newCommentDraft.trim()) return;
    setIsSavingComment(true);
    try {
      await handleFieldUpdate(selectedIssue.issue_id, 'notes', newCommentDraft.trim());
      setNewCommentDraft('');
    } catch (error) {
      // Error is handled in handleFieldUpdate
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleUpdateComment = async (journalId: number, notes: string) => {
    if (!selectedIssue) return;
    try {
      await import('../../services/scheduleReportApi').then(m => m.updateTaskJournal(projectIdentifier, journalId, notes));
      void reloadTaskDetails(currentRootIssueId, { selectedIssueId: selectedIssue.issue_id });
      hasAnyChangesRef.current = true;
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      alert(message);
    }
  };

  const startVerticalResize = (e: React.PointerEvent) => {
    if (!detailsLayoutRef.current) return;
    const containerHeight = detailsLayoutRef.current.clientHeight;
    const pointerId = e.pointerId;
    const session: DetailsVerticalResizeSession = {
      pointerId,
      startClientY: e.clientY,
      startTopPaneHeight: topPaneHeight,
      containerHeight
    };
    setVerticalResizeSession(session);
    (e.target as HTMLElement).setPointerCapture(pointerId);
  };

  const startVerticalResizeWithMouse = (e: React.MouseEvent) => {
    if (e.button !== 0 || !detailsLayoutRef.current) return;
    const containerHeight = detailsLayoutRef.current.clientHeight;
    const session: DetailsVerticalResizeSession = {
      pointerId: -1, // Special value for mouse
      startClientY: e.clientY,
      startTopPaneHeight: topPaneHeight,
      containerHeight
    };
    setVerticalResizeSession(session);
  };

  useEffect(() => {
    if (!verticalResizeSession) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== verticalResizeSession.pointerId) return;
      const deltaY = e.clientY - verticalResizeSession.startClientY;
      const nextHeight = Math.max(
        100,
        Math.min(verticalResizeSession.containerHeight - 100, verticalResizeSession.startTopPaneHeight + deltaY)
      );
      setTopPaneHeight(nextHeight);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== verticalResizeSession.pointerId) return;
      setVerticalResizeSession(null);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (verticalResizeSession.pointerId !== -1) return;
      const deltaY = e.clientY - verticalResizeSession.startClientY;
      const nextHeight = Math.max(
        100,
        Math.min(verticalResizeSession.containerHeight - 100, verticalResizeSession.startTopPaneHeight + deltaY)
      );
      setTopPaneHeight(nextHeight);
    };

    const handleMouseUp = () => {
      if (verticalResizeSession.pointerId !== -1) return;
      setVerticalResizeSession(null);
    };

    if (verticalResizeSession.pointerId === -1) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [verticalResizeSession]);

  const updateVerticalResize = (clientY: number, pointerId?: number) => {
    if (!verticalResizeRef.current) return;
    if (pointerId !== undefined && pointerId !== verticalResizeRef.current.pointerId) return;
    const deltaY = clientY - verticalResizeRef.current.startClientY;
    const nextHeight = Math.max(
      100,
      Math.min(verticalResizeRef.current.containerHeight - 100, verticalResizeRef.current.startTopPaneHeight + deltaY)
    );
    setTopPaneHeight(nextHeight);
  };

  const stopVerticalResize = (pointerId?: number) => {
    if (!verticalResizeRef.current) return;
    if (pointerId !== undefined && pointerId !== verticalResizeRef.current.pointerId) return;
    setVerticalResizeSession(null);
  };

  const handleVerticalResizeKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowUp') {
      setTopPaneHeight((prev) => Math.max(100, prev - step));
    } else if (e.key === 'ArrowDown') {
      if (!detailsLayoutRef.current) return;
      const containerHeight = detailsLayoutRef.current.clientHeight;
      setTopPaneHeight((prev) => Math.min(containerHeight - 100, prev + step));
    }
  };

  const treeRoots = useMemo(() => {
    const map = new Map<number, TreeNodeType>();
    issues.forEach(issue => {
      map.set(issue.issue_id, { ...issue, children: [] });
    });

    const roots: TreeNodeType[] = [];
    issues.forEach(issue => {
      const node = map.get(issue.issue_id)!;
      if (issue.parent_id && map.has(issue.parent_id)) {
        map.get(issue.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [issues]);

  const selectedIssueId = selectedIssue?.issue_id ?? null;
  const handleTaskRowSelect = useCallback((issue: TreeNodeType) => {
    if (selectedIssue?.issue_id === issue.issue_id) {
      selectIssue(null);
      return;
    }

    selectIssue(issue);
  }, [selectIssue, selectedIssue]);

  const processFlowSteps = useMemo<ProcessFlowStep[]>(() => {
    const parentIssueIds = new Set(
      issues
        .map((issue) => issue.parent_id)
        .filter((parentId): parentId is number => Number.isInteger(parentId))
    );
    return issues
      .filter((issue) => Boolean(issue.start_date || issue.due_date))
      // Use the immediate children of the opened task as the top-level segments
      .filter((issue) => issue.parent_id === currentRootIssueId)
      .map((issue) => {
        const progress = Math.max(0, Math.min(100, Number(issue.done_ratio ?? 0)));
        const status: ProcessFlowStep['status'] = issue.status_is_closed || progress === 100
          ? 'COMPLETED'
          : progress > 0
            ? 'IN_PROGRESS'
            : 'PENDING';
        const startDate = issue.start_date ?? null;
        const dueDate = issue.due_date ?? null;
        const anchorDate = startDate ?? dueDate;
        if (!anchorDate) return null;
        const shapeKind: ProcessFlowStep['shapeKind'] = startDate && dueDate
          ? 'range'
          : startDate
            ? 'start-only'
            : 'due-only';
        return {
          id: issue.issue_id,
          title: issue.subject,
          startDate,
          dueDate,
          anchorDate,
          shapeKind,
          rangeLabel: startDate && dueDate ? `${startDate} - ${dueDate}` : anchorDate,
          status,
          progress: progress === 0 ? undefined : progress,
          hasChildren: parentIssueIds.has(issue.issue_id)
        };
      })
      .filter((step): step is ProcessFlowStep => step !== null)
      .sort((left, right) =>
        left.anchorDate.localeCompare(right.anchorDate) ||
        (left.dueDate ?? left.anchorDate).localeCompare(right.dueDate ?? right.anchorDate) ||
        left.id - right.id
      );
  }, [issues, currentRootIssueId]);

  const processFlowTimelineWidth = processFlowContainerWidth > 0
    ? Math.max(processFlowContainerWidth, PROCESS_FLOW_MIN_WIDTH)
    : Math.max(PROCESS_FLOW_MIN_WIDTH, processFlowSteps.length * 180);

  const processFlowAxis = useMemo(() => {
    if (processFlowSteps.length === 0) return null;

    return buildTimelineAxis({
      items: processFlowSteps.map((step) => ({
        start_date: step.startDate ?? step.anchorDate,
        end_date: step.dueDate ?? step.anchorDate
      })),
      containerWidth: processFlowTimelineWidth,
      defaultTimelineWidth: processFlowTimelineWidth,
      leftBufferDays: 7
    });
  }, [processFlowSteps, processFlowTimelineWidth]);

  useEffect(() => {
    if (!processDragSession || !processFlowAxis) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== processDragSession.pointerId) return;
      const session = processDragRef.current;
      if (!session) return;

      const deltaX = e.clientX - session.startClientX;
      if (Math.abs(deltaX) < 3 && !session.moved) return;

      const deltaDays = Math.round(deltaX / processFlowAxis.pixelsPerDay);
      const originalStart = parseISO(session.originalStartDate);
      const originalDue = parseISO(session.originalDueDate);

      let nextStartStr = session.originalStartDate;
      let nextDueStr = session.originalDueDate;

      if (session.mode === 'move') {
        nextStartStr = format(addDays(originalStart, deltaDays), 'yyyy-MM-dd');
        nextDueStr = format(addDays(originalDue, deltaDays), 'yyyy-MM-dd');
      } else if (session.mode === 'resize-left') {
        const nextStart = addDays(originalStart, deltaDays);
        if (nextStart > originalDue) return;
        nextStartStr = format(nextStart, 'yyyy-MM-dd');
      } else if (session.mode === 'resize-right') {
        const nextDue = addDays(originalDue, deltaDays);
        if (nextDue < originalStart) return;
        nextDueStr = format(nextDue, 'yyyy-MM-dd');
      }

      setProcessDragSession((prev) => (prev ? {
        ...prev,
        currentStartDate: nextStartStr,
        currentDueDate: nextDueStr,
        moved: true
      } : null));
    };

    const handlePointerUp = async (e: PointerEvent) => {
      if (e.pointerId !== processDragSession.pointerId) return;
      const session = processDragRef.current;
      if (!session) return;

      if (session.moved) {
        setSuppressProcessClickIssueId(session.issueId);
        const row = issuesRef.current.find((item) => item.issue_id === session.issueId);
        if (row) {
          await saveProcessFlowDates(row, session.currentStartDate, session.currentDueDate);
        }
      }
      setProcessDragSession(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [processDragSession, processFlowAxis, saveProcessFlowDates]);

  const processFlowPixelsPerDay = processFlowAxis?.pixelsPerDay ?? 1;

  const processFlowRenderSteps = useMemo<ProcessFlowRenderStep[]>(() => {
    if (!processFlowAxis) return [];

    const getX = createDateToX(processFlowAxis.minDate, processFlowAxis.pixelsPerDay);
    const getWidth = createRangeToWidth(processFlowAxis.pixelsPerDay);

    const rawSteps = processFlowSteps.map((step) => {
      const currentSession = step.shapeKind === 'range' && processDragSession?.issueId === step.id ? processDragSession : null;
      const startDate = currentSession?.currentStartDate ?? step.startDate;
      const dueDate = currentSession?.currentDueDate ?? step.dueDate;
      const anchorDate = startDate ?? dueDate;
      const anchorX = anchorDate ? getX(anchorDate) : 0;
      const visualWidth = step.shapeKind === 'range'
        ? getWidth(startDate, dueDate)
        : step.shapeKind === 'start-only'
          ? scaledTriangleWidth
          : scaledDiamondWidth;
      const hitWidth = step.shapeKind === 'range'
        ? visualWidth
        : Math.max(visualWidth, processFlowAxis.pixelsPerDay);
      const hitX = (step.shapeKind === 'range' || step.shapeKind === 'start-only')
        ? anchorX
        : anchorX - hitWidth / 2;
      const shapeX = (step.shapeKind === 'range' || step.shapeKind === 'start-only')
        ? anchorX
        : anchorX - visualWidth / 2;

      return {
        ...step,
        startDate,
        dueDate,
        anchorDate: anchorDate ?? step.anchorDate,
        rangeLabel: startDate && dueDate ? `${startDate} - ${dueDate}` : (anchorDate ?? step.anchorDate),
        anchorX,
        shapeX,
        visualWidth,
        hitX,
        hitWidth
      };
    });

    const positionedSteps = calculateStaggeredLanes(
      rawSteps,
      (step) => step.anchorDate,
      (step) => step.dueDate ?? step.anchorDate
    );

    return positionedSteps.map((step, index) => {
      const isFirst = index === 0;
      const hasLeftNotch = false;
      const previousStep = index > 0 ? positionedSteps[index - 1] : null;
      const joinsPrevious = Boolean(
        step.shapeKind === 'range' &&
        previousStep?.shapeKind === 'range' &&
        previousStep &&
        step.startDate &&
        previousStep.dueDate &&
        differenceInCalendarDays(parseISO(step.startDate), parseISO(previousStep.dueDate)) === 1 &&
        step.laneIndex === previousStep.laneIndex
      );
      return {
        ...step,
        isFirst,
        hasLeftNotch,
        joinsPrevious,
        x: step.shapeX,
        width: step.visualWidth,
        textX: step.shapeKind === 'due-only' ? step.anchorX : step.shapeX + step.visualWidth / 2
      };
    });
  }, [processFlowAxis, processFlowSteps, processDragSession]);

  const maxProcessFlowLane = useMemo(() => {
    return processFlowRenderSteps.length > 0 ? Math.max(...processFlowRenderSteps.map(s => s.laneIndex)) : 0;
  }, [processFlowRenderSteps]);

  const processFlowLaneHeight = Math.max(
    scaledLaneHeight,
    34 + (maxProcessFlowLane + 1) * scaledBarHeight + maxProcessFlowLane * scaledBarSpacingY + 30
  );
  const processFlowChartHeight = PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight;
  const processFlowBaseTopPadding = useMemo(() => {
    const totalBarsHeight = (maxProcessFlowLane + 1) * scaledBarHeight + maxProcessFlowLane * scaledBarSpacingY;
    return (processFlowLaneHeight - totalBarsHeight) / 2;
  }, [maxProcessFlowLane, processFlowLaneHeight]);

  useLayoutEffect(() => {
    if (!processFlowAxis || !processFlowCanvasRef.current) return;
    const context = prepareHiDPICanvas(
      processFlowCanvasRef.current,
      processFlowAxis.timelineWidth,
      processFlowChartHeight
    );
    if (!context) return;

    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, processFlowAxis.timelineWidth, PROCESS_FLOW_YEAR_ROW_HEIGHT);
    context.fillRect(0, PROCESS_FLOW_YEAR_ROW_HEIGHT, processFlowAxis.timelineWidth, PROCESS_FLOW_MONTH_ROW_HEIGHT);
    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.strokeRect(0, 0, processFlowAxis.timelineWidth, PROCESS_FLOW_YEAR_ROW_HEIGHT);
    context.strokeRect(0, PROCESS_FLOW_YEAR_ROW_HEIGHT, processFlowAxis.timelineWidth, PROCESS_FLOW_MONTH_ROW_HEIGHT);

    processFlowAxis.headerYears.forEach((year) => {
      context.strokeRect(year.x, 0, year.width, PROCESS_FLOW_YEAR_ROW_HEIGHT);
      drawStrokeText(context, {
        text: year.year,
        x: year.x + year.width / 2,
        y: PROCESS_FLOW_YEAR_ROW_HEIGHT / 2,
        fill: '#334155',
        stroke: '#f8fafc',
        strokeWidth: 0,
        font: '700 11px sans-serif'
      });
    });

    processFlowAxis.headerMonths.forEach((month) => {
      context.strokeRect(month.x, PROCESS_FLOW_YEAR_ROW_HEIGHT, month.width, PROCESS_FLOW_MONTH_ROW_HEIGHT);
      drawStrokeText(context, {
        text: month.label,
        x: month.x + month.width / 2,
        y: PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT / 2,
        fill: '#334155',
        stroke: '#f8fafc',
        strokeWidth: 0,
        font: '700 11px sans-serif'
      });
    });

    context.fillStyle = '#ffffff';
    context.fillRect(0, PROCESS_FLOW_HEADER_HEIGHT, processFlowAxis.timelineWidth, processFlowLaneHeight);
    processFlowAxis.headerMonths.forEach((month) => {
      context.save();
      context.strokeStyle = '#e2e8f0';
      context.setLineDash([4, 3]);
      context.beginPath();
      context.moveTo(month.x, PROCESS_FLOW_HEADER_HEIGHT);
      context.lineTo(month.x, PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight);
      context.stroke();
      context.restore();
    });
    context.beginPath();
    context.moveTo(0, PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight);
    context.lineTo(processFlowAxis.timelineWidth, PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight);
    context.strokeStyle = '#e2e8f0';
    context.stroke();

    processFlowRenderSteps.forEach((step) => {
      const style = processStatusStyles[step.status];
      const fill = getProgressFillColor(step.progress);
      const stepY = PROCESS_FLOW_HEADER_HEIGHT + processFlowBaseTopPadding + step.laneIndex * (scaledBarHeight + scaledBarSpacingY);
      const rangeStartLabelX = step.shapeX + PROCESS_FLOW_DATE_LABEL_INSET;
      const rangeEndLabelX = step.shapeX + step.visualWidth - PROCESS_FLOW_DATE_LABEL_INSET;

      if (step.shapeKind === 'due-only') {
        drawDiamond(context, {
          centerX: step.textX,
          y: stepY,
          width: step.visualWidth,
          height: scaledBarHeight,
          fill,
          trackFill: getProgressTrackColor(),
          stroke: style.stroke,
          progress: step.progress
        });
      } else if (step.shapeKind === 'start-only') {
        drawTriangle(context, {
          x: step.shapeX,
          y: stepY,
          width: step.visualWidth,
          height: scaledBarHeight,
          fill,
          trackFill: getProgressTrackColor(),
          stroke: style.stroke,
          progress: step.progress
        });
      } else {
        drawChevron(context, {
          x: step.x,
          y: stepY,
          width: step.width,
          height: scaledBarHeight,
          pointDepth: scaledPointDepth,
          hasLeftNotch: step.hasLeftNotch,
          fill,
          trackFill: getProgressTrackColor(),
          stroke: style.stroke,
          progress: step.progress
        });
      }

      if (selectedIssueId === step.id) {
        drawSelectedProcessOutline(context, {
          shapeKind: step.shapeKind,
          stepY,
          x: step.x,
          width: step.width,
          hasLeftNotch: step.hasLeftNotch,
          shapeX: step.shapeX,
          visualWidth: step.visualWidth,
          textX: step.textX,
          barHeight: scaledBarHeight,
          pointDepth: scaledPointDepth
        });
      }

      if (step.shapeKind !== 'range') {
        drawStrokeText(context, {
          text: extractMD(step.anchorDate),
          x: step.textX,
          y: stepY - 6,
          fill: style.dateText,
          stroke: '#ffffff',
          strokeWidth: 2,
          font: '700 10px sans-serif'
        });
      } else {
        if (step.startDate) {
          drawStrokeText(context, {
            text: extractMD(step.startDate),
            x: rangeStartLabelX,
            y: stepY - 6,
            fill: style.dateText,
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'start'
          });
        }
        if (step.dueDate) {
          drawStrokeText(context, {
            text: extractMD(step.dueDate),
            x: rangeEndLabelX,
            y: stepY - 6,
            fill: style.dateText,
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'end'
          });
        }
      }

      const labelFont = '700 11px sans-serif';
      const maxLabelWidth = step.visualWidth - 12; // 6px padding on each side
      const displayTitle = truncateCanvasText(context, step.title, maxLabelWidth, labelFont);

      if (displayTitle) {
        drawStrokeText(context, {
          text: displayTitle,
          x: step.textX,
          y: stepY + scaledBarHeight / 2,
          fill: '#ffffff',
          stroke: step.status === 'IN_PROGRESS' ? '#1e293b' : '#334155',
          strokeWidth: 2,
          font: labelFont
        });
      }
    });
  }, [processFlowAxis, processFlowLaneHeight, processFlowRenderSteps, processFlowChartHeight, processStatusStyles, selectedIssueId, processFlowBaseTopPadding]);

  const dialogHeaderTitle = currentRootIssueTitle ? `${currentRootIssueTitle} #${currentRootIssueId}` : `#${currentRootIssueId}`;
  const currentAutoFitKey = open && !loading && issues.length > 0 && processFlowRenderSteps.length > 0
    ? `${currentRootIssueId}:${processFlowChartHeight}`
    : null;
  const clampTopPaneHeight = useCallback((nextHeight: number, containerHeight: number) => {
    const safeContainerHeight = Number.isFinite(containerHeight) && containerHeight > 0
      ? containerHeight
      : DETAILS_LAYOUT_FALLBACK_HEIGHT_PX;
    const maxHeight = Math.max(
      DETAILS_TOP_PANE_MIN_HEIGHT_PX,
      safeContainerHeight - DETAILS_BOTTOM_PANE_MIN_HEIGHT_PX
    );
    return Math.min(Math.max(nextHeight, DETAILS_TOP_PANE_MIN_HEIGHT_PX), maxHeight);
  }, []);

  useLayoutEffect(() => {
    if (!currentAutoFitKey || !detailsLayoutRef.current) return;
    if (lastAutoFitKeyRef.current === currentAutoFitKey) return;
    if (manualResizeSuppressedKeyRef.current === currentAutoFitKey) return;

    const containerHeight = detailsLayoutRef.current.getBoundingClientRect().height
      || detailsLayoutRef.current.clientHeight;
    const nextHeight = clampTopPaneHeight(processFlowChartHeight, containerHeight);

    lastAutoFitKeyRef.current = currentAutoFitKey;
    setTopPaneHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [clampTopPaneHeight, currentAutoFitKey, processFlowChartHeight]);
  const startProcessFlowDrag = (
    event: React.PointerEvent<SVGRectElement>,
    step: ProcessFlowStep,
    mode: ProcessDragMode
  ) => {
    if (savingIssueIdsRef.current[step.id]) return;
    event.preventDefault();
    event.stopPropagation();

    const session: ProcessDragSession = {
      issueId: step.id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      originalStartDate: step.startDate!,
      originalDueDate: step.dueDate!,
      currentStartDate: step.startDate!,
      currentDueDate: step.dueDate!,
      moved: false
    };

    processDragRef.current = session;
    setProcessDragSession(session);
  };

  const handleProcessStepClick = useCallback((step: ProcessFlowStep) => {
    if (suppressProcessClickIssueId === step.id) {
      setSuppressProcessClickIssueId(null);
      return;
    }

    const issue = issuesRef.current.find((item) => item.issue_id === step.id) || null;
    if (!issue) return;

    selectIssue(issue);
  }, [selectIssue, suppressProcessClickIssueId]);

  const handleProcessStepDoubleClick = useCallback((step: ProcessFlowStep) => {
    if (!step.hasChildren) return;

    const issue = issuesRef.current.find((item) => item.issue_id === step.id) || null;
    if (!issue) return;

    setDrilldownPath((prev) => [...prev, { issueId: step.id, title: issue.subject }]);
    void reloadTaskDetails(step.id, { selectedIssueId: null });
  }, [reloadTaskDetails]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    setDrilldownPath((prev) => {
      const next = prev.slice(0, index + 1);
      const target = next[next.length - 1];
      if (target) {
        void reloadTaskDetails(target.issueId, { selectedIssueId: target.issueId });
      }
      return next;
    });
  }, [reloadTaskDetails]);

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[6px] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-[96vw] h-[92vh] rounded-[24px] shadow-brand-glow border border-gray-100 flex flex-col overflow-hidden transition-all transform animate-in slide-in-from-bottom-8 duration-700 ease-out font-sans"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between gap-3 bg-white relative z-40 border-b border-gray-200 flex-shrink-0 min-h-12 box-border">
          <div className="flex flex-row items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              {drilldownPath.length > 1 && (
                <nav
                  className="mb-1.5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[12px] font-medium font-sans text-[#8e8e93]"

                  aria-label={t('timeline.breadcrumbAria', { defaultValue: 'Issue hierarchy' })}
                  data-testid="task-details-breadcrumb"
                >
                  {drilldownPath.map((crumb, index) => {
                    const crumbLabel = crumb.title ? `${crumb.title} #${crumb.issueId}` : `#${crumb.issueId}`;
                    const isCurrent = index === drilldownPath.length - 1;
                    return (
                      <React.Fragment key={`${crumb.issueId}-${index}`}>
                        {index > 0 && <span className="text-slate-300">/</span>}
                        {isCurrent ? (
                          <span className="truncate text-slate-500">{crumbLabel}</span>
                        ) : (
                          <button
                            type="button"
                            className="truncate cursor-pointer text-slate-500 hover:text-slate-900"
                            onClick={() => handleBreadcrumbClick(index)}
                          >
                            {crumbLabel}
                          </button>
                        )}
                      </React.Fragment>
                    );
                  })}
                </nav>
              )}
              <h3 className="text-[28px] font-display font-semibold text-[var(--color-text-00)] flex items-center gap-3 min-w-0" data-testid="task-details-title">
                <span className="truncate">












                  {dialogHeaderTitle}
                </span>
              </h3>
            </div>
            <div className="relative">
              <button
                onClick={() => setDensityMenuOpen(!densityMenuOpen)}
                title={t('timeline.tableDensity', { defaultValue: 'Table Density' })}
                className={`${REDMINE_DIALOG_ICON_ACTION_CLASS} ml-1`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </button>
              {densityMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setDensityMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-brand-glow border border-gray-100 z-[70] overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {(['compact', 'standard', 'relaxed'] as TableDensity[]).map((d) => (
                      <button
                        key={d}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-slate-50 flex items-center gap-3 ${density === d ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}`}
                        onClick={() => handleDensityChange(d)}
                      >
                        <div className="flex-shrink-0 w-5 flex justify-center text-slate-400">
                          {d === 'compact' && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="4" y="8" width="16" height="2" rx="0.5" />
                              <rect x="4" y="11" width="16" height="2" rx="0.5" />
                              <rect x="4" y="14" width="16" height="2" rx="0.5" />
                            </svg>
                          )}
                          {d === 'standard' && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="4" y="7" width="16" height="2" rx="0.5" />
                              <rect x="4" y="11" width="16" height="2" rx="0.5" />
                              <rect x="4" y="15" width="16" height="2" rx="0.5" />
                            </svg>
                          )}
                          {d === 'relaxed' && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="4" y="5" width="16" height="2" rx="0.5" />
                              <rect x="4" y="11" width="16" height="2" rx="0.5" />
                              <rect x="4" y="17" width="16" height="2" rx="0.5" />
                            </svg>
                          )}
                        </div>
                        <span className="flex-1">
                          {t(`timeline.density${d.charAt(0).toUpperCase() + d.slice(1)}`, { defaultValue: d.charAt(0).toUpperCase() + d.slice(1) })}
                        </span>
                        {density === d && (
                          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => void reloadTaskDetails(currentRootIssueId, { selectedIssueId: selectedIssue?.issue_id ?? null })}
              title={t('timeline.reloadTasks')}
              className={`${REDMINE_DIALOG_ICON_ACTION_CLASS} ml-1`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 shrink min-w-0">
            <div className="text-[12px] text-slate-700 font-semibold whitespace-nowrap">
              {t('timeline.totalTasks', { count: issues.length })}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm"></div>
              {t('timeline.legendWip')}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap">
              <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm"></div>
              {t('timeline.legendDone')}
            </div>
          </div>

          <button
            aria-label={t('timeline.closeDialogAria')}
            className={REDMINE_DIALOG_ICON_ACTION_CLASS}
            onClick={handleClose}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Split Panel Body */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#f3f3f3] relative" ref={detailsLayoutRef}>
          {loading && (
            <div className="flex justify-center items-center py-12 absolute inset-0 bg-white/80 z-30">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!loading && issues.length === 0 && (
            <div className="text-center py-12 m-6 bg-white border border-slate-300 flex-shrink-0 w-full">
              <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
            </div>

          )}

          {!loading && issues.length > 0 && (
            <>
              <div
                className="border-b border-slate-200 bg-white relative z-10 shrink-0 overflow-hidden"
                data-testid="task-details-top-pane"
                style={{ height: `${topPaneHeight}px` }}
              >
                <div className="h-full overflow-auto" onClick={() => selectIssue(null)}>
                  <div className="overflow-x-auto" data-testid="task-details-process-flow" ref={processFlowContainerRef}>
                  {processFlowAxis && processFlowRenderSteps.length > 0 ? (
                    <div
                      className="relative"
                      style={{ width: processFlowAxis.timelineWidth, height: processFlowChartHeight }}
                    >
                    <canvas
                      ref={processFlowCanvasRef}
                      data-testid="task-details-process-flow-canvas"
                      width={processFlowAxis.timelineWidth}
                      height={processFlowChartHeight}
                      className="absolute inset-0 block"
                      style={{ width: `${processFlowAxis.timelineWidth}px`, height: `${processFlowChartHeight}px`, pointerEvents: 'none' }}
                      aria-hidden="true"
                    />
                    <svg
                      width={processFlowAxis.timelineWidth}
                      height={processFlowChartHeight}
                    >
                      {processFlowRenderSteps.map((step) => {
                        const stepY = PROCESS_FLOW_HEADER_HEIGHT + processFlowBaseTopPadding + step.laneIndex * (scaledBarHeight + scaledBarSpacingY);
                        const isInteractive = !savingIssueIds[step.id];
                        const isRangeStep = step.shapeKind === 'range';
                        const isSelected = selectedIssueId === step.id;

                          return (
                            <g
                              key={step.id}
                              data-testid="task-details-process-step"
                              data-selected={isSelected ? 'true' : 'false'}
                              opacity={savingIssueIds[step.id] ? 0.6 : 1}
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <rect
                                x={step.hitX}
                                y={stepY}
                                width={step.hitWidth}
                                height={scaledBarHeight}
                                fill="transparent"
                                style={{ cursor: isInteractive && isRangeStep ? 'move' : 'pointer' }}
                                onPointerDown={isRangeStep ? (event) => startProcessFlowDrag(event, step, 'move') : undefined}
                                onClick={() => handleProcessStepClick(step)}
                                onDoubleClick={() => handleProcessStepDoubleClick(step)}
                                data-selected={isSelected ? 'true' : 'false'}
                                data-testid={`task-details-process-step-hit-${step.id}`}
                              >
                                <title>{step.title}</title>
                              </rect>
                              {isRangeStep && (
                                <>
                                  <rect
                                    x={step.hitX}
                                    y={stepY}
                                    width={10}
                                    height={scaledBarHeight}
                                    fill="transparent"
                                    style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                    onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-left')}
                                    data-testid={`task-details-process-step-left-${step.id}`}
                                  />
                                  <rect
                                    x={Math.max(step.hitX + step.hitWidth - 10, step.hitX)}
                                    y={stepY}
                                    width={10}
                                    height={scaledBarHeight}
                                    fill="transparent"
                                    style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                    onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-right')}
                                    data-testid={`task-details-process-step-right-${step.id}`}
                                  />
                                </>
                              )}
                              </g>
                            );
                      })}
                    </svg>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{t('timeline.detailsNoRows')}</p>
                  )}
                  </div>
                </div>
              </div>

              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={t('timeline.resizeDetailAreasAria')}
                tabIndex={0}
                data-testid="task-details-horizontal-resizer"
                data-resizing={verticalResizeSession ? 'true' : 'false'}
                className={`relative z-20 shrink-0 cursor-ns-resize bg-slate-300 transition-colors ${verticalResizeSession ? 'h-2 bg-slate-400' : 'h-1.5 hover:bg-slate-400'}`}
                onPointerDown={startVerticalResize}
                onMouseDown={startVerticalResizeWithMouse}
                onPointerMove={(event) => updateVerticalResize(event.clientY, event.pointerId)}
                onPointerUp={(event) => stopVerticalResize(event.pointerId)}
                onMouseMove={(event) => updateVerticalResize(event.clientY)}
                onMouseUp={() => stopVerticalResize()}
                onKeyDown={handleVerticalResizeKeyDown}
              >
                <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                  <span className="h-1 w-14 rounded-full bg-slate-500/70" />
                </div>
              </div>

              {/* Left Panel - Task List */}
              <div className="flex-1 flex min-h-0 relative bg-white" data-testid="task-details-bottom-pane">
                <div className="flex flex-col min-h-0 bg-white w-full transition-all overflow-hidden">
                  {/* Column Headers */}
                  <div className="overflow-auto flex-1 bg-white">
                      <div className={`flex items-center py-2 px-6 bg-gray-50/80 z-20 border-b border-gray-100/50 text-slate-600 flex-shrink-0 ${DENSITY_CONFIG[density].headerHeight} box-border sticky top-0 tracking-wide font-semibold ${DENSITY_CONFIG[density].badgeSize}`}>
                      <div className="shrink-0 flex items-center relative group border-r border-slate-200/60 h-full overflow-hidden" style={{ width: `${columnWidths.task}px`, minWidth: `${columnWidths.task}px` }}>
                        <div className="w-5 mr-1" /> {/* Spacer for expand button */}
                        {t('timeline.task', { defaultValue: 'Task' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('task', deltaX)} />
                      </div>
                      <div className="shrink-0 text-center px-2 relative group border-r border-slate-200/60 h-full flex items-center justify-center underline decoration-slate-300 decoration-dotted underline-offset-4 overflow-hidden" style={{ width: `${columnWidths.comments}px`, minWidth: `${columnWidths.comments}px` }}>{t('timeline.commentsCol', { defaultValue: 'Comments' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('comments', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.tracker}px`, minWidth: `${columnWidths.tracker}px` }}>{t('timeline.trackerCol', { defaultValue: 'Tracker' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('tracker', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.priority}px`, minWidth: `${columnWidths.priority}px` }}>{t('timeline.priorityCol', { defaultValue: 'Priority' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('priority', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}>{t('timeline.statusCol', { defaultValue: 'Status' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('status', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.progress}px`, minWidth: `${columnWidths.progress}px` }}>{t('timeline.progressCol', { defaultValue: 'Progress' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('progress', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.startDate}px`, minWidth: `${columnWidths.startDate}px` }}>{t('timeline.startDateCol', { defaultValue: 'Start Date' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('startDate', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group border-r border-slate-200/60 h-full flex items-center overflow-hidden" style={{ width: `${columnWidths.dueDate}px`, minWidth: `${columnWidths.dueDate}px` }}>{t('timeline.dueDateCol', { defaultValue: 'Due Date' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('dueDate', deltaX)} /></div>
                      <div className="shrink-0 text-left px-2 relative group flex items-center h-full overflow-hidden" style={{ width: `${columnWidths.assignee}px`, minWidth: `${columnWidths.assignee}px` }}>{t('timeline.assigneeCol', { defaultValue: 'Assignee' })}<ColumnResizer onResize={(deltaX) => handleColumnResize('assignee', deltaX)} /></div>
                    </div>
                    {/* Task Tree */}
                    {treeRoots.map((rootNode) => (
                      <IssueTreeNode
                        key={rootNode.issue_id}
                        node={rootNode}
                        depth={0}
                        activeLines={[]}
                        isLast={true}
                        rootIssueId={issueId}
                        savingIssueIds={savingIssueIds}
                        handleDateChange={handleDateChange}
                        onAddSubIssue={(parentIssue) => setCreateIssueContext({
                          issueId: parentIssue.issue_id,
                          inheritedFields: buildInheritedSubIssueFields({
                            trackerId: parentIssue.tracker_id,
                            priorityId: parentIssue.priority_id,
                            assignedToId: parentIssue.assignee_id,
                            startDate: parentIssue.start_date,
                            dueDate: parentIssue.due_date
                          })
                        })}
                        onEditIssue={(issue) => setEditIssueContext({
                          issueId: issue.issue_id,
                          issueUrl: issue.issue_url
                        })}
                        onViewIssue={(issue) => setViewIssueContext({
                          issueId: issue.issue_id,
                          issueUrl: issue.issue_url
                        })}
                        onSelectIssue={handleTaskRowSelect}
                        selectedIssueId={selectedIssue?.issue_id}
                        masters={masters}
                        onFieldUpdate={handleFieldUpdate}
                        columnWidths={columnWidths}
                        density={density}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
      {
        createIssueContext !== null && (
          <SubIssueCreationDialog
            projectIdentifier={projectIdentifier}
            parentIssueId={createIssueContext.issueId}
            inheritedFields={createIssueContext.inheritedFields}
            onCreated={(createdIssueId) => {
              hasAnyChangesRef.current = true;
              void reloadTaskDetails(currentRootIssueId, {
                expectedIssueId: createdIssueId,
                selectedIssueId: createdIssueId ?? currentRootIssueId
              });
            }}
            onClose={() => setCreateIssueContext(null)}
          />
        )
      }
      {
        editIssueContext !== null && (
          <IssueEditDialog
            projectIdentifier={projectIdentifier}
            issueId={editIssueContext.issueId}
            issueUrl={editIssueContext.issueUrl}
            onSaved={(updatedIssueId) => {
              hasAnyChangesRef.current = true;
              void reloadTaskDetails(currentRootIssueId, {
                expectedIssueId: updatedIssueId ?? editIssueContext.issueId,
                selectedIssueId: updatedIssueId ?? editIssueContext.issueId
              });
            }}
            onClose={() => setEditIssueContext(null)}
          />
        )
      }
      {
        viewIssueContext !== null && (
          <IssueViewDialog
            projectIdentifier={projectIdentifier}
            issueId={viewIssueContext.issueId}
            issueUrl={viewIssueContext.issueUrl}
            inheritedFields={(() => {
              const issue = issues.find((i) => i.issue_id === viewIssueContext.issueId);
              return issue ? {
                tracker_id: issue.tracker_id ?? undefined,
                priority_id: issue.priority_id ?? undefined,
                assigned_to_id: issue.assignee_id ?? undefined,
                start_date: issue.start_date ?? undefined,
                due_date: issue.due_date ?? undefined
              } : {};
            })()}
            onSaved={(updatedIssueId) => {
              hasAnyChangesRef.current = true;
              void reloadTaskDetails(currentRootIssueId, {
                expectedIssueId: updatedIssueId ?? viewIssueContext.issueId,
                selectedIssueId: updatedIssueId ?? viewIssueContext.issueId
              });
            }}
            onClose={() => setViewIssueContext(null)}
          />
        )
      }

    </div >
  );
}
