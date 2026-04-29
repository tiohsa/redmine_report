import { type Dispatch, type SetStateAction, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import { buildTimelineAxis } from '../timelineAxis';
import {
  buildProcessFlowRenderSteps,
  buildProcessFlowScaleMetrics,
  buildProcessFlowSteps,
  getProcessFlowLayout,
  getProcessFlowTimelineWidth,
  type ProcessFlowRenderStep
} from './processFlowGeometry';
import { type TreeNodeType } from './shared';
import { type DrilldownCrumb } from './TaskDetailsHeader';
import { useProcessFlowInteraction } from './useProcessFlowInteraction';

type UseTaskDetailsProcessFlowOptions = {
  open: boolean;
  loading: boolean;
  issues: TaskDetailIssue[];
  currentRootIssueId: number;
  chartScale?: number;
  issuesRef: React.MutableRefObject<TaskDetailIssue[]>;
  savingIssueIdsRef: React.MutableRefObject<Record<number, boolean>>;
  saveProcessFlowDates: (row: TaskDetailIssue, startDate: string, dueDate: string) => Promise<TaskDetailIssue | null>;
  selectIssue: (issue: TaskDetailIssue | null) => void;
  setSelectedIssue: Dispatch<SetStateAction<TreeNodeType | null>>;
  setActiveIssueId: Dispatch<SetStateAction<number | null>>;
  setDrilldownPath: Dispatch<SetStateAction<DrilldownCrumb[]>>;
  reloadTaskDetails: (issueId: number) => Promise<TaskDetailIssue[]>;
  syncSelectionAfterReload: (rows: TaskDetailIssue[], selectedIssueId?: number | null) => void;
};

export const useTaskDetailsProcessFlow = ({
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
  setActiveIssueId,
  setDrilldownPath,
  reloadTaskDetails,
  syncSelectionAfterReload
}: UseTaskDetailsProcessFlowOptions) => {
  const effectiveScale = chartScale ?? 1;
  const processFlowScaleMetrics = useMemo(() => buildProcessFlowScaleMetrics(effectiveScale), [effectiveScale]);
  const processFlowContainerRef = useRef<HTMLDivElement | null>(null);
  const [processFlowContainerWidth, setProcessFlowContainerWidth] = useState(0);

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
  }, [setSelectedIssue]);

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

  const handleProcessStepClick = useCallback((step: ProcessFlowRenderStep) => {
    if (consumeSuppressedProcessClick(step.id)) {
      return;
    }

    const issue = issuesRef.current.find((item) => item.issue_id === step.id) || null;
    if (!issue) return;

    selectIssue(issue);
    setActiveIssueId(issue.issue_id);
  }, [consumeSuppressedProcessClick, issuesRef, selectIssue, setActiveIssueId]);

  const handleProcessStepDoubleClick = useCallback((step: ProcessFlowRenderStep) => {
    if (!step.hasChildren) return;

    const issue = issuesRef.current.find((item) => item.issue_id === step.id) || null;
    if (!issue) return;

    setDrilldownPath((prev) => [...prev, { issueId: step.id, title: issue.subject }]);
    void reloadTaskDetails(step.id).then((rows) => {
      syncSelectionAfterReload(rows, null);
    });
  }, [issuesRef, reloadTaskDetails, setDrilldownPath, syncSelectionAfterReload]);

  return {
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
  };
};
