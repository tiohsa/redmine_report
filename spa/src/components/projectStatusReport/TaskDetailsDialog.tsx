import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import {
  TaskDetailIssue
} from '../../services/scheduleReportApi';
import { buildTimelineAxis } from './timelineAxis';
import { type InlineDateRangeValue } from './InlineDateRangeEditor';
import { IssueTreeTable } from './taskDetails/IssueTreeTable';
import { ProcessFlowCanvas } from './taskDetails/ProcessFlowCanvas';
import { TaskDetailsSidePanel } from './taskDetails/TaskDetailsSidePanel';
import {
  IssueEditDialog,
  IssueViewDialog,
  SubIssueCreationDialog
} from './taskDetails/EmbeddedIssueDialogs';
import {
  buildProcessFlowRenderSteps,
  buildProcessFlowScaleMetrics,
  buildProcessFlowSteps,
  getProcessFlowLayout,
  getProcessFlowTimelineWidth,
  type ProcessFlowRenderStep
} from './taskDetails/processFlowGeometry';
import {
  buildInheritedSubIssueFields,
  COLUMN_WIDTH_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS,
  type TableDensity,
  type TreeNodeType
} from './taskDetails/shared';
import { useProcessFlowInteraction } from './taskDetails/useProcessFlowInteraction';
import { useTaskDetailsData } from './taskDetails/useTaskDetailsData';
import { useTaskDetailsDialogState } from './taskDetails/useTaskDetailsDialogState';
import { useTaskDetailsLayout } from './taskDetails/useTaskDetailsLayout';

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

type DrilldownCrumb = {
  issueId: number;
  title?: string;
};

