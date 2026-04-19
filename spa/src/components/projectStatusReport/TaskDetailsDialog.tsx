import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  TaskDetailIssue
} from '../../services/scheduleReportApi';
import { buildTimelineAxis, calculateStaggeredLanes, createDateToX, createRangeToWidth } from './timelineAxis';
import { type InlineDateRangeValue } from './InlineDateRangeEditor';
import {
  drawChevron,
  drawDiamond, truncateCanvasText,
  drawTriangle,
  drawStrokeText,
  prepareHiDPICanvas
} from './canvasTimelineRenderer';
import { getProgressFillColor, getProgressTrackColor } from './constants';
import { IssueTreeTable } from './taskDetails/IssueTreeTable';
import {
  IssueEditDialog,
  IssueViewDialog,
  SubIssueCreationDialog
} from './taskDetails/EmbeddedIssueDialogs';
import {
  buildInheritedSubIssueFields,
  COLUMN_WIDTH_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS,
  DENSITY_CONFIG,
  TABLE_DENSITY_STORAGE_KEY,
  type InheritedSubIssueFields,
  type TableDensity,
  type TreeNodeType
} from './taskDetails/shared';
import { useTaskDetailsData } from './taskDetails/useTaskDetailsData';

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
const PROCESS_FLOW_YEAR_ROW_HEIGHT = 23;
const PROCESS_FLOW_MONTH_ROW_HEIGHT = 23;
const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
const PROCESS_FLOW_LANE_HEIGHT = 136;
const PROCESS_FLOW_BAR_HEIGHT = 36;
const PROCESS_FLOW_BAR_Y = 28;
const PROCESS_FLOW_BAR_SPACING_Y = 34;
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

