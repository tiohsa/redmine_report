import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { t } from '../../i18n';
import { updateTaskDates } from '../../services/scheduleReportApi';
import { getProgressFillColor, getProgressTrackColor } from './constants';
import { HeaderMonth, HeaderYear, TimelineLane, TimelineStep } from './timeline';
import { calculateStaggeredLanes } from './timelineAxis';
import { TaskDetailsDialog } from './TaskDetailsDialog';
import {
  drawStrokeText,
  prepareHiDPICanvas,
  truncateCanvasText
} from './canvasTimelineRenderer';
import { drawExecutiveBar } from './executiveTimelineRenderer';
import { reportStyles } from '../designSystem';

type TimelineChartProps = {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  todayX: number;
  axisStartDateIso: string;
  axisEndDateIso: string;
  pixelsPerDay: number;
  containerRef: RefObject<HTMLDivElement>;
  projectIdentifier: string;
  isProcessMode?: boolean;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
  showTitles?: boolean;
  onTaskDatesUpdated?: () => void;
};

type DragMode = 'move' | 'resize-left' | 'resize-right';

type DragSession = {
  stepId: string;
  issueId: number;
  pointerId: number;
  mode: DragMode;
  startClientX: number;
  originalStartIso: string;
  originalEndIso: string;
  currentStartIso: string;
  currentEndIso: string;
  moved: boolean;
};

type DragPreview = Pick<DragSession, 'currentStartIso' | 'currentEndIso'>;
type PendingPreview = DragPreview & { stepId: string; issueId: number };

type StepRenderData = {
  startIso?: string;
  endIso?: string;
  startLabel?: string;
  endLabel?: string;
  x: number;
  width: number;
};

const BASE_LANE_HEIGHT = 79;
const BASE_POINT_DEPTH = 22;
const BASE_BAR_HEIGHT = 36;
const PROCESS_PROGRESS_LABEL_OFFSET_Y = 18;
const yearRowHeight = 25;
const monthRowHeight = 25;
const headerHeight = yearRowHeight + monthRowHeight;
const TODAY_LABEL_WIDTH = 40;
const TODAY_LABEL_HEIGHT = 16;
const TODAY_LABEL_OFFSET_Y = 2;
const DRAG_THRESHOLD_PX = 4;
const RESIZE_HANDLE_PX = 10;
const MIN_CENTER_CLICK_PX = 14;
const MIN_HANDLE_ACTIVE_PX = 4;
const DATE_LABEL_INSET_PX = 8;
const SELECTED_BAR_STROKE = '#1456f0';
const SELECTED_BAR_DASH = [4, 2];
const CHEVRON_RIGHT_HEAD_RATIO = 0.62;
const TIMELINE_HEADER_FILL = '#fbfdff';
const TIMELINE_TEXT_SECONDARY = '#45515e';
const TIMELINE_BORDER = '#e5e7eb';
const TIMELINE_BORDER_LIGHT = '#f2f3f5';
const TIMELINE_BRAND = '#1456f0';
const TODAY_COLOR = '#ef4444';
const getLaneBackgroundStyle = () => ({
  baseFill: '#ffffff',
  labelClassName: 'bg-white'
});

const formatShortDate = (isoDate: string) => format(parseISO(isoDate), 'M/d');

const applyDateDrag = (session: DragSession, deltaDays: number): DragPreview => {
  const originalStart = parseISO(session.originalStartIso);
  const originalEnd = parseISO(session.originalEndIso);

  if (session.mode === 'move') {
    return {
      currentStartIso: format(addDays(originalStart, deltaDays), 'yyyy-MM-dd'),
      currentEndIso: format(addDays(originalEnd, deltaDays), 'yyyy-MM-dd')
    };
  }

  if (session.mode === 'resize-left') {
    const nextStart = addDays(originalStart, deltaDays);
    const clampedStart = nextStart > originalEnd ? originalEnd : nextStart;
    return {
      currentStartIso: format(clampedStart, 'yyyy-MM-dd'),
      currentEndIso: session.originalEndIso
    };
  }

  const nextEnd = addDays(originalEnd, deltaDays);
  const clampedEnd = nextEnd < originalStart ? originalStart : nextEnd;
  return {
    currentStartIso: session.originalStartIso,
    currentEndIso: format(clampedEnd, 'yyyy-MM-dd')
  };
};