const REDMINE_DIALOG_ACTION_CLASS = 'inline-flex items-center justify-center h-8 min-w-8 px-4 rounded-full border border-gray-200 bg-[#f0f0f0] text-[13px] font-medium font-sans text-[#222222] hover:bg-gray-200 transition-colors cursor-pointer shadow-subtle';
const REDMINE_DIALOG_ICON_ACTION_CLASS = 'inline-flex items-center justify-center h-9 w-9 rounded-full bg-[rgba(0,0,0,0.04)] text-[#45515e] hover:bg-[rgba(0,0,0,0.08)] hover:text-[#222222] transition-all duration-300 cursor-pointer';

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
  const processFlowScaleMetrics = useMemo(() => buildProcessFlowScaleMetrics(effectiveScale), [effectiveScale]);
  const {
    createIssueContext,
    setCreateIssueContext,
    editIssueContext,
    setEditIssueContext,
    viewIssueContext,
    setViewIssueContext,
    selectedIssue,
    setSelectedIssue,
    selectIssue,
    editingDescription,
    setEditingDescription,
    descriptionDraft,
    setDescriptionDraft,
    newCommentDraft,
    setNewCommentDraft,
    isSavingComment,
    setIsSavingComment,
    editingCommentId,
    editingCommentDraft,
    setEditingCommentDraft,
    density,
    densityMenuOpen,
    setDensityMenuOpen,
    handleDensityChange,
    startDescriptionEdit,
    cancelDescriptionEdit,
    startCommentEdit,
    cancelCommentEdit,
    resetDialogState
  } = useTaskDetailsDialogState();
  const [editingDateRange, setEditingDateRange] = useState<InlineDateRangeValue | null>(null);
  const [drilldownPath, setDrilldownPath] = useState<DrilldownCrumb[]>([]);
  const editingDateRangeRef = useRef<InlineDateRangeValue | null>(null);
  const {
    issues,
    loading,
    masters,
    savingIssueIds,
    feedback,
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
  useEffect(() => {
    editingDateRangeRef.current = editingDateRange;
  }, [editingDateRange]);

  const processFlowContainerRef = useRef<HTMLDivElement | null>(null);
  const issueRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [processFlowContainerWidth, setProcessFlowContainerWidth] = useState(0);
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
    resetDialogState();
    onClose();
  }, [onClose, onTaskDatesUpdated, resetDialogState]);

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
    resetDialogState();
    clearFeedback();
    void reloadTaskDetails(issueId).then((latestRows) => {
      const rootRow = latestRows.find((row) => row.issue_id === issueId);
      if (rootRow) {
        setDrilldownPath([{ issueId, title: rootRow.subject }]);
      }
      syncSelectionAfterReload(latestRows, null);
    });
  }, [clearFeedback, issueId, issueTitle, open, reloadTaskDetails, resetData, resetDialogState, syncSelectionAfterReload]);


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
    const latestRows = await updateComment(journalId, notes, currentRootIssueId, selectedIssue.issue_id);
    cancelCommentEdit();
    if (latestRows) {
      syncSelectionAfterReload(latestRows, selectedIssue.issue_id);
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

  const processFlowSteps = useMemo(
    () => buildProcessFlowSteps(issues, currentRootIssueId),
    [issues, currentRootIssueId]
  );

  const processFlowTimelineWidth = useMemo(
    () => getProcessFlowTimelineWidth(processFlowContainerWidth, processFlowSteps.length),
    [processFlowContainerWidth, processFlowSteps.length]
  );

  const processFlowAxis = useMemo(() => {
    if (processFlowSteps.length === 0) {
      return null;
    }

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

  const handleProcessFlowStepUpdated = useCallback((updated: TaskDetailIssue) => {
    setSelectedIssue((prev) => (
      prev?.issue_id === updated.issue_id ? { ...prev, ...updated, children: prev.children } : prev
    ));
  }, []);

  const {
    processDragSession,
    startProcessFlowDrag,
    consumeSuppressedProcessClick,
    resetProcessFlowInteraction
  } = useProcessFlowInteraction({
    pixelsPerDay: processFlowAxis?.pixelsPerDay,
    issuesRef,
    savingIssueIdsRef,
    saveProcessFlowDates,
    onStepUpdated: handleProcessFlowStepUpdated
  });

  const processFlowRenderSteps = useMemo<ProcessFlowRenderStep[]>(
    () => buildProcessFlowRenderSteps({
      axis: processFlowAxis,
      steps: processFlowSteps,
      dragSession: processDragSession,
      scaleMetrics: processFlowScaleMetrics
    }),
    [processDragSession, processFlowAxis, processFlowScaleMetrics, processFlowSteps]
  );

  const {
    laneHeight: processFlowLaneHeight,
    chartHeight: processFlowChartHeight,
    baseTopPadding: processFlowBaseTopPadding
  } = useMemo(
    () => getProcessFlowLayout(processFlowRenderSteps, processFlowScaleMetrics),
    [processFlowRenderSteps, processFlowScaleMetrics]
  );

  const dialogHeaderTitle = currentRootIssueTitle ? `${currentRootIssueTitle} #${currentRootIssueId}` : `#${currentRootIssueId}`;
  const currentAutoFitKey = open && !loading && issues.length > 0 && processFlowRenderSteps.length > 0
    ? `${currentRootIssueId}:${processFlowChartHeight}`
    : null;

  const {
    detailsLayoutRef,
    topPaneHeight,
    verticalResizeSession,
    startVerticalResize,
    startVerticalResizeWithMouse,
    updateVerticalResize,
    stopVerticalResize,
    handleVerticalResizeKeyDown,
    resetLayoutState
  } = useTaskDetailsLayout({
    currentAutoFitKey,
    processFlowChartHeight
  });

  const handleProcessStepClick = useCallback((step: ProcessFlowRenderStep) => {
    if (consumeSuppressedProcessClick(step.id)) {
      return;
    }

    const issue = issuesRef.current.find((item) => item.issue_id === step.id) || null;
    if (!issue) return;

    selectIssue(issue);
  }, [consumeSuppressedProcessClick, selectIssue]);

  const handleProcessStepDoubleClick = useCallback((step: ProcessFlowRenderStep) => {
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
                  <ProcessFlowCanvas
                    axis={processFlowAxis}
                    renderSteps={processFlowRenderSteps}
                    chartHeight={processFlowChartHeight}
                    laneHeight={processFlowLaneHeight}
                    baseTopPadding={processFlowBaseTopPadding}
                    scaleMetrics={processFlowScaleMetrics}
                    selectedIssueId={selectedIssueId}
                    savingIssueIds={savingIssueIds}
                    containerRef={processFlowContainerRef}
                    onStepPointerDown={startProcessFlowDrag}
                    onStepClick={handleProcessStepClick}
                    onStepDoubleClick={handleProcessStepDoubleClick}
                  />
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
                {selectedIssue ? (
                  <TaskDetailsSidePanel
                    issue={selectedIssue}
                    editingDescription={editingDescription}
                    descriptionDraft={descriptionDraft}
                    newCommentDraft={newCommentDraft}
                    isSavingComment={isSavingComment}
                    editingCommentId={editingCommentId}
                    editingCommentDraft={editingCommentDraft}
                    onClose={() => selectIssue(null)}
                    onEditIssue={() => {
                      setEditIssueContext({
                        issueId: selectedIssue.issue_id,
                        issueUrl: selectedIssue.issue_url
                      });
                    }}
                    onStartDescriptionEdit={startDescriptionEdit}
                    onCancelDescriptionEdit={cancelDescriptionEdit}
                    onDescriptionDraftChange={setDescriptionDraft}
                    onSaveDescription={() => {
                      void handleSaveDescription();
                    }}
                    onNewCommentDraftChange={setNewCommentDraft}
                    onAddComment={() => {
                      void handleAddComment();
                    }}
                    onStartCommentEdit={startCommentEdit}
                    onCancelCommentEdit={cancelCommentEdit}
                    onEditingCommentDraftChange={setEditingCommentDraft}
                    onSaveComment={(journalId, notes) => {
                      void handleUpdateComment(journalId, notes);
                    }}
                  />
                ) : null}
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
