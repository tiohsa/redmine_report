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
  drawDiamond,
  drawTriangle,
  drawStrokeText,
  prepareHiDPICanvas
} from './canvasTimelineRenderer';

type TaskDetailsDialogProps = {
  open: boolean;
  projectIdentifier: string;
  issueId: number;
  issueTitle?: string;
  projectName?: string;
  versionName?: string;
  onTaskDatesUpdated?: () => void;
  onClose: () => void;
};

type TreeNodeType = TaskDetailIssue & { children: TreeNodeType[] };

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
  onSelectIssue?: (node: TreeNodeType) => void;
  selectedIssueId?: number | null;
  masters: TaskMasters | null;
  onFieldUpdate: (issueId: number, field: string, value: string | number | null) => Promise<void>;
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

const processStatusStyles: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', { fill: string; text: string; stroke: string; textStroke?: string; textStrokeWidth?: string }> = {
  COMPLETED: { fill: '#1e3a8a', text: '#ffffff', stroke: '#1e3a8a', textStroke: 'transparent', textStrokeWidth: '0px' },
  IN_PROGRESS: { fill: '#2563eb', text: '#1e3a8a', stroke: '#2563eb', textStroke: '#ffffff', textStrokeWidth: '3px' },
  PENDING: { fill: 'url(#stripePattern)', text: '#475569', stroke: '#94a3b8', textStroke: '#ffffff', textStrokeWidth: '3px' }
};

const PROCESS_FLOW_MIN_WIDTH = 640;
const PROCESS_FLOW_YEAR_ROW_HEIGHT = 24;
const PROCESS_FLOW_MONTH_ROW_HEIGHT = 24;
const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
const PROCESS_FLOW_LANE_HEIGHT = 100;
const PROCESS_FLOW_BAR_HEIGHT = 36;
const PROCESS_FLOW_BAR_Y = 22;
const PROCESS_FLOW_BAR_SPACING_Y = 17;
const PROCESS_FLOW_POINT_DEPTH = 18;
const PROCESS_FLOW_DIAMOND_WIDTH = PROCESS_FLOW_BAR_HEIGHT;
const PROCESS_FLOW_TRIANGLE_WIDTH = (PROCESS_FLOW_BAR_HEIGHT * Math.sqrt(3)) / 2;
const PROCESS_FLOW_RANGE_LABEL_Y = PROCESS_FLOW_BAR_Y + PROCESS_FLOW_BAR_HEIGHT + 16;
const PROCESS_FLOW_SVG_HEIGHT = PROCESS_FLOW_HEADER_HEIGHT + PROCESS_FLOW_LANE_HEIGHT;
const PROCESS_FLOW_DRAG_THRESHOLD_PX = 4;
const DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX = 320;
const DETAILS_TOP_PANE_MIN_HEIGHT_PX = 180;
const DETAILS_BOTTOM_PANE_MIN_HEIGHT_PX = 240;
const DETAILS_LAYOUT_FALLBACK_HEIGHT_PX = 760;

const EMBEDDED_DIALOG_BUTTON_FONT_FAMILY = "'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
const TASK_ROW_BASE_CLASS = 'flex items-center min-h-[48px] transition-colors relative group px-4 border-b border-slate-200/80';
const TASK_CELL_LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const TASK_BADGE_BASE_CLASS = 'inline-flex max-w-full items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold truncate shadow-sm';
const REDMINE_DIALOG_ACTION_CLASS = 'inline-flex items-center justify-center h-7 min-w-7 px-2 border border-slate-300 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer';
const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-7 min-w-7 w-7 border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer';
const REDMINE_DIALOG_PRIMARY_ACTION_CLASS = 'inline-flex items-center justify-center h-7 min-w-[72px] px-3 border border-slate-400 bg-slate-100 text-[12px] font-semibold text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const REDMINE_DIALOG_SECTION_TITLE_CLASS = 'text-[11px] font-bold uppercase tracking-wide text-slate-500';
const REDMINE_DIALOG_TEXTAREA_CLASS = 'w-full min-h-[88px] resize-y border border-slate-300 bg-white px-3 py-2 text-[13px] leading-5 text-slate-700 focus:outline-none focus:ring-0 focus:border-slate-500';
const REDMINE_DIALOG_SECTION_CLASS = 'border-b border-slate-200 px-4 py-4';
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

