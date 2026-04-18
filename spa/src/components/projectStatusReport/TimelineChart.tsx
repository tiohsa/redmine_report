import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { t } from '../../i18n';
import { updateTaskDates } from '../../services/scheduleReportApi';
import { AiResponsePanel } from '../AiResponsePanel';
import { getProgressFillColor, getProgressTrackColor } from './constants';
import { HeaderMonth, HeaderYear, TimelineLane, TimelineStep } from './timeline';
import { calculateStaggeredLanes } from './timelineAxis';
import { TaskDetailsDialog } from './TaskDetailsDialog';
import type { AiResponseView } from '../../types/weeklyReport';
import {
  drawChevron,
  drawStrokeText,
  prepareHiDPICanvas,
  truncateCanvasText
} from './canvasTimelineRenderer';

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
  onVersionAiClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string }) => void;
  onVersionReportClick?: (payload: { laneKey: string; versionId: number; versionName: string; projectId: number; projectName: string; projectIdentifier: string }) => void;
  onTaskDatesUpdated?: () => void;
  activeReportLaneKey?: string | null;
  detailedReportResponse?: AiResponseView | null;
  detailedReportLoading?: boolean;
  detailedReportError?: string | null;
  onClearSelection?: () => void;
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

type InlineReportSlotProps = {
  response: AiResponseView | null;
  isLoading: boolean;
  errorMessage: string | null;
};

type StepRenderData = {
  startIso?: string;
  endIso?: string;
  startLabel?: string;
  endLabel?: string;
  x: number;
  width: number;
};

const BASE_LANE_HEIGHT = 122;
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
const ACTIVE_LANE_BACKGROUND_FILL = '#f9fafb';
const ALT_LANE_BACKGROUND_FILL = '#ffffff';
const INLINE_REPORT_SLOT_HEIGHT = 392;
const DATE_LABEL_INSET_PX = 8;
const SELECTED_BAR_STROKE = '#1456f0';
const SELECTED_BAR_DASH = [6, 4];
const CHEVRON_RIGHT_HEAD_RATIO = 0.62;


const getLaneBackgroundStyle = (laneIndex: number, isActive: boolean) => ({
  labelClassName: isActive ? 'bg-[var(--color-brand-10)]' : 'bg-white',
  baseFill: isActive ? ACTIVE_LANE_BACKGROUND_FILL : (laneIndex % 2 === 0 ? '#ffffff' : '#fafafa')
});

const InlineReportSlot = ({ response, isLoading, errorMessage }: InlineReportSlotProps) => (
  <section className="flex h-full flex-col gap-4 overflow-hidden rounded-[24px] border border-gray-200 bg-white p-6 shadow-brand-glow animate-in fade-in slide-in-from-top-4 duration-500 font-sans">
    <div className="min-h-0 flex-1 overflow-auto">
      <AiResponsePanel response={response} isLoading={isLoading} errorMessage={errorMessage} />
    </div>
  </section>
);

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

