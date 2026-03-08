import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { t } from '../../i18n';
import { updateTaskDates } from '../../services/scheduleReportApi';
import { HeaderMonth, HeaderYear, TimelineLane, TimelineStep } from './timeline';
import { calculateStaggeredLanes } from './timelineAxis';
import { TaskDetailsDialog } from './TaskDetailsDialog';

type ChevronPathProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  pointDepth: number;
  isFirst: boolean;
  joinsPrevious?: boolean;
  fill: string;
  stroke: string;
  progress?: number;
  id?: string;
  filter?: string;
  separatorColor?: string;
};

const ChevronPath = ({
  x,
  y,
  width,
  height,
  pointDepth,
  isFirst,
  joinsPrevious = false,
  fill,
  stroke,
  progress,
  id,
  filter,
  separatorColor = 'white'
}: ChevronPathProps) => {
  const hasLeftNotch = !isFirst;
  const leftShape = !hasLeftNotch
    ? `M ${x} ${y} L ${x} ${y + height}`
    : `M ${x} ${y} L ${x + pointDepth} ${y + height / 2} L ${x} ${y + height}`;

  const rightBaseX = x + Math.max(width - pointDepth, 0);
  const rightTipX = x + width;
  const rightShape = `L ${rightBaseX} ${y + height} L ${rightTipX} ${y + height / 2} L ${rightBaseX} ${y}`;
  const pathData = `${leftShape} ${rightShape} Z`;

  if (progress !== undefined && progress >= 0 && progress < 100 && id) {
    const gradientId = `grad-${id}`;
    return (
      <g filter={filter}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${progress}%`} stopColor={fill} />
            <stop offset={`${progress}%`} stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <path d={pathData} fill={`url(#${gradientId})`} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        {hasLeftNotch && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
      </g>
    );
  }

  return (
    <g filter={filter}>
      <path d={pathData} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {hasLeftNotch && <path d={leftShape} stroke={separatorColor} strokeWidth="2" fill="none" />}
    </g>
  );
};

const DateLabel = ({ x, y, label }: { x: number; y: number; label: string }) => (
  <g transform={`translate(${x}, ${y})`}>
    <text
      y="1"
      fill="#374151"
      fontSize="10"
      fontWeight="bold"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {label}
    </text>
  </g>
);

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
  onVersionReportClick?: (payload: { versionId: number; versionName: string; projectId: number; projectName: string; projectIdentifier: string }) => void;
  onTaskDatesUpdated?: () => void;
  activeReportLaneKey?: string | null;
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

const BASE_LANE_HEIGHT = 80;
const BASE_POINT_DEPTH = 15;
const BASE_BAR_HEIGHT = 40;
const yearRowHeight = 25;
const monthRowHeight = 25;
const headerHeight = yearRowHeight + monthRowHeight;
const TODAY_LABEL_WIDTH = 40;
const TODAY_LABEL_HEIGHT = 16;
const TODAY_LABEL_OFFSET_Y = 2;
const TODAY_LABEL_LINE_GAP = 2;
const DRAG_THRESHOLD_PX = 4;
const RESIZE_HANDLE_PX = 10;
const MIN_CENTER_CLICK_PX = 14;
const MIN_HANDLE_ACTIVE_PX = 4;
const ACTIVE_LANE_BACKGROUND_FILL = '#eff6ff';
const ALT_LANE_BACKGROUND_FILL = '#f8fafc';

const CUSTOM_GRAB = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/%3E%3Cpath d='M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/%3E%3Cpath d='M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'/%3E%3Cpath d='M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/%3E%3C/svg%3E") 12 12, grab`;
const CUSTOM_GRABBING = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%23475569' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/%3E%3Cpath d='M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/%3E%3Cpath d='M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'/%3E%3Cpath d='M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/%3E%3C/svg%3E") 12 12, grabbing`;

const getLaneBackgroundStyle = (laneIndex: number, isActive: boolean) => ({
  labelClassName: isActive ? 'bg-blue-50/70' : laneIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80',
  baseFill: laneIndex % 2 === 0 ? '#ffffff' : ALT_LANE_BACKGROUND_FILL
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
  activeReportLaneKey
}: TimelineChartProps) {
  const laneHeight = Math.round(BASE_LANE_HEIGHT * chartScale);
  const barHeight = BASE_BAR_HEIGHT * chartScale;
  const barSpacingY = 10 * chartScale;

  const layoutData = useMemo(() => {
    let currentY = 0;
    return timelineData.map((project) => {
      const staggeredSteps = calculateStaggeredLanes(
        project.steps,
        (step) => step.startDateIso,
        (step) => step.endDateIso
      );
      const maxLane = staggeredSteps.length > 0 ? Math.max(...staggeredSteps.map((s) => s.laneIndex)) : 0;
      const height = laneHeight + maxLane * (barHeight + barSpacingY);
      const yOffset = currentY;
      currentY += height;
      return { ...project, steps: staggeredSteps, height, yOffset, maxLane };
    });
  }, [timelineData, laneHeight, barHeight, barSpacingY]);

  const totalTimelineHeight = layoutData.length > 0 ? layoutData[layoutData.length - 1].yOffset + layoutData[layoutData.length - 1].height : 0;

  const [activeIssue, setActiveIssue] = useState<{
    id: number;
    title: string;
    projectName: string;
    versionName: string;
  } | null>(null);
  const [timelineEditError, setTimelineEditError] = useState<string | null>(null);

  const handleStepClick = (issueId?: number, title?: string, projectName?: string, versionName?: string) => {
    if (!issueId) return;
    setActiveIssue({
      id: issueId,
      title: title || '',
      projectName: projectName || '',
      versionName: versionName || ''
    });
  };

  return (
    <>
      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex-none min-w-max bg-white border-r border-gray-200 flex flex-col">
          <div className="flex items-center px-6 font-bold text-gray-600 text-xs bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            {t('timeline.laneHeader')}
          </div>
          {layoutData.map((project, projectIndex) => {
            const laneBackground = getLaneBackgroundStyle(projectIndex, project.laneKey === activeReportLaneKey);

            return (
              <div
                key={project.laneKey}
                data-testid={`timeline-lane-label-${projectIndex}`}
                className={`flex flex-col justify-center px-6 border-b border-gray-100 box-border whitespace-nowrap transition-colors duration-300 ${laneBackground.labelClassName}`}
                style={{ height: project.height, minHeight: 60 }}
              >
                {project.versionId ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={`/versions/${project.versionId}`}
                      className="text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline"
                      title={project.versionName}
                    >
                      {project.versionName}
                    </a>
                    <button
                      type="button"
                      aria-label={t('timeline.startAiAria', { versionName: project.versionName })}
                      className="group h-7 w-7 flex items-center justify-center rounded-lg border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-300 shadow-sm hover:shadow-indigo-100/50 cursor-pointer overflow-hidden relative"
                      onClick={() =>
                        onVersionAiClick?.({
                          versionId: project.versionId as number,
                          versionName: project.versionName,
                          projectId: project.projectId,
                          projectName: project.projectName
                        })
                      }
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
                        <path
                          d="M6 4L7 5M17 19L18 20M4 6L6 7M18 4L20 5M6 20L4 18M20 18L18 19"
                          stroke={`url(#ai-grad-${project.versionId})`}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          opacity="0.5"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={t('timeline.showDetailAria', { versionName: project.versionName })}
                      className="group h-7 w-7 flex items-center justify-center rounded-lg border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-300 shadow-sm hover:shadow-blue-100/50 cursor-pointer overflow-hidden relative"
                      onClick={() =>
                        onVersionReportClick?.({
                          versionId: project.versionId as number,
                          versionName: project.versionName,
                          projectId: project.projectId,
                          projectName: project.projectName,
                          projectIdentifier: project.projectIdentifier
                        })
                      }
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
                    </button>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-800" title={project.versionName}>
                    {project.versionName}
                  </div>
                )}
                {project.projectIdentifier ? (
                  <a
                    href={`/projects/${project.projectIdentifier}`}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1"
                    title={project.projectName}
                  >
                    {project.projectName}
                  </a>
                ) : (
                  <div className="text-xs text-gray-500 mt-1" title={project.projectName}>
                    {project.projectName}
                  </div>
                )}
              </div>
            );
          })}
          {timelineData.length === 0 && <div className="h-32"></div>}
        </div>

        <div className="flex-1 overflow-x-auto bg-white relative" ref={containerRef}>
          <TimelineSvg
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
            onStepClick={handleStepClick}
            activeReportLaneKey={activeReportLaneKey}
            laneHeight={laneHeight}
            chartScale={chartScale}
            showAllDates={showAllDates}
            showTodayLine={showTodayLine}
            onTaskDatesUpdated={onTaskDatesUpdated}
            onEditError={setTimelineEditError}
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
          onTaskDatesUpdated={onTaskDatesUpdated}
          onClose={() => setActiveIssue(null)}
        />
      )}
    </>
  );
}