const REDMINE_DIALOG_ACTION_CLASS = 'inline-flex items-center justify-center h-8 min-w-8 px-4 rounded-full border border-gray-200 bg-[#f0f0f0] text-[13px] font-medium font-sans text-[#222222] hover:bg-gray-200 transition-colors cursor-pointer shadow-subtle';
const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-9 w-9 rounded-full bg-[rgba(0,0,0,0.04)] text-[#45515e] hover:bg-[rgba(0,0,0,0.08)] hover:text-[#222222] transition-all duration-300 cursor-pointer';

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
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [newCommentDraft, setNewCommentDraft] = useState<string>('');
  const [isSavingComment, setIsSavingComment] = useState<boolean>(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState<string>('');
  const [editingDateRange, setEditingDateRange] = useState<InlineDateRangeValue | null>(null);
  const [drilldownPath, setDrilldownPath] = useState<DrilldownCrumb[]>([]);
  const editingDateRangeRef = useRef<InlineDateRangeValue | null>(null);
  const {
    issues,
    setIssues,
    loading,
    masters,
    savingIssueIds,
    feedback,
    showFeedback,
    clearFeedback,
    resetData,
    reloadTaskDetails,
    handleDateChange,
    handleFieldUpdate,
    handleUpdateComment: updateComment,
    saveProcessFlowDates,
    issuesRef,
    savingIssueIdsRef,
    hasAnyChangesRef
  } = useTaskDetailsData(projectIdentifier, open);
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

  useEffect(() => {
    editingDateRangeRef.current = editingDateRange;
  }, [editingDateRange]);

  const [processDragSession, setProcessDragSession] = useState<ProcessDragSession | null>(null);
  const [suppressProcessClickIssueId, setSuppressProcessClickIssueId] = useState<number | null>(null);
  const processDragRef = useRef<ProcessDragSession | null>(null);
  const processFlowContainerRef = useRef<HTMLDivElement | null>(null);
  const processFlowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const issueRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
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

  const registerIssueRowRef = useCallback((issueId: number, element: HTMLDivElement | null) => {
    issueRowRefs.current[issueId] = element;
  }, []);

  const syncSelectionAfterReload = useCallback((rows: TaskDetailIssue[], selectedIssueId?: number | null) => {
    if (!selectedIssueId) {
      selectIssue(null);
      return;
    }
    selectIssue(rows.find((row) => row.issue_id === selectedIssueId) || null);
  }, [selectIssue]);

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


  const handleClose = useCallback(() => {
    if (hasAnyChangesRef.current) {
      onTaskDatesUpdated?.();
      hasAnyChangesRef.current = false;
    }
    setEditingDateRange(null);
    setCreateIssueContext(null);
    setEditIssueContext(null);
    setViewIssueContext(null);
    setEditingDescription(false);
    setNewCommentDraft('');
    setEditingCommentId(null);
    setEditingCommentDraft('');
    onClose();
  }, [onClose, onTaskDatesUpdated]);

  useEffect(() => {
    if (!open) return;
    hasAnyChangesRef.current = false;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingDateRangeRef.current) {
          event.preventDefault();
          setEditingDateRange(null);
          return;
        }
        handleClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    setDrilldownPath([{ issueId, title: issueTitle }]);
    resetData();
    setProcessDragSession(null);
    processDragRef.current = null;
    setTopPaneHeight(DETAILS_TOP_PANE_DEFAULT_HEIGHT_PX);
    setVerticalResizeSession(null);
    verticalResizeRef.current = null;
    lastAutoFitKeyRef.current = null;
    manualResizeSuppressedKeyRef.current = null;
    setSuppressProcessClickIssueId(null);
    clearFeedback();
    selectIssue(null);
    void reloadTaskDetails(issueId).then((latestRows) => {
      const rootRow = latestRows.find((row) => row.issue_id === issueId);
      if (rootRow) {
        setDrilldownPath([{ issueId, title: rootRow.subject }]);
      }
      syncSelectionAfterReload(latestRows, null);
    });
  }, [clearFeedback, issueId, issueTitle, open, reloadTaskDetails, resetData, selectIssue, syncSelectionAfterReload]);

  useEffect(() => {
    processDragRef.current = processDragSession;
  }, [processDragSession]);

  useEffect(() => {
    verticalResizeRef.current = verticalResizeSession;
  }, [verticalResizeSession]);


  const handleStartDateRangeEdit = useCallback((row: TaskDetailIssue, field: 'start_date' | 'due_date', event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setEditingDateRange({
      issueId: row.issue_id,
      focusField: field,
      startDate: row.start_date || '',
      dueDate: row.due_date || ''
    });
  }, []);

  const handleCommitDateRangeEdit = useCallback((row: TaskDetailIssue, next: InlineDateRangeValue) => {
    const activeEdit = editingDateRangeRef.current;
    if (!activeEdit || activeEdit.issueId !== row.issue_id) return;

    if ((row.start_date || '') !== next.startDate) {
      handleDateChange(row, 'start_date', next.startDate);
    }

    if ((row.due_date || '') !== next.dueDate) {
      handleDateChange(row, 'due_date', next.dueDate);
    }

    setEditingDateRange(null);
  }, []);

  const handleCancelDateRangeEdit = useCallback(() => {
    setEditingDateRange(null);
  }, []);

  const handleIssueFieldUpdate = useCallback(async (targetIssueId: number, field: string, value: string | number | null) => {
    const updated = await handleFieldUpdate(targetIssueId, field, value, {
      rootIssueId: currentRootIssueId,
      selectedIssueId: selectedIssue?.issue_id ?? null
    });
    setSelectedIssue((prev) => (
      prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev
    ));
    return updated;
  }, [currentRootIssueId, handleFieldUpdate, selectedIssue?.issue_id]);

  const handleSaveDescription = async () => {
    if (!selectedIssue) return;
    try {
      await handleIssueFieldUpdate(selectedIssue.issue_id, 'description', descriptionDraft);
      setEditingDescription(false);
    } catch (error) {
      // Error is handled in handleFieldUpdate
    }
  };

  const handleAddComment = async () => {
    if (!selectedIssue || !newCommentDraft.trim()) return;
    setIsSavingComment(true);
    try {
      await handleIssueFieldUpdate(selectedIssue.issue_id, 'notes', newCommentDraft.trim());
      setNewCommentDraft('');
    } catch (error) {
      // Error is handled in handleFieldUpdate
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleUpdateComment = async (journalId: number, notes: string) => {
    if (!selectedIssue) return;
    await updateComment(journalId, notes, currentRootIssueId, selectedIssue.issue_id);
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
    const step = e.shiftKey ? 50 : 24;
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      setTopPaneHeight((prev) => Math.max(100, prev - step));
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      if (!detailsLayoutRef.current) return;
      const containerHeight =
        detailsLayoutRef.current.clientHeight ||
        detailsLayoutRef.current.getBoundingClientRect().height ||
        DETAILS_LAYOUT_FALLBACK_HEIGHT_PX;
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

  useEffect(() => {
    if (!selectedIssueId) return;

    const rowElement = issueRowRefs.current[selectedIssueId];
    if (!rowElement) return;

    rowElement.scrollIntoView({
      block: 'center',
      inline: 'nearest'
    });
  }, [selectedIssueId, issues]);

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

      if (session.mode !== 'move' || session.moved) {
        setSuppressProcessClickIssueId(session.issueId);
      }
      if (session.moved) {
        const row = issuesRef.current.find((item) => item.issue_id === session.issueId);
        if (row) {
          const updated = await saveProcessFlowDates(row, session.currentStartDate, session.currentDueDate);
          if (updated) {
            setSelectedIssue((prev) => (
              prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev
            ));
          }
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
    40 + (maxProcessFlowLane + 1) * scaledBarHeight + maxProcessFlowLane * scaledBarSpacingY + 40
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
    void reloadTaskDetails(step.id).then((rows) => {
      syncSelectionAfterReload(rows, null);
    });
  }, [reloadTaskDetails, syncSelectionAfterReload]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    setDrilldownPath((prev) => {
      const next = prev.slice(0, index + 1);
      const target = next[next.length - 1];
      if (target) {
        void reloadTaskDetails(target.issueId).then((rows) => {
          syncSelectionAfterReload(rows, target.issueId);
        });
      }
      return next;
    });
  }, [reloadTaskDetails, syncSelectionAfterReload]);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (editingDateRangeRef.current) {
      event.preventDefault();
      event.stopPropagation();
      setEditingDateRange(null);
      return;
    }
    handleClose();
  }, [handleClose]);

  const handleDialogMouseDownCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!editingDateRangeRef.current) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-date-editor-root="true"]') && !target?.closest('[data-date-editor-popper="true"]')) {
      setEditingDateRange(null);
    }
  }, []);

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[6px] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in" onClick={handleBackdropClick}>
      <div
        className="report-surface-elevated flex h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden font-sans transition-all transform animate-in slide-in-from-bottom-8 duration-700 ease-out"
        onClick={(event) => event.stopPropagation()}
        onMouseDownCapture={handleDialogMouseDownCapture}
      >
        {/* Header */}
        <div className="px-5 py-2.5 flex items-center justify-between gap-2.5 bg-white relative z-40 border-b border-gray-200 flex-shrink-0 min-h-10 box-border">
          <div className="flex flex-row items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              {drilldownPath.length > 1 && (
                <nav
                  className="mb-1 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11px] font-medium font-sans text-[#8e8e93]"

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
              <h3 className="text-[24px] leading-none font-display font-semibold text-[var(--color-text-00)] flex items-center gap-2 min-w-0" data-testid="task-details-title">
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
              onClick={() => void reloadTaskDetails(currentRootIssueId).then((rows) => {
                syncSelectionAfterReload(rows, selectedIssue?.issue_id ?? null);
              })}
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
        {feedback ? (
          <div className={feedback.type === 'error' ? 'report-alert-error m-4 mb-0' : 'report-alert-info m-4 mb-0'} role="alert">
            {feedback.text}
          </div>
        ) : null}

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
                  <div className="overflow-auto flex-1 bg-white">
                    <IssueTreeTable
                      treeRoots={treeRoots}
                      rootIssueId={issueId}
                      savingIssueIds={savingIssueIds}
                      editingDateRange={editingDateRange}
                      onStartDateRangeEdit={handleStartDateRangeEdit}
                      onCommitDateRangeEdit={handleCommitDateRangeEdit}
                      onCancelDateRangeEdit={handleCancelDateRangeEdit}
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
                      selectedIssueId={selectedIssue?.issue_id}
                      registerRowRef={registerIssueRowRef}
                      masters={masters}
                      onFieldUpdate={handleIssueFieldUpdate}
                      columnWidths={columnWidths}
                      onColumnResize={handleColumnResize}
                      density={density}
                    />
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
                expectedIssueId: createdIssueId
              }).then((rows) => {
                syncSelectionAfterReload(rows, createdIssueId ?? currentRootIssueId);
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
                expectedIssueId: updatedIssueId ?? editIssueContext.issueId
              }).then((rows) => {
                syncSelectionAfterReload(rows, updatedIssueId ?? editIssueContext.issueId);
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
                expectedIssueId: updatedIssueId ?? viewIssueContext.issueId
              }).then((rows) => {
                syncSelectionAfterReload(rows, updatedIssueId ?? viewIssueContext.issueId);
              });
            }}
            onClose={() => setViewIssueContext(null)}
          />
        )
      }

    </div >
  );
}