const drawTimelineChevronSelectionOutline = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pointDepth: number
) => {
  const rightHeadDepth = getChevronRightHeadDepth(width, pointDepth);
  const leftEdgeX = x - 3;
  const topY = y - 3;
  const bottomY = y + height + 3;
  const rightBaseX = x + Math.max(width - rightHeadDepth, 4);
  const rightTipX = x + width;

  context.save();
  context.strokeStyle = SELECTED_BAR_STROKE;
  context.lineWidth = 2;
  context.setLineDash(SELECTED_BAR_DASH);
  context.shadowColor = 'rgba(20, 86, 240, 0.24)';
  context.shadowBlur = 6;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 1;
  context.beginPath();
  context.moveTo(leftEdgeX, topY);
  context.lineTo(leftEdgeX, bottomY);
  context.lineTo(rightBaseX + 3, bottomY);
  context.lineTo(rightTipX + 3, y + height / 2);
  context.lineTo(rightBaseX + 3, topY);
  context.closePath();
  context.stroke();
  context.restore();
};

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
  onVersionAiClick,
  onVersionReportClick,
  onTaskDatesUpdated,
  activeReportLaneKey,
  detailedReportResponse = null,
  detailedReportLoading = false,
  detailedReportError = null,
  onClearSelection
}: TimelineChartProps) {
  const laneHeight = Math.round(BASE_LANE_HEIGHT * chartScale);
  const barHeight = Math.round(BASE_BAR_HEIGHT * chartScale);
  const barSpacingY = Math.round(17 * chartScale);

  const layoutData = useMemo<Array<TimelineLane & {
    contentHeight: number;
    reportHeight: number;
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
      const reportHeight = project.laneKey === activeReportLaneKey ? INLINE_REPORT_SLOT_HEIGHT : 0;
      const height = contentHeight + reportHeight;
      const yOffset = currentY;
      currentY += height;
      return { ...project, contentHeight, reportHeight, steps: staggeredSteps, height, yOffset, maxLane };
    });
  }, [timelineData, laneHeight, barHeight, barSpacingY, activeReportLaneKey]);

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

  const handleBackgroundClick = (event: React.MouseEvent) => {
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
      <div
        className="flex border border-gray-200 rounded-lg overflow-hidden"
        onClick={handleBackgroundClick}
      >
        <div className="flex-none min-w-max bg-white border-r border-gray-200 flex flex-col">
          <div className="flex items-center px-6 font-bold text-gray-600 text-xs bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            {t('timeline.laneHeader')}
          </div>
          {layoutData.map((project, projectIndex) => {
            const laneBackground = getLaneBackgroundStyle(projectIndex, project.laneKey === activeReportLaneKey);
            const isActiveReportLane = project.laneKey === activeReportLaneKey;

            return (
              <div
                key={project.laneKey}
                data-testid={`timeline-lane-label-${projectIndex}`}
                className={`flex flex-col border-b border-slate-300 box-border whitespace-nowrap transition-colors duration-300 ${laneBackground.labelClassName}`}
                style={{ height: project.height, minHeight: 60 }}
              >
                <div
                  className={`flex flex-col justify-center px-6 whitespace-nowrap transition-colors duration-300 ${project.versionId && !isActiveReportLane ? 'cursor-pointer hover:bg-sky-50/50' : ''}`}
                  style={{ height: project.contentHeight }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (project.versionId && !isActiveReportLane) {
                      onVersionReportClick?.({
                        laneKey: project.laneKey,
                        versionId: project.versionId as number,
                        versionName: project.versionName,
                        projectId: project.projectId,
                        projectName: project.projectName,
                        projectIdentifier: project.projectIdentifier
                      });
                    }
                  }}
                >
                  {project.versionId ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={`/versions/${project.versionId}`}
                        className="text-[14px] font-display font-medium text-[var(--color-brand-6)] hover:text-[var(--color-primary-700)] hover:underline"
                        title={project.versionName}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {project.versionName}
                      </a>
                      <button
                        type="button"
                        aria-label={t('timeline.startAiAria', { versionName: project.versionName })}
                        className="group h-8 px-3 flex items-center gap-2 rounded-[9999px] border border-gray-100 bg-white hover:border-[var(--color-brand-6)] hover:bg-[var(--color-primary-200)] transition-all duration-300 shadow-subtle cursor-pointer overflow-hidden relative"
                        onClick={(event) => {
                          event.stopPropagation();
                          onVersionAiClick?.({
                            versionId: project.versionId as number,
                            versionName: project.versionName,
                            projectId: project.projectId,
                            projectName: project.projectName
                          });
                        }}
                      >
                        <svg
                          className="w-4 h-4 relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <defs>
                            <linearGradient id={`ai-grad-${project.versionId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#6366f1" />
                              <stop offset="100%" stopColor="#a855f7" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M12 3L14.5 9L21 11.5L14.5 14L12 21L9.5 14L3 11.5L9.5 9L12 3Z"
                            fill={`url(#ai-grad-${project.versionId})`}
                          />
                        </svg>
                        <span className="text-[11px] font-semibold text-[#45515e] group-hover:text-[var(--color-brand-6)]">AI</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('timeline.showDetailAria', { versionName: project.versionName })}
                        className="group h-8 px-3 flex items-center gap-2 rounded-[9999px] border border-gray-100 bg-white hover:border-[var(--color-brand-6)] hover:bg-[var(--color-primary-200)] transition-all duration-300 shadow-subtle cursor-pointer overflow-hidden relative"
                        onClick={(event) => {
                          event.stopPropagation();
                          onVersionReportClick?.({
                            laneKey: project.laneKey,
                            versionId: project.versionId as number,
                            versionName: project.versionName,
                            projectId: project.projectId,
                            projectName: project.projectName,
                            projectIdentifier: project.projectIdentifier
                          });
                        }}
                      >
                        <svg
                          className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:scale-110"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-[11px] font-semibold text-[#45515e] group-hover:text-[var(--color-brand-6)]">{t('common.detail', { defaultValue: 'Detail' })}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[14px] font-display font-medium text-[#222222]" title={project.versionName}>
                      {project.versionName}
                    </div>
                  )}
                   {project.projectIdentifier ? (
                    <a
                      href={`/projects/${project.projectIdentifier}`}
                      className="text-[12px] text-[var(--color-brand-6)] hover:text-[var(--color-primary-700)] hover:underline mt-1 font-sans"
                      title={project.projectName}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.projectName}
                    </a>
                  ) : (
                    <div className="text-[12px] text-[#45515e] mt-1 font-sans" title={project.projectName}>
                      {project.projectName}
                    </div>
                  )}
                </div>
                {project.reportHeight > 0 && <div aria-hidden="true" style={{ height: project.reportHeight }} />}
              </div>
            );
          })}
          {timelineData.length === 0 && <div className="h-32"></div>}
        </div>

        <div className="flex-1 overflow-x-auto bg-white relative" ref={containerRef}>
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
            activeReportLaneKey={activeReportLaneKey}
            selectedStepId={selectedStepId}
            laneHeight={laneHeight}
            chartScale={chartScale}
            showAllDates={showAllDates}
            showTodayLine={showTodayLine}
            onTaskDatesUpdated={onTaskDatesUpdated}
            onEditError={setTimelineEditError}
            detailedReportResponse={detailedReportResponse}
            detailedReportLoading={detailedReportLoading}
            detailedReportError={detailedReportError}
          />
        </div>
      </div>

      {timelineEditError && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
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
  activeReportLaneKey,
  selectedStepId,
  laneHeight,
  chartScale = 1,
  showAllDates,
  showTodayLine = true,
  detailedReportResponse = null,
  detailedReportLoading = false,
  detailedReportError = null
}: {
  layoutData: (TimelineLane & {
    contentHeight: number;
    reportHeight: number;
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
  activeReportLaneKey?: string | null;
  selectedStepId?: string | null;
  laneHeight: number;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
  detailedReportResponse?: AiResponseView | null;
  detailedReportLoading?: boolean;
  detailedReportError?: string | null;
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
    return layoutData.map((project, projectIndex) => {
      const yOffset = headerHeight + project.yOffset;
      const laneBackground = getLaneBackgroundStyle(projectIndex, project.laneKey === activeReportLaneKey);
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
        projectIndex,
        stepItems,
        yOffset,
        reportTop: yOffset + project.contentHeight,
        reportHeight: project.reportHeight
      };
    });
  }, [
    activeReportLaneKey,
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

    context.fillStyle = '#f9fafb';
    context.fillRect(0, 0, timelineWidth, yearRowHeight);
    context.fillRect(0, yearRowHeight, timelineWidth, monthRowHeight);
    context.strokeStyle = '#e5e7eb';
    context.lineWidth = 1;
    context.strokeRect(0, 0, timelineWidth, yearRowHeight);
    context.strokeRect(0, yearRowHeight, timelineWidth, monthRowHeight);

    headerYears.forEach((year) => {
      context.strokeStyle = '#e5e7eb';
      context.strokeRect(year.x, 0, year.width, yearRowHeight);
      drawStrokeText(context, {
        text: year.year,
        x: year.x + year.width / 2,
        y: yearRowHeight / 2,
        fill: '#374151',
        stroke: '#f9fafb',
        strokeWidth: 0,
        font: '700 12px sans-serif'
      });
    });

    headerMonths.forEach((month) => {
      context.strokeStyle = '#e5e7eb';
      context.strokeRect(month.x, yearRowHeight, month.width, monthRowHeight);
      drawStrokeText(context, {
        text: month.label,
        x: month.x + month.width / 2,
        y: yearRowHeight + monthRowHeight / 2,
        fill: '#374151',
        stroke: '#f9fafb',
        strokeWidth: 0,
        font: '700 12px sans-serif'
      });
    });

    if (showTodayLine && todayX >= 0 && todayX <= timelineWidth) {
      context.fillStyle = '#ef4444';
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
        stroke: '#ef4444',
        strokeWidth: 0,
        font: '700 10px sans-serif'
      });
    }

    renderedProjects.forEach(({ laneBackground, project, projectIndex, stepItems, yOffset }) => {
      context.fillStyle = laneBackground.baseFill;
      context.fillRect(0, yOffset, timelineWidth, project.height);

      if (project.laneKey === activeReportLaneKey) {
        context.save();
        context.globalAlpha = 0.7;
        context.fillStyle = ACTIVE_LANE_BACKGROUND_FILL;
        context.fillRect(0, yOffset, timelineWidth, project.height);
        context.restore();
      }

      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, yOffset + project.height);
      context.lineTo(timelineWidth, yOffset + project.height);
      context.stroke();

      headerMonths.forEach((month) => {
        context.save();
        context.strokeStyle = '#f3f4f6';
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
          drawChevron(context, {
            x: item.barX,
            y: top,
            width: item.barWidth,
            height: scaledBarHeight,
            pointDepth: item.pointDepth,
            hasLeftNotch: false,
            fill: item.fill,
            trackFill: getProgressTrackColor(),
            stroke: item.step.status.stroke,
            progress: item.step.progress
          });

          const labelFont = `700 ${Math.max(10, Math.round(11 * chartScale))}px sans-serif`;
          const maxLabelWidth = item.barWidth - 12; // 6px padding on each side
          const displayTitle = truncateCanvasText(context, item.step.name, maxLabelWidth, labelFont);

          if (displayTitle) {
            drawStrokeText(context, {
              text: displayTitle,
              x: item.taskCenterX,
              y: top + scaledBarHeight / 2,
              fill: '#ffffff',
              stroke: item.step.status.code === 'IN_PROGRESS' ? '#1e293b' : '#334155',
              strokeWidth: 2,
              font: labelFont
            });
          }

          if (item.renderData.startLabel && (showAllDates || hoveredStepId === item.step.id || item.isActiveDragThis) && item.renderData.startLabel !== item.renderData.endLabel) {
            drawStrokeText(context, {
              text: item.renderData.startLabel,
              x: item.startLabelX,
              y: top - 6,
              fill: item.step.status.dateText || '#475569',
              stroke: '#ffffff',
              strokeWidth: 2,
              font: '700 10px sans-serif',
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
              font: '700 10px sans-serif',
              textAlign: item.renderData.startLabel === item.renderData.endLabel ? 'center' : 'end'
            });
          }

          if (item.isSelected || item.isActiveDragThis || item.isSavingThis || item.hasPendingPreview) {
            if (item.isSelected) {
              drawTimelineChevronSelectionOutline(
                context,
                item.barX,
                top,
                Math.max(item.barWidth, 1),
                scaledBarHeight,
                item.pointDepth
              );
            } else {
              context.save();
              context.strokeStyle = item.isSavingThis
                ? '#2563eb'
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
      context.strokeStyle = '#ef4444';
      context.setLineDash([4, 2]);
      context.beginPath();
      context.moveTo(todayX, headerHeight);
      context.lineTo(todayX, headerHeight + totalTimelineHeight);
      context.stroke();
      context.restore();
    }
  }, [
    activeReportLaneKey,
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

  const activeReportLane = activeReportLaneKey
    ? layoutData.find((project) => project.laneKey === activeReportLaneKey)
    : undefined;

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
      {activeReportLane && activeReportLaneKey && (
        <div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{
            top: headerHeight + activeReportLane.yOffset + activeReportLane.contentHeight + 12,
            minWidth: `${timelineWidth}px`
          }}
        >
          <div className="mx-4 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div data-testid={`timeline-inline-report-${activeReportLaneKey}`} style={{ height: INLINE_REPORT_SLOT_HEIGHT - 12 }}>
              <InlineReportSlot
                response={detailedReportResponse}
                isLoading={detailedReportLoading}
                errorMessage={detailedReportError}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