const ProcessChevron = ({
  x,
  y,
  width,
  height,
  pointDepth,
  hasLeftNotch,
  fill,
  stroke,
  progress,
  id
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  hasLeftNotch: boolean;
  fill: string;
  stroke: string;
  progress: number;
  id: number;
}) => {
  const leftShape = !hasLeftNotch
    ? `M ${x} ${y} L ${x} ${y + height}`
    : `M ${x} ${y} L ${x + pointDepth} ${y + height / 2} L ${x} ${y + height}`;
  const rightBaseX = x + Math.max(width - pointDepth, 0);
  const rightTipX = x + width;
  const rightShape = `L ${rightBaseX} ${y + height} L ${rightTipX} ${y + height / 2} L ${rightBaseX} ${y}`;
  const pathData = `${leftShape} ${rightShape} Z`;
  const separatorColor = fill === 'url(#stripePattern)' ? 'transparent' : 'white';

  if (progress > 0 && progress < 100) {
    return (
      <g>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${progress}%`} stopColor={fill} />
            <stop offset={`${progress}%`} stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <path d={pathData} fill={`url(#grad-${id})`} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        {hasLeftNotch && <path d={leftShape} stroke="white" strokeWidth="2" fill="none" />}
      </g>
    );
  }

  return (
    <g>
      <path d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {hasLeftNotch && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
    </g>
  );
};

const ProcessDiamond = ({
  centerX,
  y,
  width,
  height,
  fill,
  stroke,
  id
}: {
  centerX: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  id: number;
}) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const pathData = [
    `M ${centerX} ${y}`,
    `L ${centerX + halfWidth} ${y + halfHeight}`,
    `L ${centerX} ${y + height}`,
    `L ${centerX - halfWidth} ${y + halfHeight}`,
    'Z'
  ].join(' ');

  return <path data-testid={`task-details-process-step-diamond-${id}`} d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />;
};

const ProcessTriangle = ({
  x,
  y,
  width,
  height,
  fill,
  stroke,
  id
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  id: number;
}) => {
  const pathData = [
    `M ${x} ${y}`,
    `L ${x + width} ${y + height / 2}`,
    `L ${x} ${y + height}`,
    'Z'
  ].join(' ');

  return <path data-testid={`task-details-process-step-triangle-${id}`} d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />;
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
    const halfHeight = PROCESS_FLOW_BAR_HEIGHT / 2;
    context.beginPath();
    context.moveTo(step.textX, step.stepY - 3);
    context.lineTo(step.textX + halfWidth + 3, step.stepY + halfHeight);
    context.lineTo(step.textX, step.stepY + PROCESS_FLOW_BAR_HEIGHT + 3);
    context.lineTo(step.textX - halfWidth - 3, step.stepY + halfHeight);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  if (step.shapeKind === 'start-only') {
    context.beginPath();
    context.moveTo(step.shapeX - 3, step.stepY - 3);
    context.lineTo(step.shapeX + step.visualWidth + 4, step.stepY + PROCESS_FLOW_BAR_HEIGHT / 2);
    context.lineTo(step.shapeX - 3, step.stepY + PROCESS_FLOW_BAR_HEIGHT + 3);
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  const leftEdgeX = step.x - 3;
  const topY = step.stepY - 3;
  const bottomY = step.stepY + PROCESS_FLOW_BAR_HEIGHT + 3;
  const rightBaseX = step.x + step.width - PROCESS_FLOW_POINT_DEPTH;
  const rightTipX = step.x + step.width + 3;

  context.beginPath();
  if (step.hasLeftNotch) {
    context.moveTo(leftEdgeX, topY);
    context.lineTo(step.x + PROCESS_FLOW_POINT_DEPTH, step.stepY + PROCESS_FLOW_BAR_HEIGHT / 2);
    context.lineTo(leftEdgeX, bottomY);
  } else {
    context.moveTo(leftEdgeX, topY);
    context.lineTo(leftEdgeX, bottomY);
  }
  context.lineTo(rightBaseX + 3, bottomY);
  context.lineTo(rightTipX, step.stepY + PROCESS_FLOW_BAR_HEIGHT / 2);
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
  onSelectIssue,
  selectedIssueId,
  masters,
  onFieldUpdate
}: IssueTreeNodeProps) => {
  const progressRatio = Math.max(0, Math.min(100, Number(node.done_ratio ?? 0)));
  const isDone = progressRatio === 100;
  const isSelected = selectedIssueId === node.issue_id;
  const [collapsed, setCollapsed] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingDateRange, setEditingDateRange] = useState<EditingDateRange | null>(null);
  const [isSavingField, setIsSavingField] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dateRangeRef = useRef<HTMLDivElement | null>(null);
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
  const statusBg = isClosed ? 'bg-emerald-500' : isInProgress ? 'bg-blue-500' : 'bg-slate-300';
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
        className={`${TASK_ROW_BASE_CLASS} ${isSelected ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-200/70' : 'bg-white hover:bg-slate-50/90'}`}
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
          className="w-[280px] min-w-[280px] shrink-0 flex items-center"
          style={{ paddingLeft: `${depth * 20}px` }}
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
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
              className="flex-shrink-0 text-slate-400 text-xs font-semibold mr-1.5 cursor-pointer hover:text-blue-500"
              onClick={(e) => { e.stopPropagation(); onSelectIssue?.(node); }}
            >#{node.issue_id}</span>
            {isEditing('subject') ? (
              <input
                ref={inputRef}
                type="text"
                className="flex-1 text-[13px] h-8 px-2 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-800 min-w-0 shadow-sm"
                value={editingCell!.value}
                onChange={(e) => setEditingCell({ field: 'subject', value: e.target.value })}
                onBlur={() => { void commitEdit('subject', editingCell!.value); }}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                data-testid="task-subject"
                className={`text-[14px] leading-5 ${depth === 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'} truncate hover:text-blue-700 block cursor-pointer`}
                onClick={(e) => { e.stopPropagation(); onSelectIssue?.(node); }}
                onDoubleClick={(e) => startEdit('subject', node.subject, e)}
                title={node.subject}
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
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
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
        <div className="w-[56px] min-w-[56px] shrink-0 flex items-center justify-center px-2">
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
          className={`w-[90px] min-w-[90px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('tracker_id', String(node.tracker_id || ''), e)}
        >
          {isEditing('tracker_id') && masters ? (
            <select
              className="w-full text-[11px] h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm"
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
              className={`${TASK_BADGE_BASE_CLASS} ${trackerBadgeClass} group/cell:hover:ring-1 group/cell:hover:ring-blue-300`}
              title={node.tracker_name || ''}
            >
              {node.tracker_name || '-'}
            </span>
          )}
        </div>

        {/* PRIORITY Column */}
        <div
          className={`w-[90px] min-w-[90px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('priority_id', String(node.priority_id || ''), e)}
        >
          {isEditing('priority_id') && masters ? (
            <select
              className="w-full text-[11px] h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm"
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
              className={`${TASK_BADGE_BASE_CLASS} ${priorityBadgeClass}`}
              title={node.priority_name || ''}
            >
              {node.priority_name || '-'}
            </span>
          )}
        </div>

        {/* STATUS Column */}
        <div
          className={`w-[80px] min-w-[80px] shrink-0 flex items-center justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('status_id', String(node.status_id || ''), e)}
        >
          {isEditing('status_id') && masters ? (
            <select
              className="w-full text-[11px] h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm"
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
            <span className={`inline-flex items-center justify-center min-w-[56px] text-[11px] font-bold px-2.5 py-1 rounded-full ${statusBg} ${statusText} shadow-sm`}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* PROGRESS Column */}
        <div
          className={`w-[120px] min-w-[120px] shrink-0 flex items-center gap-2 justify-start px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('done_ratio', String(progressRatio), e)}
        >
          {isEditing('done_ratio') ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={100}
              step={10}
              className="w-[72px] text-[11px] h-8 px-1.5 border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white text-slate-700 shadow-sm"
              defaultValue={editingCell!.value}
              onBlur={(e) => { void commitEdit('done_ratio', e.currentTarget.value); }}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className="h-2 w-full max-w-[72px] overflow-hidden rounded-full bg-slate-200/90 relative">
                <div className={`absolute left-0 top-0 bottom-0 rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressRatio}%` }} />
              </div>
              <span className="text-[11px] text-slate-600 font-semibold tabular-nums" data-testid="progress-text">{progressRatio}%</span>
            </>
          )}
        </div>

        {/* DATE RANGE Column */}
        <div className="w-[260px] min-w-[260px] shrink-0 flex items-center gap-1.5 px-2 justify-start">
          <div
            ref={dateRangeRef}
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-[110px] h-8">
              <span
                data-testid={`start-date-display-${node.issue_id}`}
                className="inline-flex w-full h-full items-center rounded-md border border-transparent px-1.5 text-[11px] text-slate-700 tabular-nums cursor-pointer select-none hover:border-blue-200 hover:bg-blue-50/70"
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                onDoubleClick={(e) => startDateRangeEdit('start_date', e)}
              >
                {displayStartDate ? displayStartDate.replace(/-/g, '/') : '-'}
              </span>
              {isEditingDateRange ? (
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
                  onBlur={(e) => {
                    const nextTarget = e.relatedTarget as Node | null;
                    if (dateRangeRef.current && nextTarget && dateRangeRef.current.contains(nextTarget)) return;
                    commitDateRangeEdit();
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDatePicker(e.currentTarget);
                  }}
                />
              ) : null}
            </div>
            <span className="text-slate-300 text-[10px] font-bold">-</span>
            <div className="relative w-[110px] h-8">
              <span
                data-testid={`due-date-display-${node.issue_id}`}
                className="inline-flex w-full h-full items-center rounded-md border border-transparent px-1.5 text-[11px] text-slate-700 tabular-nums cursor-pointer select-none hover:border-blue-200 hover:bg-blue-50/70"
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                onDoubleClick={(e) => startDateRangeEdit('due_date', e)}
              >
                {displayDueDate ? displayDueDate.replace(/-/g, '/') : '-'}
              </span>
              {isEditingDateRange ? (
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
                  onBlur={(e) => {
                    const nextTarget = e.relatedTarget as Node | null;
                    if (dateRangeRef.current && nextTarget && dateRangeRef.current.contains(nextTarget)) return;
                    commitDateRangeEdit();
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDatePicker(e.currentTarget);
                  }}
                />
              ) : null}
            </div>
          </div>
          {isSaving && (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 ml-1"></div>
          )}
        </div>

        {/* ASSIGNEE Column */}
        <div
          className={`w-[120px] min-w-[120px] shrink-0 flex items-center justify-start gap-1.5 px-2 ${cellClass}`}
          onDoubleClick={(e) => startEdit('assigned_to_id', String(node.assignee_id || ''), e)}
        >
          {isEditing('assigned_to_id') && masters ? (
            <select
              className="w-full text-[11px] h-7 px-1 border border-blue-400 rounded-md focus:outline-none bg-white text-slate-700"
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
                <div className="w-6 h-6 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                  </svg>
                </div>
                <span className="text-[12px] font-medium text-slate-700 truncate">{node.assignee_name}</span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400">-</span>
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
          onSelectIssue={onSelectIssue}
          selectedIssueId={selectedIssueId}
          masters={masters}
          onFieldUpdate={onFieldUpdate}
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
  const handledSaveRef = useRef(false);
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
    handledSaveRef.current = false;
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

  const hasEmbeddedIssueForm = (doc: Document): boolean =>
    Boolean(
      doc.querySelector<HTMLFormElement>('form#issue-form') ||
      doc.querySelector<HTMLFormElement>('form#edit_issue') ||
      doc.querySelector<HTMLFormElement>('form#new_issue') ||
      doc.querySelector<HTMLFormElement>('#issue-form form') ||
      doc.querySelector<HTMLFormElement>('form.edit_issue') ||
      doc.querySelector<HTMLFormElement>('form.new_issue')
    );

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

  const saveEditedIssueFromEmbeddedForm = async (): Promise<number> => {
    const { form } = findEmbeddedIssueForm();
    const action = form.getAttribute('action') || `/issues/${issueId}`;
    const method = (form.getAttribute('method') || 'post').toUpperCase();
    const formData = new FormData(form);
    const res = await fetch(action, {
      method,
      credentials: 'same-origin',
      body: formData
    });
    if (!res.ok) {
      throw new Error(t('common.alertError', { message: `status=${res.status}` }));
    }

    const locationCandidates = [res.url, res.headers.get('x-response-url') || '', res.headers.get('location') || '', action];
    const matched = locationCandidates
      .map((url) => url.match(/\/issues\/(\d+)(?:[/?#]|$)/))
      .find((match): match is RegExpMatchArray => Boolean(match && match[1]));
    if (!matched) return issueId;
    return Number(matched[1]);
  };

  const handleSave = async () => {
    const lines = bulkText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

    if (lines.length === 0) {
      submitDefaultIssueForm();
      return;
    }

    setIsSubmitting(true);
    try {
      const { form } = findEmbeddedIssueForm();
      const defaults = extractInheritedSubIssueFieldsFromForm(form);
      const updatedIssueId = await saveEditedIssueFromEmbeddedForm();
      await createBulkIssues(updatedIssueId, lines, defaults);
      setBulkText('');
      setBulkOpen(false);
      onSaved?.(updatedIssueId);
      onClose();
    } catch (err: any) {
      alert(t('common.alertError', { message: err.message }));
    } finally {
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

                applyEmbeddedIssueDialogStyles(doc, {
                  contentPadding: '16px',
                  extraCss: EMBEDDED_ISSUE_SUBJECT_COMPACT_CSS,
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

                const pathname = doc.location?.pathname || '';
                if (
                  !handledSaveRef.current &&
                  new RegExp(`^/issues/${issueId}(?:/)?$`).test(pathname) &&
                  !hasEmbeddedIssueForm(doc)
                ) {
                  handledSaveRef.current = true;
                  onSaved?.(issueId);
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

export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  onTaskDatesUpdated,
  onClose
}: TaskDetailsDialogProps) {
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
  const [selectedIssue, setSelectedIssue] = useState<TreeNodeType | null>(null);
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [newCommentDraft, setNewCommentDraft] = useState<string>('');
  const [isSavingComment, setIsSavingComment] = useState<boolean>(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState<string>('');
  const [drilldownPath, setDrilldownPath] = useState<DrilldownCrumb[]>([]);
  const issuesRef = useRef<TaskDetailIssue[]>([]);
  const baselineByIdRef = useRef<Record<number, TaskDetailIssue>>({});
  const savingIssueIdsRef = useRef<Record<number, boolean>>({});
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasDateChangesRef = useRef(false);
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

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const currentRoot = drilldownPath[drilldownPath.length - 1] || { issueId, title: issueTitle };
  const currentRootIssueId = currentRoot.issueId;
  const currentRootIssueTitle = currentRoot.title;

  const selectIssue = useCallback((issue: TaskDetailIssue | TreeNodeType | null) => {
    const nextIssue = issue
      ? { ...issue, children: 'children' in issue ? issue.children : [] }
      : null;
    setSelectedIssue(nextIssue);
    setEditingDescription(false);
    setDescriptionDraft(nextIssue?.description || '');
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
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

      const nextSelectedIssueId = options.selectedIssueId;
      const nextSelectedIssue = nextSelectedIssueId
        ? latestRows.find((row) => row.issue_id === nextSelectedIssueId) || null
        : null;
      selectIssue(nextSelectedIssue);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : t('timeline.detailsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectIdentifier, selectIssue]);

  const handleClose = useCallback(() => {
    if (hasDateChangesRef.current) {
      onTaskDatesUpdated?.();
      hasDateChangesRef.current = false;
    }
    setCreateIssueContext(null);
    setEditIssueContext(null);
    setEditingDescription(false);
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
    onClose();
  }, [onClose, onTaskDatesUpdated]);

  useEffect(() => {
    if (!open) return;
    hasDateChangesRef.current = false;

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
          progress,
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
          ? PROCESS_FLOW_TRIANGLE_WIDTH
          : PROCESS_FLOW_DIAMOND_WIDTH;
      const hitWidth = step.shapeKind === 'range'
        ? visualWidth
        : Math.max(visualWidth, processFlowAxis.pixelsPerDay);
      const hitX = step.shapeKind === 'start-only'
        ? anchorX
        : anchorX - hitWidth / 2;
      const shapeX = step.shapeKind === 'start-only'
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
      const hasLeftNotch = step.shapeKind === 'range' && !isFirst;
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
      const x = hasLeftNotch ? step.shapeX - PROCESS_FLOW_POINT_DEPTH : step.shapeX;
      const width = hasLeftNotch ? step.visualWidth + PROCESS_FLOW_POINT_DEPTH : step.visualWidth;

      return {
        ...step,
        isFirst,
        hasLeftNotch,
        joinsPrevious,
        x,
        width,
        textX: step.shapeKind === 'due-only' ? step.anchorX : step.shapeX + step.visualWidth / 2
      };
    });
  }, [processFlowAxis, processFlowSteps, processDragSession]);

  const maxProcessFlowLane = useMemo(() => {
    return processFlowRenderSteps.length > 0 ? Math.max(...processFlowRenderSteps.map(s => s.laneIndex)) : 0;
  }, [processFlowRenderSteps]);

  const processFlowLaneHeight = Math.max(
    PROCESS_FLOW_LANE_HEIGHT,
    34 + (maxProcessFlowLane + 1) * PROCESS_FLOW_BAR_HEIGHT + maxProcessFlowLane * PROCESS_FLOW_BAR_SPACING_Y + 30
  );
  const processFlowSvgHeight = PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight;

  useLayoutEffect(() => {
    if (!processFlowAxis || !processFlowCanvasRef.current) return;
    const context = prepareHiDPICanvas(
      processFlowCanvasRef.current,
      processFlowAxis.timelineWidth,
      processFlowSvgHeight
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
      const stepY = PROCESS_FLOW_HEADER_HEIGHT + PROCESS_FLOW_BAR_Y + step.laneIndex * (PROCESS_FLOW_BAR_HEIGHT + PROCESS_FLOW_BAR_SPACING_Y);

      if (step.shapeKind === 'due-only') {
        drawDiamond(context, {
          centerX: step.textX,
          y: stepY,
          width: step.visualWidth,
          height: PROCESS_FLOW_BAR_HEIGHT,
          fill: style.fill,
          stroke: style.stroke,
          shadow: true
        });
      } else if (step.shapeKind === 'start-only') {
        drawTriangle(context, {
          x: step.shapeX,
          y: stepY,
          width: step.visualWidth,
          height: PROCESS_FLOW_BAR_HEIGHT,
          fill: style.fill,
          stroke: style.stroke,
          shadow: true
        });
      } else {
        drawChevron(context, {
          x: step.x,
          y: stepY,
          width: step.width,
          height: PROCESS_FLOW_BAR_HEIGHT,
          pointDepth: PROCESS_FLOW_POINT_DEPTH,
          hasLeftNotch: step.hasLeftNotch,
          fill: style.fill,
          stroke: style.stroke,
          progress: step.progress,
          separatorColor: style.fill === 'url(#stripePattern)' ? 'transparent' : 'white',
          shadow: true
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
          textX: step.textX
        });
      }

      if (step.shapeKind !== 'range') {
        drawStrokeText(context, {
          text: extractMD(step.anchorDate),
          x: step.textX,
          y: stepY - 4,
          fill: '#374151',
          stroke: '#ffffff',
          strokeWidth: 2,
          font: '700 10px sans-serif',
          textBaseline: 'alphabetic'
        });
      } else {
        if (step.startDate) {
          drawStrokeText(context, {
            text: extractMD(step.startDate),
            x: step.hitX,
            y: stepY - 4,
            fill: '#374151',
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'start',
            textBaseline: 'alphabetic'
          });
        }
        if (step.dueDate) {
          drawStrokeText(context, {
            text: extractMD(step.dueDate),
            x: step.hitX + step.hitWidth,
            y: stepY - 4,
            fill: '#374151',
            stroke: '#ffffff',
            strokeWidth: 2,
            font: '700 10px sans-serif',
            textAlign: 'end',
            textBaseline: 'alphabetic'
          });
        }
      }

      drawStrokeText(context, {
        text: step.title.length > 24 ? `${step.title.slice(0, 24)}…` : step.title,
        x: step.textX,
        y: stepY + PROCESS_FLOW_BAR_HEIGHT / 2 + 1,
        fill: style.text,
        stroke: style.textStroke || '#ffffff',
        strokeWidth: Number(String(style.textStrokeWidth || '3px').replace('px', '')),
        font: '700 11px sans-serif'
      });
    });
  }, [processFlowAxis, processFlowLaneHeight, processFlowRenderSteps, processFlowSvgHeight, processStatusStyles, selectedIssueId]);

  const dialogHeaderTitle = currentRootIssueTitle ? `${currentRootIssueTitle} #${currentRootIssueId}` : `#${currentRootIssueId}`;
  const shouldShowSelectedIssuePanel = Boolean(selectedIssue);
  const currentAutoFitKey = open && !loading && issues.length > 0 && processFlowRenderSteps.length > 0
    ? `${currentRootIssueId}:${processFlowSvgHeight}`
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
    const nextHeight = clampTopPaneHeight(processFlowSvgHeight, containerHeight);

    lastAutoFitKeyRef.current = currentAutoFitKey;
    setTopPaneHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [clampTopPaneHeight, currentAutoFitKey, processFlowSvgHeight]);

  useLayoutEffect(() => {
    if (!open || loading || issues.length === 0 || !detailsLayoutRef.current) return;

    const element = detailsLayoutRef.current;
    const updateHeight = () => {
      setTopPaneHeight((prev) => {
        const nextHeight = clampTopPaneHeight(prev, element.clientHeight);
        return prev === nextHeight ? prev : nextHeight;
      });
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [clampTopPaneHeight, issues.length, loading, open]);

  const isRowDirty = (row: TaskDetailIssue) => {
    const baseline = baselineByIdRef.current[row.issue_id];
    if (!baseline) return false;
    return baseline.start_date !== row.start_date || baseline.due_date !== row.due_date;
  };

  const saveRow = async (row: TaskDetailIssue) => {
    setSavingIssueIds((prev: Record<number, boolean>) => ({ ...prev, [row.issue_id]: true }));
    try {
      const updated = await updateTaskDates(projectIdentifier, row.issue_id, {
        start_date: row.start_date,
        due_date: row.due_date
      });
      // Preserve parent_id in the updated row
      updated.parent_id = row.parent_id;
      setIssues((prev) => prev.map((item) => (item.issue_id === updated.issue_id ? { ...item, ...updated } : item)));
      setBaselineById((prev) => ({ ...prev, [updated.issue_id]: updated }));
      hasDateChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);

      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
        hasDateChangesRef.current = true; // Need to refresh Gantt chart if they actually saved previously, but for now we just revert our local list
      }
    } finally {
      setSavingIssueIds((prev: Record<number, boolean>) => ({ ...prev, [row.issue_id]: false }));
    }
  };

  const saveProcessFlowDates = useCallback(async (row: TaskDetailIssue, startDate: string, dueDate: string) => {
    if (saveTimersRef.current[row.issue_id]) {
      clearTimeout(saveTimersRef.current[row.issue_id]);
      delete saveTimersRef.current[row.issue_id];
    }

    setSavingIssueIds((prev: Record<number, boolean>) => ({ ...prev, [row.issue_id]: true }));
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
      hasDateChangesRef.current = true;
    } catch (error: unknown) {
      const message =
        error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : t('api.updateTaskDates', { status: 500 });
      alert(message);
      const baseline = baselineByIdRef.current[row.issue_id];
      if (baseline) {
        setIssues((prev) => prev.map((item) => (item.issue_id === row.issue_id ? { ...item, ...baseline } : item)));
      }
    } finally {
      setSavingIssueIds((prev: Record<number, boolean>) => ({ ...prev, [row.issue_id]: false }));
    }
  }, [projectIdentifier]);

  useEffect(() => {
    if (!processDragSession) return;

    const onPointerMove = (event: PointerEvent) => {
      const current = processDragRef.current;
      if (!current) return;
      if (typeof event.pointerId === 'number' && current.pointerId !== event.pointerId) return;
      if (!Number.isFinite(processFlowPixelsPerDay) || processFlowPixelsPerDay <= 0) return;

      const deltaDays = Math.round((event.clientX - current.startClientX) / processFlowPixelsPerDay);
      if (!Number.isFinite(deltaDays)) return;
      const moved = current.moved || Math.abs(event.clientX - current.startClientX) >= PROCESS_FLOW_DRAG_THRESHOLD_PX;

      let nextStart = current.originalStartDate;
      let nextDue = current.originalDueDate;

      if (current.mode === 'move') {
        nextStart = shiftIsoDate(current.originalStartDate, deltaDays);
        nextDue = shiftIsoDate(current.originalDueDate, deltaDays);
      } else if (current.mode === 'resize-left') {
        const candidateStart = shiftIsoDate(current.originalStartDate, deltaDays);
        nextStart = candidateStart > current.originalDueDate ? current.originalDueDate : candidateStart;
      } else {
        const candidateDue = shiftIsoDate(current.originalDueDate, deltaDays);
        nextDue = candidateDue < current.originalStartDate ? current.originalStartDate : candidateDue;
      }

      if (nextStart === current.currentStartDate && nextDue === current.currentDueDate && moved === current.moved) return;

      const updated = { ...current, currentStartDate: nextStart, currentDueDate: nextDue, moved };
      processDragRef.current = updated;
      setProcessDragSession(updated);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = processDragRef.current;
      if (!current) return;
      if (typeof event.pointerId === 'number' && current.pointerId !== event.pointerId) return;
      setSuppressProcessClickIssueId(current.moved || current.mode !== 'move' ? current.issueId : null);

      const issue = issuesRef.current.find((item) => item.issue_id === current.issueId);
      const hasChanged = current.currentStartDate !== current.originalStartDate || current.currentDueDate !== current.originalDueDate;
      if (issue && hasChanged) {
        void saveProcessFlowDates(issue, current.currentStartDate, current.currentDueDate);
      }

      processDragRef.current = null;
      setProcessDragSession(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [processDragSession, processFlowPixelsPerDay, saveProcessFlowDates]);

  const updateVerticalResize = useCallback((clientY: number, pointerId?: number) => {
    const current = verticalResizeRef.current;
    if (!current) return;
    if (typeof pointerId === 'number' && pointerId > 0 && current.pointerId !== pointerId) return;

    const deltaY = clientY - current.startClientY;
    const nextHeight = clampTopPaneHeight(current.startTopPaneHeight + deltaY, current.containerHeight);
    setTopPaneHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [clampTopPaneHeight]);

  const stopVerticalResize = useCallback((pointerId?: number) => {
    const current = verticalResizeRef.current;
    if (!current) return;
    if (typeof pointerId === 'number' && pointerId > 0 && current.pointerId !== pointerId) return;

    verticalResizeRef.current = null;
    setVerticalResizeSession(null);
  }, []);

  useEffect(() => {
    if (!verticalResizeSession) return;

    const onPointerMove = (event: PointerEvent) => updateVerticalResize(event.clientY, event.pointerId);
    const onPointerUp = (event: PointerEvent) => stopVerticalResize(event.pointerId);
    const onMouseMove = (event: MouseEvent) => updateVerticalResize(event.clientY);
    const onMouseUp = () => stopVerticalResize();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [stopVerticalResize, updateVerticalResize, verticalResizeSession]);

  const beginVerticalResize = useCallback((clientY: number, pointerId: number) => {
    const containerRect = detailsLayoutRef.current?.getBoundingClientRect();
    const containerHeight = containerRect?.height ?? detailsLayoutRef.current?.clientHeight ?? 0;
    if (currentAutoFitKey) {
      manualResizeSuppressedKeyRef.current = currentAutoFitKey;
    }
    const nextSession = {
      pointerId,
      startClientY: clientY,
      startTopPaneHeight: topPaneHeight,
      containerHeight
    };

    verticalResizeRef.current = nextSession;
    setVerticalResizeSession(nextSession);
  }, [currentAutoFitKey, topPaneHeight]);

  const startVerticalResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginVerticalResize(event.clientY, event.pointerId);
  }, [beginVerticalResize]);

  const startVerticalResizeWithMouse = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginVerticalResize(event.clientY, 1);
  }, [beginVerticalResize]);

  const handleVerticalResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (event.key === 'ArrowDown') delta = 24;
    if (event.key === 'ArrowUp') delta = -24;
    if (event.key === 'PageDown') delta = 80;
    if (event.key === 'PageUp') delta = -80;
    if (delta === 0) return;

    event.preventDefault();
    const containerRect = detailsLayoutRef.current?.getBoundingClientRect();
    const containerHeight = containerRect?.height ?? detailsLayoutRef.current?.clientHeight ?? 0;
    if (currentAutoFitKey) {
      manualResizeSuppressedKeyRef.current = currentAutoFitKey;
    }
    setTopPaneHeight((prev) => clampTopPaneHeight(prev + delta, containerHeight));
  }, [clampTopPaneHeight, currentAutoFitKey]);

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
  }, [projectIdentifier, issues]);

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
    } catch (error: unknown) {
      const message = error instanceof WeeklyApiError ? error.message : error instanceof Error ? error.message : 'Update failed';
      alert(message);
    }
  };

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
      originalStartDate: step.startDate,
      originalDueDate: step.dueDate,
      currentStartDate: step.startDate,
      currentDueDate: step.dueDate,
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
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4 transition-all" onClick={handleClose}>
      <div
        className="bg-white w-full max-w-[98vw] h-[94vh] rounded-md shadow-[0_18px_60px_rgba(15,23,42,0.22)] ring-1 ring-slate-200/70 flex flex-col overflow-hidden transition-all transform"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-2.5 flex items-center justify-between gap-3 bg-[#f8f8f8] relative z-10 border-b border-slate-300 flex-shrink-0 min-h-12 box-border">
          <div className="flex flex-row items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              {drilldownPath.length > 1 && (
                <nav
                  className="mb-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap text-[11px] font-medium text-slate-400"
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
              <h3 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2 min-w-0" data-testid="task-details-title">
                <span className="truncate">{dialogHeaderTitle}</span>
              </h3>
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
                <div className="h-full overflow-auto">
                  <div className="overflow-x-auto" data-testid="task-details-process-flow" ref={processFlowContainerRef}>
                  {processFlowAxis && processFlowRenderSteps.length > 0 ? (
                    <div
                      className="relative"
                      style={{ width: processFlowAxis.timelineWidth, height: processFlowSvgHeight }}
                    >
                    <canvas
                      ref={processFlowCanvasRef}
                      data-testid="task-details-process-flow-canvas"
                      width={processFlowAxis.timelineWidth}
                      height={processFlowSvgHeight}
                      className="absolute inset-0 block"
                      style={{ width: `${processFlowAxis.timelineWidth}px`, height: `${processFlowSvgHeight}px`, pointerEvents: 'none' }}
                      aria-hidden="true"
                    />
                    <svg
                      data-testid="task-details-process-flow-svg"
                      width={processFlowAxis.timelineWidth}
                      height={processFlowSvgHeight}
                      role="img"
                      aria-label={t('timeline.processMode', { defaultValue: 'Process Flow' })}
                      style={{ opacity: 0 }}
                    >
                      <defs>
                        <pattern id="stripePattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fill="#f8fafc" />
                          <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
                        </pattern>
                      </defs>
                      <rect
                        x={0}
                        y={0}
                        width={processFlowAxis.timelineWidth}
                        height={PROCESS_FLOW_YEAR_ROW_HEIGHT}
                        fill="#f8fafc"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <rect
                        x={0}
                        y={PROCESS_FLOW_YEAR_ROW_HEIGHT}
                        width={processFlowAxis.timelineWidth}
                        height={PROCESS_FLOW_MONTH_ROW_HEIGHT}
                        fill="#f8fafc"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      {processFlowAxis.headerYears.map((year, index) => (
                        <g key={`process-year-${year.year}-${index}`} transform={`translate(${year.x}, 0)`}>
                          <rect x={0} y={0} width={year.width} height={PROCESS_FLOW_YEAR_ROW_HEIGHT} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                          <text
                            data-testid={`task-details-process-year-${index}`}
                            x={year.width / 2}
                            y={PROCESS_FLOW_YEAR_ROW_HEIGHT / 2}
                            fill="#334155"
                            fontSize="11"
                            fontWeight="700"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {year.year}
                          </text>
                        </g>
                      ))}
                      {processFlowAxis.headerMonths.map((month, index) => (
                        <g key={`process-month-${month.label}-${index}`} transform={`translate(${month.x}, ${PROCESS_FLOW_YEAR_ROW_HEIGHT})`}>
                          <rect x={0} y={0} width={month.width} height={PROCESS_FLOW_MONTH_ROW_HEIGHT} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                          <text
                            data-testid={`task-details-process-month-${index}`}
                            x={month.width / 2}
                            y={PROCESS_FLOW_MONTH_ROW_HEIGHT / 2}
                            fill="#334155"
                            fontSize="11"
                            fontWeight="700"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {month.label}
                          </text>
                        </g>
                      ))}

                      <g transform={`translate(0, ${PROCESS_FLOW_HEADER_HEIGHT})`}>
                        <rect
                          x={0}
                          y={0}
                          width={processFlowAxis.timelineWidth}
                          height={processFlowLaneHeight}
                          fill="#ffffff"
                        />
                        {processFlowAxis.headerMonths.map((month, index) => (
                          <line
                            key={`process-month-line-${index}`}
                            x1={month.x}
                            y1={0}
                            x2={month.x}
                            y2={processFlowLaneHeight}
                            stroke="#e2e8f0"
                            strokeDasharray="4 3"
                          />
                        ))}
                        <line
                          x1={0}
                          y1={processFlowLaneHeight}
                          x2={processFlowAxis.timelineWidth}
                          y2={processFlowLaneHeight}
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />

                        {processFlowRenderSteps.map((step) => {
                          const style = processStatusStyles[step.status];
                          const stepY = PROCESS_FLOW_BAR_Y + step.laneIndex * (PROCESS_FLOW_BAR_HEIGHT + PROCESS_FLOW_BAR_SPACING_Y);
                          const isInteractive = !savingIssueIds[step.id];
                          const isRangeStep = step.shapeKind === 'range';
                          const isSelected = selectedIssueId === step.id;

                          return (
                            <g
                              key={step.id}
                              data-testid="task-details-process-step"
                              data-selected={isSelected ? 'true' : 'false'}
                              opacity={savingIssueIds[step.id] ? 0.6 : 1}
                            >
                              {/* Date labels above the bar */}
                              {step.shapeKind !== 'range' ? (
                                <text
                                  x={step.textX}
                                  y={stepY - 4}
                                  fill="#374151"
                                  fontSize="10"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {extractMD(step.anchorDate)}
                                </text>
                              ) : (
                                <>
                                  <text
                                    x={step.hitX}
                                    y={stepY - 4}
                                    fill="#374151"
                                    fontSize="10"
                                    fontWeight="bold"
                                    textAnchor="start"
                                  >
                                    {step.startDate ? extractMD(step.startDate) : ''}
                                  </text>
                                  <text
                                    x={step.hitX + step.hitWidth}
                                    y={stepY - 4}
                                    fill="#374151"
                                    fontSize="10"
                                    fontWeight="bold"
                                    textAnchor="end"
                                  >
                                    {step.dueDate ? extractMD(step.dueDate) : ''}
                                  </text>
                                </>
                              )}

                              {step.shapeKind === 'due-only' ? (
                                <ProcessDiamond
                                  centerX={step.textX}
                                  y={stepY}
                                  width={step.visualWidth}
                                  height={PROCESS_FLOW_BAR_HEIGHT}
                                  fill={style.fill}
                                  stroke={style.stroke}
                                  id={step.id}
                                />
                              ) : step.shapeKind === 'start-only' ? (
                                <ProcessTriangle
                                  x={step.shapeX}
                                  y={stepY}
                                  width={step.visualWidth}
                                  height={PROCESS_FLOW_BAR_HEIGHT}
                                  fill={style.fill}
                                  stroke={style.stroke}
                                  id={step.id}
                                />
                              ) : (
                                <ProcessChevron
                                  x={step.x}
                                  y={stepY}
                                  width={step.width}
                                  height={PROCESS_FLOW_BAR_HEIGHT}
                                  pointDepth={PROCESS_FLOW_POINT_DEPTH}
                                  hasLeftNotch={step.hasLeftNotch}
                                  fill={style.fill}
                                  stroke={style.stroke}
                                  progress={step.progress}
                                  id={step.id}
                                />
                              )}
                              <rect
                                x={step.hitX}
                                y={stepY}
                                width={step.hitWidth}
                                height={PROCESS_FLOW_BAR_HEIGHT}
                                fill="transparent"
                                style={{ cursor: isInteractive && isRangeStep ? 'move' : 'pointer' }}
                                onPointerDown={isRangeStep ? (event) => startProcessFlowDrag(event, step, 'move') : undefined}
                                onClick={() => handleProcessStepClick(step)}
                                onDoubleClick={() => handleProcessStepDoubleClick(step)}
                                data-selected={isSelected ? 'true' : 'false'}
                                data-testid={`task-details-process-step-hit-${step.id}`}
                              />
                              {isRangeStep && (
                                <>
                                  <rect
                                    x={step.hitX}
                                    y={stepY}
                                    width={10}
                                    height={PROCESS_FLOW_BAR_HEIGHT}
                                    fill="transparent"
                                    style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                    onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-left')}
                                    data-testid={`task-details-process-step-left-${step.id}`}
                                  />
                                  <rect
                                    x={Math.max(step.hitX + step.hitWidth - 10, step.hitX)}
                                    y={stepY}
                                    width={10}
                                    height={PROCESS_FLOW_BAR_HEIGHT}
                                    fill="transparent"
                                    style={{ cursor: savingIssueIds[step.id] ? 'not-allowed' : 'ew-resize' }}
                                    onPointerDown={(event) => startProcessFlowDrag(event, step, 'resize-right')}
                                    data-testid={`task-details-process-step-right-${step.id}`}
                                  />
                                </>
                              )}
                              <text
                                x={step.textX}
                                y={stepY + PROCESS_FLOW_BAR_HEIGHT / 2 + 1}
                                fill={style.text}
                                fontSize="11"
                                fontWeight="700"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                pointerEvents="none"
                                style={{
                                  paintOrder: 'stroke',
                                  stroke: style.textStroke || '#ffffff',
                                  strokeWidth: style.textStrokeWidth || '3px',
                                  strokeLinecap: 'round',
                                  strokeLinejoin: 'round'
                                }}
                              >
                                {step.title.length > 24 ? `${step.title.slice(0, 24)}…` : step.title}
                              </text>
                            </g>
                          );
                        })}
                      </g>
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
                className={`relative z-20 shrink-0 cursor-row-resize bg-slate-300 transition-colors ${verticalResizeSession ? 'h-2 bg-slate-400' : 'h-1.5 hover:bg-slate-400'}`}
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
                      <div className="flex items-center py-2 px-4 bg-[#f8f8f8] z-20 border-b border-slate-300 text-[11px] font-semibold text-slate-600 flex-shrink-0 h-11 box-border sticky top-0 tracking-wide">
                      <div className="w-[280px] min-w-[280px] shrink-0 flex items-center">
                        <div className="w-5 mr-1" /> {/* Spacer for expand button */}
                        {t('timeline.task', { defaultValue: 'Task' })}
                      </div>
                      <div className="w-[56px] min-w-[56px] shrink-0 text-center px-2">{t('timeline.commentsCol', { defaultValue: 'Comments' })}</div>
                      <div className="w-[90px] min-w-[90px] shrink-0 text-left px-2">{t('timeline.trackerCol', { defaultValue: 'Tracker' })}</div>
                      <div className="w-[90px] min-w-[90px] shrink-0 text-left px-2">{t('timeline.priorityCol', { defaultValue: 'Priority' })}</div>
                      <div className="w-[80px] min-w-[80px] shrink-0 text-left px-2">{t('timeline.statusCol', { defaultValue: 'Status' })}</div>
                      <div className="w-[120px] min-w-[120px] shrink-0 text-left px-2">{t('timeline.progressCol', { defaultValue: 'Progress' })}</div>
                      <div className="w-[260px] min-w-[260px] shrink-0 text-left px-2">{t('timeline.dateRangeCol', { defaultValue: 'Date Range' })}</div>
                      <div className="w-[120px] min-w-[120px] shrink-0 text-left px-2">{t('timeline.assigneeCol', { defaultValue: 'Assignee' })}</div>
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
                        onSelectIssue={handleTaskRowSelect}
                        selectedIssueId={selectedIssue?.issue_id}
                        masters={masters}
                        onFieldUpdate={handleFieldUpdate}
                      />
                    ))}
                  </div>
                </div>


                {/* Right Panel - Detail View */}
                {shouldShowSelectedIssuePanel && selectedIssue && (
                  <div className="absolute right-0 top-0 bottom-0 w-[50%] min-w-[360px] flex flex-col min-h-0 overflow-auto bg-white border-l border-slate-300 z-30">
                    {/* Detail Header */}
                    <div className="px-4 pt-3 pb-2.5 flex items-start justify-between gap-3 flex-shrink-0 border-b border-slate-300 bg-[#f8f8f8] sticky top-0 z-10">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-[11px] leading-none font-semibold text-slate-500 shrink-0">
                            #{selectedIssue.issue_id}
                          </span>
                          <h4 className="text-[14px] leading-5 font-semibold text-slate-900 truncate" data-testid="task-details-selected-title">
                            {selectedIssue.subject}
                          </h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={selectedIssue.issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className={REDMINE_DIALOG_ICON_ACTION_CLASS}
                          title={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
                          aria-label={t('common.openInNewTab', { defaultValue: 'Open in Redmine' })}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L10.5 13.5" />
                          </svg>
                        </a>
                        <button
                          type="button"
                          className={REDMINE_DIALOG_ICON_ACTION_CLASS}
                          title={t('timeline.editIssue')}
                          aria-label={t('timeline.editIssue')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditIssueContext({
                              issueId: selectedIssue.issue_id,
                              issueUrl: selectedIssue.issue_url
                            });
                          }}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.625 2.625 0 113.712 3.713L8.25 20.524 3 21l.476-5.25L16.862 4.487z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={REDMINE_DIALOG_ICON_ACTION_CLASS}
                          onClick={() => selectIssue(null)}
                          title={t('common.close', { defaultValue: 'Close' })}
                          aria-label={t('common.close', { defaultValue: 'Close' })}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Detail Fields removed */}

                    {/* Description */}
                    <div className={REDMINE_DIALOG_SECTION_CLASS}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h5 className={REDMINE_DIALOG_SECTION_TITLE_CLASS}>{t('timeline.descriptionTab')}</h5>
                        {!editingDescription && (
                          <button
                            type="button"
                            className={REDMINE_DIALOG_ACTION_CLASS}
                            onClick={() => {
                              setDescriptionDraft(selectedIssue.description || '');
                              setEditingDescription(true);
                            }}
                            title={t('common.edit', { defaultValue: 'Edit' })}
                          >
                            {t('common.edit', { defaultValue: 'Edit' })}
                          </button>
                        )}
                      </div>
                      {editingDescription ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            className={`${REDMINE_DIALOG_TEXTAREA_CLASS} min-h-[120px]`}
                            value={descriptionDraft}
                            onChange={(e) => setDescriptionDraft(e.target.value)}
                            placeholder={t('timeline.noDescription')}
                            autoFocus
                          />
                          <div className="flex justify-start gap-2">
                            <button
                              type="button"
                              className={REDMINE_DIALOG_ACTION_CLASS}
                              onClick={() => {
                                setEditingDescription(false);
                                setDescriptionDraft(selectedIssue.description || '');
                              }}
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              className={REDMINE_DIALOG_PRIMARY_ACTION_CLASS}
                              onClick={() => { void handleSaveDescription(); }}
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="min-h-[72px] border border-slate-200 bg-white px-3 py-2 text-[13px] leading-6 text-slate-700 whitespace-pre-wrap cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            setDescriptionDraft(selectedIssue.description || '');
                            setEditingDescription(true);
                          }}
                          data-testid="task-details-description"
                        >
                          {selectedIssue.description || <span className="text-slate-500 italic">{t('timeline.noDescription')}</span>}
                        </div>
                      )}
                    </div>

                    {/* Comments */}
                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className={REDMINE_DIALOG_SECTION_TITLE_CLASS}>{t('timeline.commentsTab')}</h5>
                        <span className="text-[12px] font-medium text-slate-500">
                          {selectedIssue.comments?.length ?? 0}
                        </span>
                      </div>
                      <div className="border border-slate-200 bg-white">
                        {(selectedIssue.comments && selectedIssue.comments.length > 0) ? selectedIssue.comments.map((comment) => (
                          <div key={comment.id ?? `${comment.created_on}-${comment.author_name}-${comment.notes.slice(0, 12)}`} className="group border-b border-slate-200 last:border-b-0">
                            {editingCommentId === comment.id && comment.id !== undefined ? (
                              <div className="flex flex-col gap-2 p-3">
                                <textarea
                                  className={REDMINE_DIALOG_TEXTAREA_CLASS}
                                  value={editingCommentDraft}
                                  onChange={(e) => setEditingCommentDraft(e.target.value)}
                                  autoFocus
                                />
                                <div className="flex justify-start gap-2">
                                  <button
                                    type="button"
                                    className={REDMINE_DIALOG_ACTION_CLASS}
                                    onClick={() => {
                                      setEditingCommentId(null);
                                      setEditingCommentDraft('');
                                    }}
                                  >
                                    {t('common.cancel')}
                                  </button>
                                  <button
                                    type="button"
                                    className={REDMINE_DIALOG_PRIMARY_ACTION_CLASS}
                                    onClick={() => {
                                      void handleUpdateComment(comment.id!, editingCommentDraft);
                                      setEditingCommentId(null);
                                    }}
                                  >
                                    {t('common.save')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="relative cursor-pointer px-3 py-2.5 hover:bg-slate-50 transition-colors"
                                onClick={() => {
                                  setEditingCommentId(comment.id!);
                                  setEditingCommentDraft(comment.notes || '');
                                }}
                              >
                                {comment.id !== undefined && (
                                  <button
                                    type="button"
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 min-w-6 px-1.5 border border-slate-300 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCommentId(comment.id!);
                                      setEditingCommentDraft(comment.notes || '');
                                    }}
                                    title={t('common.edit', { defaultValue: 'Edit' })}
                                  >
                                    {t('common.edit', { defaultValue: 'Edit' })}
                                  </button>
                                )}
                                <div className="mb-2 flex items-center justify-between gap-3 pr-14">
                                  <span className="text-[12px] font-semibold text-slate-700">
                                    {comment.author_name || t('common.unknown', { defaultValue: 'Unknown' })}
                                  </span>
                                  <span className="text-[11px] text-slate-500 shrink-0">
                                    {comment.created_on ? comment.created_on.replace('T', ' ').slice(0, 16).replace(/-/g, '/') : ''}
                                  </span>
                                </div>
                                <div className="text-[13px] leading-6 text-slate-700 whitespace-pre-wrap break-words">
                                  {comment.notes}
                                </div>
                              </div>
                            )}
                          </div>
                        )) : (
                          <div className="px-3 py-4 text-[12px] text-slate-500 text-center" data-testid="task-details-no-comments">
                            {t('timeline.noComments', { defaultValue: 'No comments' })}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 border border-slate-200 bg-white p-3">
                        <textarea
                          className={REDMINE_DIALOG_TEXTAREA_CLASS}
                          placeholder={t('timeline.addCommentPlaceholder', { defaultValue: 'Add a comment...' })}
                          value={newCommentDraft}
                          onChange={(e) => setNewCommentDraft(e.target.value)}
                          disabled={isSavingComment}
                          data-testid="task-details-new-comment"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className={`${REDMINE_DIALOG_PRIMARY_ACTION_CLASS} flex items-center gap-1`}
                            onClick={() => { void handleAddComment(); }}
                            disabled={!newCommentDraft.trim() || isSavingComment}
                          >
                            {isSavingComment && (
                              <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            )}
                            {t('common.add', { defaultValue: 'Add' })}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pb-2" />
                  </div>
                )}
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
              void reloadTaskDetails(currentRootIssueId, {
                expectedIssueId: updatedIssueId ?? editIssueContext.issueId,
                selectedIssueId: updatedIssueId ?? editIssueContext.issueId
              });
            }}
            onClose={() => setEditIssueContext(null)}
          />
        )
      }
    </div >
  );
}