function TimelineSvg({
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
  onStepClick,
  onTaskDatesUpdated,
  onEditError,
  activeReportLaneKey,
  laneHeight,
  chartScale = 1,
  showAllDates,
  showTodayLine = true
}: {
  layoutData: (TimelineLane & { steps: (TimelineStep & { laneIndex: number })[]; height: number; yOffset: number; maxLane: number })[];
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
  onStepClick: (issueId?: number, title?: string, projectName?: string, versionName?: string) => void;
  onTaskDatesUpdated?: () => void;
  onEditError?: (message: string | null) => void;
  activeReportLaneKey?: string | null;
  laneHeight: number;
  chartScale?: number;
  showAllDates?: boolean;
  showTodayLine?: boolean;
}) {
  const svgHeight = headerHeight + totalTimelineHeight;
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

  if (layoutData.length === 0) {
    return <div className="flex items-center justify-center h-32 text-gray-400">{t('common.noData')}</div>;
  }

  return (
    <svg viewBox={`0 0 ${timelineWidth} ${svgHeight}`} className="w-full" style={{ minHeight: svgHeight, minWidth: `${timelineWidth}px` }}>
      <defs>
        <pattern id="gridPattern" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#f3f4f6" strokeWidth="1" />
        </pattern>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur" />
          <feOffset in="blur" dx="0" dy="1" result="offsetBlur" />
          <feFlood floodColor="rgba(0,0,0,0.2)" result="colorBlur" />
          <feComposite in="colorBlur" in2="offsetBlur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="stripePattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f8fafc" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
        </pattern>
      </defs>

      <g transform="translate(0, 0)">
        <rect x={0} y={0} width={timelineWidth} height={yearRowHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
        <rect x={0} y={yearRowHeight} width={timelineWidth} height={monthRowHeight} fill="#f9fafb" stroke="#e5e7eb" strokeWidth="1" />
        {headerYears.map((year, idx) => (
          <g key={`year-${year.year}-${idx}`} transform={`translate(${year.x}, 0)`}>
            <rect x={0} y={0} width={year.width} height={yearRowHeight} fill="none" stroke="#e5e7eb" strokeWidth="1" />
            <text
              x={year.width / 2}
              y={yearRowHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="bold"
              fill="#374151"
            >
              {year.year}
            </text>
          </g>
        ))}

        {headerMonths.map((month, idx) => (
          <g key={`month-${month.label}-${idx}`} transform={`translate(${month.x}, ${yearRowHeight})`}>
            <rect x={0} y={0} width={month.width} height={monthRowHeight} fill="none" stroke="#e5e7eb" strokeWidth="1" />
            <text
              x={month.width / 2}
              y={monthRowHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="bold"
              fill="#374151"
            >
              {month.label}
            </text>
          </g>
        ))}

        {showTodayLine && todayX >= 0 && todayX <= timelineWidth && (
          <g transform={`translate(${todayX}, 0)`}>
            <rect
              x={-TODAY_LABEL_WIDTH / 2}
              y={headerHeight + TODAY_LABEL_OFFSET_Y}
              width={TODAY_LABEL_WIDTH}
              height={TODAY_LABEL_HEIGHT}
              fill="#ef4444"
            />
            <text
              x={0}
              y={headerHeight + TODAY_LABEL_OFFSET_Y + 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#ffffff"
            >
              {format(new Date(), 'M/d')}
            </text>
          </g>
        )}
      </g>

      {layoutData.map((project, projectIndex) => {
        const yOffset = headerHeight + project.yOffset;
        const laneBackground = getLaneBackgroundStyle(projectIndex, project.laneKey === activeReportLaneKey);

        return (
          <g key={project.laneKey} transform={`translate(0, ${yOffset})`}>
            <rect
              data-testid={`timeline-lane-bg-${projectIndex}`}
              x={0}
              y={0}
              width={timelineWidth}
              height={project.height}
              fill={laneBackground.baseFill}
            />
            {project.laneKey === activeReportLaneKey && (
              <rect
                data-testid={`timeline-lane-active-bg-${projectIndex}`}
                x={0}
                y={0}
                width={timelineWidth}
                height={project.height}
                fill={ACTIVE_LANE_BACKGROUND_FILL}
                opacity="0.7"
              />
            )}
            <line x1={0} y1={project.height} x2={timelineWidth} y2={project.height} stroke="#f3f4f6" strokeWidth="1" />
            {headerMonths.map((month, monthIndex) => (
              <line
                key={`${project.laneKey}-month-${monthIndex}`}
                x1={month.x}
                y1={0}
                x2={month.x}
                y2={project.height}
                stroke="#f3f4f6"
                strokeDasharray="4 2"
              />
            ))}

            {project.steps
              .map((step, stepIndex) => {
                const isFirst = stepIndex === 0;
                const pointDepth = BASE_POINT_DEPTH * chartScale;
                const barHeight = BASE_BAR_HEIGHT * chartScale;
                const barSpacingY = 10 * chartScale;
                const totalBarsHeight = (project.maxLane + 1) * barHeight + project.maxLane * barSpacingY;
                const baseTopPadding = (project.height - totalBarsHeight) / 2;
                const verticalOffset = baseTopPadding + step.laneIndex * (barHeight + barSpacingY);
                const fontSize = Math.max(10, Math.round(12 * chartScale));
                const isPending = step.status.code === 'PENDING';
                const isInProgress = step.status.code === 'IN_PROGRESS';
                const fill = isPending ? 'url(#stripePattern)' : step.status.fill;
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
                const barX = joinsPrevious ? renderData.x - pointDepth : renderData.x;
                const barWidth = joinsPrevious ? renderData.width + pointDepth : renderData.width;
                const hitX = renderData.x;
                const hitWidth = Math.max(renderData.width, 1);
                const taskCenterX = barX + barWidth / 2 + (isFirst ? 0 : pointDepth / 2);
                const startLabelX = barX + (isFirst ? 12 : pointDepth + 12);
                const endLabelX = renderData.startLabel === renderData.endLabel ? taskCenterX : barX + barWidth - 12;
                const hasPendingPreview = pendingPreview?.stepId === step.id;
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
                const bodyCursor = isDraggingThis
                  ? (isActiveDragThis ? CUSTOM_GRABBING : CUSTOM_GRAB)
                  : canEdit
                    ? CUSTOM_GRAB
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
                      <g pointerEvents="none">
                        <ChevronPath
                          x={barX}
                          y={0}
                          width={barWidth}
                          height={barHeight}
                          pointDepth={pointDepth}
                          isFirst={isFirst}
                          joinsPrevious={joinsPrevious}
                          fill={fill}
                          stroke={step.status.stroke}
                          progress={step.progress}
                          id={step.id}
                          filter="url(#dropShadow)"
                          separatorColor={isPending ? 'transparent' : 'white'}
                        />
                      </g>
                      <rect
                        x={hitX}
                        y={0}
                        width={hitWidth}
                        height={barHeight}
                        fill="transparent"
                        style={{ cursor: bodyCursor, touchAction: 'none' }}
                        onClick={() => {
                          if (suppressClickStepId === step.id) {
                            setSuppressClickStepId(null);
                            return;
                          }
                          onStepClick(step.issueId, step.name, project.projectName, project.versionName);
                        }}
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

                      {renderData.width > 30 && (
                        <text
                          x={taskCenterX}
                          y={barHeight / 2}
                          fill={step.status.text}
                          fontSize={fontSize}
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{
                            pointerEvents: 'none',
                            paintOrder: 'stroke',
                            stroke: step.status.textStroke || '#ffffff',
                            strokeWidth: step.status.textStrokeWidth || '3px',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round'
                          }}
                        >
                          {step.name}
                        </text>
                      )}

                      {renderData.startLabel && (showAllDates || hoveredStepId === step.id || isActiveDragThis) && renderData.startLabel !== renderData.endLabel && (
                        <DateLabel x={startLabelX} y={-12} label={renderData.startLabel} />
                      )}

                      {renderData.endLabel && (showAllDates || hoveredStepId === step.id || isActiveDragThis) && (
                        <DateLabel x={endLabelX} y={-12} label={renderData.endLabel} />
                      )}

                      {(isActiveDragThis || isSavingThis || hasPendingPreview) && (
                        <rect
                          x={barX}
                          y={0}
                          width={Math.max(barWidth, 1)}
                          height={barHeight}
                          fill="none"
                          stroke={isSavingThis ? '#2563eb' : hasPendingPreview ? '#0891b2' : '#0ea5e9'}
                          strokeWidth="2"
                          strokeDasharray={isSavingThis || hasPendingPreview ? '4 2' : undefined}
                          rx="6"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  )
                };
              })
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((item) => item.element)}

            {showTodayLine && todayX >= 0 && todayX <= timelineWidth && (
              <line
                x1={todayX}
                y1={projectIndex === 0 ? TODAY_LABEL_OFFSET_Y + TODAY_LABEL_HEIGHT + TODAY_LABEL_LINE_GAP : 0}
                x2={todayX}
                y2={laneHeight}
                stroke="#ef4444"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
            )}
          </g>
        );
      })}

    </svg>
  );
}