const buildStepRenderData = (
  step: TimelineStep,
  preview: DragPreview | null,
  axisStartDate: Date,
  pixelsPerDay: number
): StepRenderData => {
  const startIso = preview?.currentStartIso || step.startDateIso;
  const endIso = preview?.currentEndIso || step.endDateIso;

  if (!startIso || !endIso || !Number.isFinite(pixelsPerDay) || pixelsPerDay <= 0) {
    return {
      x: step.x,
      width: step.width,
      startIso,
      endIso,
      startLabel: step.startDateStr,
      endLabel: step.endDateStr
    };
  }

  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const x = differenceInCalendarDays(start, axisStartDate) * pixelsPerDay;
  const width = Math.max(differenceInCalendarDays(end, start) + 1, 0.5) * pixelsPerDay;

  return {
    x,
    width,
    startIso,
    endIso,
    startLabel: formatShortDate(startIso),
    endLabel: formatShortDate(endIso)
  };
};

const getChevronRightHeadDepth = (width: number, pointDepth: number) =>
  Math.min(pointDepth * CHEVRON_RIGHT_HEAD_RATIO, Math.max(width * 0.16, 10));

export function TimelineChart({
  timelineData,
  timelineWidth,
  headerMonths,
  headerYears,
  todayX,
  axisStartDateIso,
  axisEndDateIso,
  pixelsPerDay,
  containerRef,
  projectIdentifier,
  isProcessMode = false,
  chartScale = 1,
  showAllDates = false,
  showTodayLine = true,
  showTitles = true,
  onTaskDatesUpdated,
}: TimelineChartProps) {
  const laneHeight = Math.round(BASE_LANE_HEIGHT * chartScale);
  const barHeight = Math.round(BASE_BAR_HEIGHT * chartScale);
  const barSpacingY = Math.round(17 * chartScale);

  const layoutData = useMemo<Array<TimelineLane & {
    contentHeight: number;
    steps: (TimelineStep & { laneIndex: number })[];
    height: number;
    yOffset: number;
    maxLane: number;
  }>>(() => {
    let currentY = 0;
    return timelineData.map((project) => {
      const staggeredSteps = calculateStaggeredLanes(
        project.steps,
        (step) => step.startDateIso,
        (step) => step.endDateIso
      );
      const maxLane = staggeredSteps.length > 0 ? Math.max(...staggeredSteps.map((s) => s.laneIndex)) : 0;
      const contentHeight = laneHeight + maxLane * (barHeight + barSpacingY);
      const height = contentHeight;
      const yOffset = currentY;
      currentY += height;
      return { ...project, contentHeight, steps: staggeredSteps, height, yOffset, maxLane };
    });
  }, [timelineData, laneHeight, barHeight, barSpacingY]);

  const totalTimelineHeight = layoutData.length > 0 ? layoutData[layoutData.length - 1].yOffset + layoutData[layoutData.length - 1].height : 0;

  const [activeIssue, setActiveIssue] = useState<{
    id: number;
    title: string;
    projectName: string;
    versionName: string;
  } | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [timelineEditError, setTimelineEditError] = useState<string | null>(null);

  const handleStepSelect = (stepId?: string) => {
    setSelectedStepId(stepId || null);
  };

  const handleBackgroundClick = () => {
    setSelectedStepId(null);
  };

  const handleStepOpen = (stepId?: string, issueId?: number, title?: string, projectName?: string, versionName?: string) => {
    if (!stepId || !issueId) return;
    setSelectedStepId(stepId);
    setActiveIssue({
      id: issueId,
      title: title || '',
      projectName: projectName || '',
      versionName: versionName || ''
    });
  };

  return (
    <>
      <div className={reportStyles.timelineShell} onClick={handleBackgroundClick}>
        <div className="flex min-w-max flex-none flex-col border-r border-[var(--color-border-light)] bg-white">
          <div className="flex items-center border-b border-[var(--color-border-light)] bg-[#fbfdff] px-6 text-[12px] font-sans font-semibold uppercase tracking-[0.12em] text-[#45515e]" style={{ height: headerHeight }}>
            {t('timeline.laneHeader')}
          </div>
          {layoutData.map((project, projectIndex) => {
            const laneBackground = getLaneBackgroundStyle();

            return (
              <div
                key={project.laneKey}
                data-testid={`timeline-lane-label-${projectIndex}`}
                className={`${reportStyles.timelineLaneLabel} ${laneBackground.labelClassName}`}
                style={{ height: project.height, minHeight: 60 }}
              >
                <div className={`${reportStyles.timelineLaneAction} relative`} style={{ height: project.contentHeight }}>
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {project.versionId ? (
                        <a
                          href={`/versions/${project.versionId}`}
                          className="text-[14px] font-display font-medium text-[var(--color-brand-6)] hover:text-[var(--color-primary-700)] hover:underline"
                          title={project.versionName}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.versionName}
                        </a>
                      ) : (
                        <div className="text-[14px] font-display font-medium text-[#222222]" title={project.versionName}>
                          {project.versionName}
                        </div>
                      )}
                      {project.projectIdentifier ? (
                        <a
                          href={`/projects/${project.projectIdentifier}`}
                          className="mt-1 block text-[12px] font-sans text-[var(--color-brand-6)] hover:text-[var(--color-primary-700)] hover:underline"
                          title={project.projectName}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.projectName}
                        </a>
                      ) : (
                        <div className="mt-1 text-[12px] font-sans text-[#45515e]" title={project.projectName}>
                          {project.projectName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {timelineData.length === 0 && <div className="h-32"></div>}
        </div>

        <div className={reportStyles.timelineCanvasScroller} ref={containerRef}>
          <TimelineChartSurface
            layoutData={layoutData}
            totalTimelineHeight={totalTimelineHeight}
            timelineWidth={timelineWidth}
            headerMonths={headerMonths}
            headerYears={headerYears}
            todayX={todayX}
            axisStartDateIso={axisStartDateIso}
            axisEndDateIso={axisEndDateIso}
            pixelsPerDay={pixelsPerDay}
            projectIdentifier={projectIdentifier}
            isProcessMode={isProcessMode}
            onStepSelect={handleStepSelect}
            onStepOpen={handleStepOpen}
            selectedStepId={selectedStepId}
            laneHeight={laneHeight}
            chartScale={chartScale}
            showAllDates={showAllDates}
            showTodayLine={showTodayLine}
            showTitles={showTitles}
            onTaskDatesUpdated={onTaskDatesUpdated}
            onEditError={setTimelineEditError}
          />
        </div>

      </div>

      {timelineEditError && (
        <div className={`mt-3 ${reportStyles.alertWarning}`} role="alert">
          {timelineEditError}
        </div>
      )}

      {activeIssue && (
        <TaskDetailsDialog
          open
          projectIdentifier={projectIdentifier}
          issueId={activeIssue.id}
          issueTitle={activeIssue.title}
          projectName={activeIssue.projectName}
          versionName={activeIssue.versionName}
          chartScale={chartScale}
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={() => setActiveIssue(null)}
        />
      )}
    </>
  );
}

function TimelineChartSurface({
  layoutData,
  totalTimelineHeight,
  timelineWidth,
  headerMonths,
  headerYears,
  todayX,
  axisStartDateIso,
  axisEndDateIso,
  pixelsPerDay,
  projectIdentifier,
  isProcessMode,
  onStepSelect,
  onStepOpen,
  onTaskDatesUpdated,
  onEditError,
  selectedStepId,
  laneHeight,
  chartScale = 1,
  showAllDates,
  showTodayLine = true,
  showTitles = true
}: {
  layoutData: (TimelineLane & {
    contentHeight: number;
    steps: (TimelineStep & { laneIndex: number })[];
    height: number;
    yOffset: number;
    maxLane: number;
  })[];
  totalTimelineHeight: number;
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  todayX: number;
  axisStartDateIso: string;
  axisEndDateIso: string;
  pixelsPerDay: number;
  projectIdentifier: string;
  isProcessMode: boolean;
  onStepSelect: (stepId?: string) => void;
  onStepOpen: (stepId?: string, issueId?: number, title?: string, projectName?: string, versionName?: string) => void;
  onTaskDatesUpdated?: () => void;
  onEditError?: (message: string | null) => void;
  selectedStepId?: string | null;
  laneHeight: number;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
  showTitles?: boolean;
}) {
  const chartHeight = Math.ceil(headerHeight + totalTimelineHeight);
  const scaledBarHeight = Math.round(BASE_BAR_HEIGHT * chartScale);
  const scaledBarSpacingY = Math.round(17 * chartScale);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [savingIssueId, setSavingIssueId] = useState<number | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [suppressClickStepId, setSuppressClickStepId] = useState<string | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const axisStartDate = parseISO(axisStartDateIso);
  useEffect(() => {
    dragSessionRef.current = dragSession;
  }, [dragSession]);

  useEffect(() => {
    if (!dragSession) return;

    const handlePointerMove = (event: PointerEvent) => {
      const current = dragSessionRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!Number.isFinite(pixelsPerDay) || pixelsPerDay <= 0) return;

      event.preventDefault();
      const deltaX = event.clientX - current.startClientX;
      const deltaDays = Math.round(deltaX / pixelsPerDay);
      const preview = applyDateDrag(current, deltaDays);
      const moved = current.moved || Math.abs(deltaX) >= DRAG_THRESHOLD_PX;
      const next: DragSession = {
        ...current,
        currentStartIso: preview.currentStartIso,
        currentEndIso: preview.currentEndIso,
        moved
      };
      dragSessionRef.current = next;
      setDragSession(next);
    };

    const finishDrag = (event: PointerEvent) => {
      const current = dragSessionRef.current;
      if (!current || event.pointerId !== current.pointerId) return;

      dragSessionRef.current = null;
      setDragSession(null);
      setSuppressClickStepId(current.moved ? current.stepId : null);

      const changed = current.originalStartIso !== current.currentStartIso || current.originalEndIso !== current.currentEndIso;
      if (!changed) return;

      onEditError?.(null);
      setPendingPreview({
        stepId: current.stepId,
        issueId: current.issueId,
        currentStartIso: current.currentStartIso,
        currentEndIso: current.currentEndIso
      });
      setSavingIssueId(current.issueId);

      void (async () => {
        try {
          await updateTaskDates(projectIdentifier, current.issueId, {
            start_date: current.currentStartIso,
            due_date: current.currentEndIso
          });
          onTaskDatesUpdated?.();
        } catch (error) {
          setPendingPreview((prev) => (prev?.stepId === current.stepId ? null : prev));
          onEditError?.(
            error instanceof Error && error.message
              ? error.message
              : t('api.updateTaskDates', { status: 0, defaultValue: 'Failed to update task dates' })
          );
        } finally {
          setSavingIssueId((prev) => (prev === current.issueId ? null : prev));
        }
      })();
    };

    const handlePointerCancel = (event: PointerEvent) => finishDrag(event);
    const handlePointerUp = (event: PointerEvent) => finishDrag(event);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragSession, pixelsPerDay, projectIdentifier, onTaskDatesUpdated, onEditError]);

  useEffect(() => {
    setSuppressClickStepId(null);
    setPendingPreview(null);
  }, [layoutData]);

  useEffect(() => {
    if (!selectedStepId) return;
    const hasSelectedStep = layoutData.some((lane) => lane.steps.some((step) => step.id === selectedStepId));
    if (!hasSelectedStep) {
      onStepSelect(undefined);
    }
  }, [layoutData, onStepSelect, selectedStepId]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const renderedProjects = useMemo(() => {
    return layoutData.map((project) => {
      const yOffset = headerHeight + project.yOffset;
      const laneBackground = getLaneBackgroundStyle();
      const stepItems = (project.steps as Array<TimelineStep & { laneIndex: number }>).map((step, stepIndex) => {
        const isFirst = stepIndex === 0;
        const pointDepth = Math.round(BASE_POINT_DEPTH * chartScale);
        const totalBarsHeight = (project.maxLane + 1) * scaledBarHeight + project.maxLane * scaledBarSpacingY;
        const baseTopPadding = (project.contentHeight - totalBarsHeight) / 2;
        const verticalOffset = baseTopPadding + step.laneIndex * (scaledBarHeight + scaledBarSpacingY);
        const fontSize = Math.max(10, Math.round(12 * chartScale));
        const isInProgress = step.status.code === 'IN_PROGRESS';
        const fill = getProgressFillColor(step.progress ?? 0);
        const isDraggingThis = dragSession?.stepId === step.id;
        const isActiveDragThis = Boolean(isDraggingThis && dragSession?.moved);
        const getStepPreview = (targetStep: TimelineStep): DragPreview | null => {
          if (dragSession?.stepId === targetStep.id) {
            return { currentStartIso: dragSession.currentStartIso, currentEndIso: dragSession.currentEndIso };
          }
          if (pendingPreview?.stepId === targetStep.id) {
            return { currentStartIso: pendingPreview.currentStartIso, currentEndIso: pendingPreview.currentEndIso };
          }
          return null;
        };
        const preview = getStepPreview(step);
        const renderData = buildStepRenderData(step, preview, axisStartDate, pixelsPerDay);
        const prevStep = stepIndex > 0 ? project.steps[stepIndex - 1] : null;
        const prevRenderData = prevStep
          ? buildStepRenderData(prevStep, getStepPreview(prevStep), axisStartDate, pixelsPerDay)
          : null;
        const joinsPrevious = Boolean(
          prevRenderData?.endIso &&
          renderData.startIso &&
          differenceInCalendarDays(parseISO(renderData.startIso), parseISO(prevRenderData.endIso)) === 1
        );
        const barX = renderData.x;
        const barWidth = renderData.width;
        const hitX = renderData.x;
        const hitWidth = Math.max(renderData.width, 1);
        const taskCenterX = barX + barWidth / 2;
        const startLabelX = barX + DATE_LABEL_INSET_PX;
        const endLabelX = renderData.startLabel === renderData.endLabel ? taskCenterX : barX + barWidth - DATE_LABEL_INSET_PX;
        const hasPendingPreview = pendingPreview?.stepId === step.id;
        const isSelected = selectedStepId === step.id;
        const canEdit = Boolean(
          isProcessMode &&
          step.editable &&
          step.issueId &&
          renderData.startIso &&
          renderData.endIso &&
          savingIssueId === null &&
          !pendingPreview &&
          !dragSessionRef.current
        );
        const isSavingThis = savingIssueId === step.issueId;
        const rawHandleWidth = Math.min(RESIZE_HANDLE_PX, Math.max(4, hitWidth / 3));
        const maxHandleWidthByCenter = Math.max(0, (hitWidth - MIN_CENTER_CLICK_PX) / 2);
        const handleWidth = Math.min(rawHandleWidth, maxHandleWidthByCenter);
        const enableResizeHandles = handleWidth >= MIN_HANDLE_ACTIVE_PX;
        const leftHandleX = hitX;
        const rightHandleX = Math.max(hitX + hitWidth - handleWidth, hitX);
        const bodyCursor = canEdit
          ? 'move'
          : step.issueId
            ? 'pointer'
            : 'default';

        return {
          step,
          barX,
          barWidth,
          baseTopPadding,
          bodyCursor,
          canEdit,
          enableResizeHandles,
          endLabelX,
          fill,
          fontSize,
          handleWidth,
          hasPendingPreview,
          hitWidth,
          hitX,
          isActiveDragThis,
          isDraggingThis,
          isFirst,
          isInProgress,
          isSavingThis,
          isSelected,
          joinsPrevious,
          leftHandleX,
          pointDepth,
          renderData,
          rightHandleX,
          startLabelX,
          taskCenterX,
          verticalOffset,
          zIndex: isActiveDragThis ? 10 : isSelected ? 9 : isSavingThis || hasPendingPreview ? 8 : isInProgress ? 1 : 0
        };
      });

      return {
        laneBackground,
        project,
        stepItems,
        yOffset
      };
    });
  }, [
    axisStartDate,
    chartScale,
    dragSession,
    isProcessMode,
    layoutData,
    pendingPreview,
    pixelsPerDay,
    selectedStepId,
    savingIssueId,
    scaledBarHeight,
    scaledBarSpacingY
  ]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const context = prepareHiDPICanvas(canvasRef.current, timelineWidth, chartHeight);
    if (!context) return;

    context.clearRect(0, 0, timelineWidth, chartHeight);

    context.fillStyle = TIMELINE_HEADER_FILL;
    context.fillRect(0, 0, timelineWidth, yearRowHeight);
    context.fillRect(0, yearRowHeight, timelineWidth, monthRowHeight);
    context.strokeStyle = TIMELINE_BORDER;
    context.lineWidth = 1;
    context.strokeRect(0, 0, timelineWidth, yearRowHeight);
    context.strokeRect(0, yearRowHeight, timelineWidth, monthRowHeight);

    headerYears.forEach((year) => {
      context.strokeStyle = TIMELINE_BORDER;
      context.strokeRect(year.x, 0, year.width, yearRowHeight);
      drawStrokeText(context, {
        text: year.year,
        x: year.x + year.width / 2,
        y: yearRowHeight / 2,
        fill: TIMELINE_TEXT_SECONDARY,
        stroke: TIMELINE_HEADER_FILL,
        strokeWidth: 0,
        font: '600 12px "DM Sans", sans-serif'
      });
    });

    headerMonths.forEach((month) => {
      context.strokeStyle = TIMELINE_BORDER;
      context.strokeRect(month.x, yearRowHeight, month.width, monthRowHeight);
      drawStrokeText(context, {
        text: month.label,
        x: month.x + month.width / 2,
        y: yearRowHeight + monthRowHeight / 2,
        fill: TIMELINE_TEXT_SECONDARY,
        stroke: TIMELINE_HEADER_FILL,
        strokeWidth: 0,
        font: '600 12px "DM Sans", sans-serif'
      });
    });

    if (showTodayLine && todayX >= 0 && todayX <= timelineWidth) {
      context.fillStyle = TODAY_COLOR;
      context.fillRect(
        todayX - TODAY_LABEL_WIDTH / 2,
        headerHeight + TODAY_LABEL_OFFSET_Y,
        TODAY_LABEL_WIDTH,
        TODAY_LABEL_HEIGHT
      );
      drawStrokeText(context, {
        text: format(new Date(), 'M/d'),
        x: todayX,
        y: headerHeight + TODAY_LABEL_OFFSET_Y + 12,
        fill: '#ffffff',
        stroke: TODAY_COLOR,
        strokeWidth: 0,
        font: '700 10px "Roboto", sans-serif'
      });
    }

    renderedProjects.forEach(({ laneBackground, project, stepItems, yOffset }) => {
      context.fillStyle = laneBackground.baseFill;
      context.fillRect(0, yOffset, timelineWidth, project.height);

      context.strokeStyle = TIMELINE_BORDER;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, yOffset + project.height);
      context.lineTo(timelineWidth, yOffset + project.height);
      context.stroke();

      headerMonths.forEach((month) => {
        context.save();
        context.strokeStyle = TIMELINE_BORDER_LIGHT;
        context.setLineDash([4, 2]);
        context.beginPath();
        context.moveTo(month.x, yOffset);
        context.lineTo(month.x, yOffset + project.height);
        context.stroke();
        context.restore();
      });

      stepItems
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .forEach((item) => {
          const top = yOffset + item.verticalOffset;
          drawExecutiveBar(context, {
            x: item.barX,
            y: top,
            width: Math.max(item.barWidth, 1),
            height: scaledBarHeight,
            fill: item.fill,
            progress: item.step.progress,
            label: showTitles ? item.step.name : undefined,
            chartScale
          });

          if (item.renderData.startLabel && (showAllDates || hoveredStepId === item.step.id || item.isActiveDragThis) && item.renderData.startLabel !== item.renderData.endLabel) {
            drawStrokeText(context, {
              text: item.renderData.startLabel,
              x: item.startLabelX,
              y: top - 6,
              fill: item.step.status.dateText || '#475569',
              stroke: '#ffffff',
              strokeWidth: 2,
              font: '700 10px "Roboto", sans-serif',
              textAlign: 'start'
            });
          }

          if (item.renderData.endLabel && (showAllDates || hoveredStepId === item.step.id || item.isActiveDragThis)) {
            drawStrokeText(context, {
              text: item.renderData.endLabel,
              x: item.endLabelX,
              y: top - 6,
              fill: item.step.status.dateText || '#475569',
              stroke: '#ffffff',
              strokeWidth: 2,
              font: '700 10px "Roboto", sans-serif',
              textAlign: item.renderData.startLabel === item.renderData.endLabel ? 'center' : 'end'
            });
          }

          if (item.isSelected || item.isActiveDragThis || item.isSavingThis || item.hasPendingPreview) {
            if (item.isSelected) {
              const radius = scaledBarHeight / 2;
              context.save();
              context.strokeStyle = SELECTED_BAR_STROKE;
              context.lineWidth = 1.5;
              context.setLineDash(SELECTED_BAR_DASH);
              context.shadowColor = 'rgba(20, 86, 240, 0.24)';
              context.shadowBlur = 6;
              context.shadowOffsetX = 0;
              context.shadowOffsetY = 1;
              context.beginPath();
              context.roundRect(item.barX - 1.5, top - 1.5, Math.max(item.barWidth, 1) + 3, scaledBarHeight + 3, radius + 1.5);
              context.stroke();
              context.restore();
            } else {
              context.save();
              context.strokeStyle = item.isSavingThis
                ? TIMELINE_BRAND
                : item.hasPendingPreview
                  ? '#0891b2'
                  : '#0ea5e9';
              context.lineWidth = 2;
              context.setLineDash(item.isSavingThis || item.hasPendingPreview ? [4, 2] : []);
              context.beginPath();
              context.roundRect(item.barX, top, Math.max(item.barWidth, 1), scaledBarHeight, 6);
              context.stroke();
              context.restore();
            }
          }
        });

    });

    if (showTodayLine && todayX >= 0 && todayX <= timelineWidth) {
      context.save();
      context.strokeStyle = TODAY_COLOR;
      context.setLineDash([4, 2]);
      context.beginPath();
      context.moveTo(todayX, headerHeight);
      context.lineTo(todayX, headerHeight + totalTimelineHeight);
      context.stroke();
      context.restore();
    }
  }, [
    chartScale,
    headerMonths,
    headerYears,
    hoveredStepId,
    laneHeight,
    renderedProjects,
    scaledBarHeight,
    showAllDates,
    showTodayLine,
    chartHeight,
    timelineWidth,
    todayX
  ]);

  if (layoutData.length === 0) {
    return <div className="flex items-center justify-center h-32 text-gray-400">{t('common.noData')}</div>;
  }

  return (
    <div className="relative" style={{ minHeight: chartHeight, minWidth: `${timelineWidth}px`, width: timelineWidth }}>
      <canvas
        ref={canvasRef}
        data-testid="timeline-chart-canvas"
        className="absolute inset-0 block"
        style={{ width: `${timelineWidth}px`, height: `${chartHeight}px`, pointerEvents: 'none' }}
        aria-hidden="true"
      />
      <svg
        viewBox={`0 0 ${timelineWidth} ${chartHeight}`}
        className="relative block w-full"
        style={{ minHeight: chartHeight, minWidth: `${timelineWidth}px`, opacity: 0 }}
      >
      {layoutData.map((project) => {
        const yOffset = headerHeight + project.yOffset;

        return (
          <g key={project.laneKey} transform={`translate(0, ${yOffset})`}>
            {(project.steps as Array<TimelineStep & { laneIndex: number }>)
              .map((step, stepIndex) => {
                const isFirst = stepIndex === 0;
                const pointDepth = Math.round(BASE_POINT_DEPTH * chartScale);
                const barHeight = Math.round(BASE_BAR_HEIGHT * chartScale);
                const barSpacingY = Math.round(17 * chartScale);
                const totalBarsHeight = (project.maxLane + 1) * barHeight + project.maxLane * barSpacingY;
                const baseTopPadding = (project.contentHeight - totalBarsHeight) / 2;
                const verticalOffset = baseTopPadding + step.laneIndex * (barHeight + barSpacingY);
                const fontSize = Math.max(10, Math.round(12 * chartScale));
                const isInProgress = step.status.code === 'IN_PROGRESS';
                const fill = getProgressFillColor(step.progress ?? 0);
                const isDraggingThis = dragSession?.stepId === step.id;
                const isActiveDragThis = Boolean(isDraggingThis && dragSession?.moved);
                const getStepPreview = (targetStep: TimelineStep): DragPreview | null => {
                  if (dragSession?.stepId === targetStep.id) {
                    return { currentStartIso: dragSession.currentStartIso, currentEndIso: dragSession.currentEndIso };
                  }
                  if (pendingPreview?.stepId === targetStep.id) {
                    return { currentStartIso: pendingPreview.currentStartIso, currentEndIso: pendingPreview.currentEndIso };
                  }
                  return null;
                };
                const preview = getStepPreview(step);
                const renderData = buildStepRenderData(step, preview, axisStartDate, pixelsPerDay);
                const prevStep = stepIndex > 0 ? project.steps[stepIndex - 1] : null;
                const prevRenderData = prevStep
                  ? buildStepRenderData(prevStep, getStepPreview(prevStep), axisStartDate, pixelsPerDay)
                  : null;
                const joinsPrevious = Boolean(
                  prevRenderData?.endIso &&
                  renderData.startIso &&
                  differenceInCalendarDays(parseISO(renderData.startIso), parseISO(prevRenderData.endIso)) === 1
                );
                const barX = renderData.x;
                const barWidth = renderData.width;
                const hitX = renderData.x;
                const hitWidth = Math.max(renderData.width, 1);
                const rightBaseX = barX + Math.max(barWidth - pointDepth, DATE_LABEL_INSET_PX);
                const taskCenterX = barX + barWidth / 2;
                const startLabelX = barX + DATE_LABEL_INSET_PX;
                const endLabelX = renderData.startLabel === renderData.endLabel ? taskCenterX : rightBaseX - DATE_LABEL_INSET_PX;
                const hasPendingPreview = pendingPreview?.stepId === step.id;
                const isSelected = selectedStepId === step.id;
                const canEdit = Boolean(
                  isProcessMode &&
                  step.editable &&
                  step.issueId &&
                  renderData.startIso &&
                  renderData.endIso &&
                  savingIssueId === null &&
                  !pendingPreview &&
                  !dragSessionRef.current
                );
                const isSavingThis = savingIssueId === step.issueId;
                const rawHandleWidth = Math.min(RESIZE_HANDLE_PX, Math.max(4, hitWidth / 3));
                const maxHandleWidthByCenter = Math.max(0, (hitWidth - MIN_CENTER_CLICK_PX) / 2);
                const handleWidth = Math.min(rawHandleWidth, maxHandleWidthByCenter);
                const enableResizeHandles = handleWidth >= MIN_HANDLE_ACTIVE_PX;
                const leftHandleX = hitX;
                const rightHandleX = Math.max(hitX + hitWidth - handleWidth, hitX);
                const bodyCursor = canEdit
                  ? 'move'
                  : step.issueId
                    ? 'pointer'
                    : 'default';

                const startDrag = (event: ReactPointerEvent<SVGElement>, mode: DragMode) => {
                  if (!canEdit || !step.issueId || !renderData.startIso || !renderData.endIso) return;
                  if (mode !== 'move') {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  onEditError?.(null);
                  if (mode !== 'move') {
                    setSuppressClickStepId(step.id);
                  }
                  const next: DragSession = {
                    stepId: step.id,
                    issueId: step.issueId,
                    pointerId: event.pointerId,
                    mode,
                    startClientX: event.clientX,
                    originalStartIso: renderData.startIso,
                    originalEndIso: renderData.endIso,
                    currentStartIso: renderData.startIso,
                    currentEndIso: renderData.endIso,
                    moved: false
                  };
                  dragSessionRef.current = next;
                  setDragSession(next);
                };

                return {
                  zIndex: isActiveDragThis ? 10 : isSavingThis || hasPendingPreview ? 9 : isInProgress ? 1 : 0,
                  element: (
                    <g
                      key={step.id}
                      transform={`translate(0, ${verticalOffset})`}
                      onMouseEnter={() => setHoveredStepId(step.id)}
                      onMouseLeave={() => setHoveredStepId((prev) => (prev === step.id ? null : prev))}
                      opacity={isSavingThis ? 0.65 : 1}
                    >
                        <rect
                          x={hitX}
                          y={0}
                          width={hitWidth}
                          height={barHeight}
                          fill="transparent"
                          style={{ cursor: bodyCursor, touchAction: 'none' }}
                          data-selected={isSelected ? 'true' : 'false'}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressClickStepId === step.id) {
                              setSuppressClickStepId(null);
                              return;
                            }
                            onStepSelect(step.id);
                          }}
                          onDoubleClick={() => onStepOpen(step.id, step.issueId, step.name, project.projectName, project.versionName)}
                          onPointerDown={(event) => startDrag(event, 'move')}
                          data-step-id={step.id}
                          data-step-issue-id={step.issueId || undefined}
                        >
                          <title>{step.name}</title>
                        </rect>
                      {isProcessMode && step.editable && enableResizeHandles && (
                        <>
                          <rect
                            x={leftHandleX}
                            y={0}
                            width={handleWidth}
                            height={barHeight}
                            fill="transparent"
                            style={{ cursor: canEdit ? 'ew-resize' : 'default', touchAction: 'none' }}
                            onPointerDown={(event) => startDrag(event, 'resize-left')}
                          />
                          <rect
                            x={rightHandleX}
                            y={0}
                            width={handleWidth}
                            height={barHeight}
                            fill="transparent"
                            style={{ cursor: canEdit ? 'ew-resize' : 'default', touchAction: 'none' }}
                            onPointerDown={(event) => startDrag(event, 'resize-right')}
                          />
                        </>
                      )}

                    </g>
                  )
                };
              })
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((item) => item.element)}
          </g>
        );
      })}

      </svg>
    </div>
  );
}
