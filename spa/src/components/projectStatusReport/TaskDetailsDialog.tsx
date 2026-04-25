import { useCallback, useEffect, useRef, useState } from 'react';
import { type TaskDetailIssue } from '../../services/scheduleReportApi';
import { type InlineDateRangeValue } from './InlineDateRangeEditor';
import { TaskDetailsBody } from './taskDetails/TaskDetailsBody';
import { TaskDetailsEmbeddedDialogs } from './taskDetails/TaskDetailsEmbeddedDialogs';
import { type DrilldownCrumb, TaskDetailsHeader } from './taskDetails/TaskDetailsHeader';
import {
  buildInheritedSubIssueFields,
  COLUMN_WIDTH_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS
} from './taskDetails/shared';
import { useTaskDetailsData } from './taskDetails/useTaskDetailsData';
import { useTaskDetailsDialogState } from './taskDetails/useTaskDetailsDialogState';
import { useTaskDetailsLayout } from './taskDetails/useTaskDetailsLayout';
import { useTaskDetailsProcessFlow } from './taskDetails/useTaskDetailsProcessFlow';
import { useTaskDetailsTree } from './taskDetails/useTaskDetailsTree';

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

export function TaskDetailsDialog({
  open,
  projectIdentifier,
  issueId,
  issueTitle,
  chartScale,
  onTaskDatesUpdated,
  onClose
}: TaskDetailsDialogProps) {
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

  useEffect(() => {
    editingDateRangeRef.current = editingDateRange;
  }, [editingDateRange]);

  const currentRoot = drilldownPath[drilldownPath.length - 1] || { issueId, title: issueTitle };
  const currentRootIssueId = currentRoot.issueId;
  const currentRootIssueTitle = currentRoot.title;
  const selectedIssueId = selectedIssue?.issue_id ?? null;

  const syncSelectionAfterReload = useCallback((rows: TaskDetailIssue[], selectedIssueId?: number | null) => {
    if (!selectedIssueId) {
      selectIssue(null);
      return;
    }
    selectIssue(rows.find((row) => row.issue_id === selectedIssueId) || null);
  }, [selectIssue]);

  const {
    processFlowContainerRef,
    processFlowScaleMetrics,
    processFlowAxis,
    processFlowRenderSteps,
    processFlowChartHeight,
    processFlowLaneHeight,
    processFlowBaseTopPadding,
    startProcessFlowDrag,
    resetProcessFlowInteraction,
    handleProcessStepClick,
    handleProcessStepDoubleClick
  } = useTaskDetailsProcessFlow({
    open,
    loading,
    issues,
    currentRootIssueId,
    chartScale,
    issuesRef,
    savingIssueIdsRef,
    saveProcessFlowDates,
    selectIssue,
    setSelectedIssue,
    setDrilldownPath,
    reloadTaskDetails,
    syncSelectionAfterReload
  });

  const { treeRoots, registerIssueRowRef } = useTaskDetailsTree(issues, selectedIssueId);

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

  const handleColumnResize = useCallback((columnKey: string, deltaX: number) => {
    setColumnWidths((prev) => {
      const currentWidth = prev[columnKey] ?? DEFAULT_COLUMN_WIDTHS[columnKey] ?? 100;
      const nextWidth = Math.max(40, currentWidth + deltaX);
      const next = { ...prev, [columnKey]: nextWidth };
      localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleClose = useCallback(() => {
    if (hasAnyChangesRef.current) {
      onTaskDatesUpdated?.();
      hasAnyChangesRef.current = false;
    }
    setEditingDateRange(null);
    resetDialogState();
    resetLayoutState();
    resetProcessFlowInteraction();
    onClose();
  }, [onClose, onTaskDatesUpdated, resetDialogState, resetLayoutState, resetProcessFlowInteraction]);

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
  }, [open, handleClose, hasAnyChangesRef]);

  useEffect(() => {
    if (!open) return;
    setDrilldownPath([{ issueId, title: issueTitle }]);
    resetData();
    resetDialogState();
    resetLayoutState();
    resetProcessFlowInteraction();
    clearFeedback();
    void reloadTaskDetails(issueId).then((latestRows) => {
      const rootRow = latestRows.find((row) => row.issue_id === issueId);
      if (rootRow) {
        setDrilldownPath([{ issueId, title: rootRow.subject }]);
      }
      syncSelectionAfterReload(latestRows, null);
    });
  }, [
    clearFeedback,
    issueId,
    issueTitle,
    open,
    reloadTaskDetails,
    resetData,
    resetDialogState,
    resetLayoutState,
    resetProcessFlowInteraction,
    syncSelectionAfterReload
  ]);

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
  }, [handleDateChange]);

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
  }, [currentRootIssueId, handleFieldUpdate, selectedIssue?.issue_id, setSelectedIssue]);

  const handleSaveDescription = useCallback(async () => {
    if (!selectedIssue) return;
    try {
      await handleIssueFieldUpdate(selectedIssue.issue_id, 'description', descriptionDraft);
      setEditingDescription(false);
    } catch (error) {
      // Error is handled in handleFieldUpdate.
    }
  }, [descriptionDraft, handleIssueFieldUpdate, selectedIssue, setEditingDescription]);

  const handleAddComment = useCallback(async () => {
    if (!selectedIssue || !newCommentDraft.trim()) return;
    setIsSavingComment(true);
    try {
      await handleIssueFieldUpdate(selectedIssue.issue_id, 'notes', newCommentDraft.trim());
      setNewCommentDraft('');
    } catch (error) {
      // Error is handled in handleFieldUpdate.
    } finally {
      setIsSavingComment(false);
    }
  }, [handleIssueFieldUpdate, newCommentDraft, selectedIssue, setIsSavingComment, setNewCommentDraft]);

  const handleUpdateComment = useCallback(async (journalId: number, notes: string) => {
    if (!selectedIssue) return;
    const latestRows = await updateComment(journalId, notes, currentRootIssueId, selectedIssue.issue_id);
    cancelCommentEdit();
    if (latestRows) {
      syncSelectionAfterReload(latestRows, selectedIssue.issue_id);
    }
  }, [cancelCommentEdit, currentRootIssueId, selectedIssue, syncSelectionAfterReload, updateComment]);

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

  const handleReload = useCallback(() => {
    void reloadTaskDetails(currentRootIssueId).then((rows) => {
      syncSelectionAfterReload(rows, selectedIssue?.issue_id ?? null);
    });
  }, [currentRootIssueId, reloadTaskDetails, selectedIssue?.issue_id, syncSelectionAfterReload]);

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

  const dialogHeaderTitle = currentRootIssueTitle ? `${currentRootIssueTitle} #${currentRootIssueId}` : `#${currentRootIssueId}`;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[6px] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in" onClick={handleBackdropClick}>
      <div
        className="report-surface-elevated flex h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden font-sans transition-all transform animate-in slide-in-from-bottom-8 duration-700 ease-out"
        onClick={(event) => event.stopPropagation()}
        onMouseDownCapture={handleDialogMouseDownCapture}
      >
        <TaskDetailsHeader
          title={dialogHeaderTitle}
          drilldownPath={drilldownPath}
          density={density}
          densityMenuOpen={densityMenuOpen}
          issueCount={issues.length}
          onDensityMenuToggle={() => setDensityMenuOpen(!densityMenuOpen)}
          onDensityMenuClose={() => setDensityMenuOpen(false)}
          onDensityChange={handleDensityChange}
          onBreadcrumbClick={handleBreadcrumbClick}
          onReload={handleReload}
          onClose={handleClose}
        />
        {feedback ? (
          <div className={feedback.type === 'error' ? 'report-alert-error m-4 mb-0' : 'report-alert-info m-4 mb-0'} role="alert">
            {feedback.text}
          </div>
        ) : null}
        <TaskDetailsBody
          loading={loading}
          issues={issues}
          detailsLayoutRef={detailsLayoutRef}
          topPaneHeight={topPaneHeight}
          verticalResizeSession={verticalResizeSession}
          startVerticalResize={startVerticalResize}
          startVerticalResizeWithMouse={startVerticalResizeWithMouse}
          updateVerticalResize={updateVerticalResize}
          stopVerticalResize={stopVerticalResize}
          handleVerticalResizeKeyDown={handleVerticalResizeKeyDown}
          processFlowAxis={processFlowAxis}
          processFlowRenderSteps={processFlowRenderSteps}
          processFlowChartHeight={processFlowChartHeight}
          processFlowLaneHeight={processFlowLaneHeight}
          processFlowBaseTopPadding={processFlowBaseTopPadding}
          processFlowScaleMetrics={processFlowScaleMetrics}
          selectedIssueId={selectedIssueId}
          savingIssueIds={savingIssueIds}
          processFlowContainerRef={processFlowContainerRef}
          startProcessFlowDrag={startProcessFlowDrag}
          handleProcessStepClick={handleProcessStepClick}
          handleProcessStepDoubleClick={handleProcessStepDoubleClick}
          selectIssue={selectIssue}
          treeRoots={treeRoots}
          rootIssueId={issueId}
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
          registerIssueRowRef={registerIssueRowRef}
          masters={masters}
          onFieldUpdate={handleIssueFieldUpdate}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          density={density}
          selectedIssue={selectedIssue}
          editingDescription={editingDescription}
          descriptionDraft={descriptionDraft}
          newCommentDraft={newCommentDraft}
          isSavingComment={isSavingComment}
          editingCommentId={editingCommentId}
          editingCommentDraft={editingCommentDraft}
          onCloseSidePanel={() => selectIssue(null)}
          onEditSelectedIssue={() => {
            if (!selectedIssue) return;
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
      </div>
      <TaskDetailsEmbeddedDialogs
        projectIdentifier={projectIdentifier}
        createIssueContext={createIssueContext}
        editIssueContext={editIssueContext}
        viewIssueContext={viewIssueContext}
        issues={issues}
        currentRootIssueId={currentRootIssueId}
        hasAnyChangesRef={hasAnyChangesRef}
        onCloseCreateIssue={() => setCreateIssueContext(null)}
        onCloseEditIssue={() => setEditIssueContext(null)}
        onCloseViewIssue={() => setViewIssueContext(null)}
        reloadTaskDetails={reloadTaskDetails}
        syncSelectionAfterReload={syncSelectionAfterReload}
      />
    </div>
  );
}
