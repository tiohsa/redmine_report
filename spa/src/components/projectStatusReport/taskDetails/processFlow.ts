import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { TaskDetailIssue } from '../../../services/scheduleReportApi';
import { buildTimelineAxis, calculateStaggeredLanes, createDateToX, createRangeToWidth } from '../timelineAxis';
import {
  drawChevron,
  drawDiamond,
  drawStrokeText,
  drawTriangle,
  prepareHiDPICanvas,
  truncateCanvasText
} from '../canvasTimelineRenderer';
import { getProgressFillColor, getProgressTrackColor } from '../constants';

export type ProcessFlowStep = {
  id: number;
  title: string;
  rangeLabel: string;
  startDate: string | null;
  dueDate: string | null;
  anchorDate: string;
  shapeKind: 'range' | 'start-only' | 'due-only';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  progress: number | undefined;
  hasChildren: boolean;
};

export type ProcessFlowRenderStep = ProcessFlowStep & {
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

export type ProcessDragMode = 'move' | 'resize-left' | 'resize-right';

export type ProcessDragSession = {
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

export const PROCESS_FLOW_MIN_WIDTH = 640;
export const PROCESS_FLOW_YEAR_ROW_HEIGHT = 23;
export const PROCESS_FLOW_MONTH_ROW_HEIGHT = 23;
export const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
export const PROCESS_FLOW_LANE_HEIGHT = 136;
export const PROCESS_FLOW_BAR_HEIGHT = 36;
export const PROCESS_FLOW_BAR_SPACING_Y = 34;
export const PROCESS_FLOW_POINT_DEPTH = 22;
export const PROCESS_FLOW_DIAMOND_WIDTH = PROCESS_FLOW_BAR_HEIGHT;
export const PROCESS_FLOW_TRIANGLE_WIDTH = (PROCESS_FLOW_BAR_HEIGHT * Math.sqrt(3)) / 2;
export const PROCESS_FLOW_DATE_LABEL_INSET = 8;
export const PROCESS_FLOW_RIGHT_HEAD_RATIO = 0.62;

const processStatusStyles: Record<
  ProcessFlowStep['status'],
  {
    fill: string;
    text: string;
    stroke: string;
    accent: string;
    progressText: string;
    dateText: string;
  }
> = {
  COMPLETED: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#2563eb', progressText: '#1f2937', dateText: '#475569' },
  IN_PROGRESS: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#f97316', progressText: '#1f2937', dateText: '#475569' },
  PENDING: { fill: '#253248', text: '#1e293b', stroke: '#94a3b8', accent: '#64748b', progressText: '#1f2937', dateText: '#475569' }
};

const getProcessChevronMetrics = (width: number, pointDepth: number) => {
  const rightHeadDepth = Math.min(pointDepth * PROCESS_FLOW_RIGHT_HEAD_RATIO, Math.max(width * 0.16, 10));
  return { rightHeadDepth };
};

const buildProcessChevronPathData = (
  x: number,
  y: number,
  width: number,
  height: number,
  pointDepth: number,
  hasLeftNotch: boolean
) => {
  const { rightHeadDepth } = getProcessChevronMetrics(width, pointDepth);
  const leftShoulderX = x + 4;
  const leftNotchTipX = x + 8;
  const rightBaseX = x + Math.max(width - rightHeadDepth, 4);
  const rightTipX = x + width;

  return {
    leftShoulderX,
    leftNotchTipX,
    rightBaseX,
    rightTipX,
    hasLeftNotch,
    y,
    height
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
  const { leftShoulderX, leftNotchTipX, rightBaseX, rightTipX } = buildProcessChevronPathData(
    step.x,
    step.stepY,
    step.width,
    step.barHeight,
    step.pointDepth,
    step.hasLeftNotch
  );

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

const extractMD = (isoDate: string) => {
  const parts = isoDate.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}`;
};

export const getScaledProcessFlowDimensions = (effectiveScale: number) => ({
  laneHeight: Math.round(PROCESS_FLOW_LANE_HEIGHT * effectiveScale),
  barHeight: Math.round(PROCESS_FLOW_BAR_HEIGHT * effectiveScale),
  barSpacingY: Math.round(PROCESS_FLOW_BAR_SPACING_Y * effectiveScale),
  pointDepth: Math.round(PROCESS_FLOW_POINT_DEPTH * effectiveScale),
  triangleWidth: Math.round(PROCESS_FLOW_TRIANGLE_WIDTH * effectiveScale),
  diamondWidth: Math.round(PROCESS_FLOW_DIAMOND_WIDTH * effectiveScale)
});

export const buildProcessFlowSteps = (
  issues: TaskDetailIssue[],
  currentRootIssueId: number
): ProcessFlowStep[] => {
  const parentIssueIds = new Set(
    issues
      .map((issue) => issue.parent_id)
      .filter((parentId): parentId is number => Number.isInteger(parentId))
  );

  return issues
    .filter((issue) => Boolean(issue.start_date || issue.due_date))
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

      return {
        id: issue.issue_id,
        title: issue.subject,
        startDate,
        dueDate,
        anchorDate,
        shapeKind: startDate && dueDate ? 'range' : startDate ? 'start-only' : 'due-only',
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
};

export const buildProcessFlowAxis = (
  processFlowSteps: ProcessFlowStep[],
  processFlowTimelineWidth: number
) => {
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
};

export const buildProcessFlowRenderSteps = ({
  processFlowAxis,
  processFlowSteps,
  processDragSession,
  scaledTriangleWidth,
  scaledDiamondWidth
}: {
  processFlowAxis: ReturnType<typeof buildTimelineAxis> | null;
  processFlowSteps: ProcessFlowStep[];
  processDragSession: ProcessDragSession | null;
  scaledTriangleWidth: number;
  scaledDiamondWidth: number;
}): ProcessFlowRenderStep[] => {
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
    const previousStep = index > 0 ? positionedSteps[index - 1] : null;
    return {
      ...step,
      isFirst: index === 0,
      hasLeftNotch: false,
      joinsPrevious: Boolean(
        step.shapeKind === 'range' &&
        previousStep?.shapeKind === 'range' &&
        step.startDate &&
        previousStep.dueDate &&
        differenceInCalendarDays(parseISO(step.startDate), parseISO(previousStep.dueDate)) === 1 &&
        step.laneIndex === previousStep.laneIndex
      ),
      x: step.shapeX,
      width: step.visualWidth,
      textX: step.shapeKind === 'due-only' ? step.anchorX : step.shapeX + step.visualWidth / 2
    };
  });
};

export const getProcessFlowChartMetrics = (
  processFlowRenderSteps: ProcessFlowRenderStep[],
  scaledLaneHeight: number,
  scaledBarHeight: number,
  scaledBarSpacingY: number
) => {
  const maxProcessFlowLane =
    processFlowRenderSteps.length > 0 ? Math.max(...processFlowRenderSteps.map((step) => step.laneIndex)) : 0;
  const processFlowLaneHeight = Math.max(
    scaledLaneHeight,
    40 + (maxProcessFlowLane + 1) * scaledBarHeight + maxProcessFlowLane * scaledBarSpacingY + 40
  );
  const processFlowChartHeight = PROCESS_FLOW_HEADER_HEIGHT + processFlowLaneHeight;
  const totalBarsHeight = (maxProcessFlowLane + 1) * scaledBarHeight + maxProcessFlowLane * scaledBarSpacingY;
  const processFlowBaseTopPadding = (processFlowLaneHeight - totalBarsHeight) / 2;

  return {
    maxProcessFlowLane,
    processFlowLaneHeight,
    processFlowChartHeight,
    processFlowBaseTopPadding
  };
};

export const drawProcessFlowCanvas = ({
  canvas,
  processFlowAxis,
  processFlowChartHeight,
  processFlowLaneHeight,
  processFlowRenderSteps,
  processFlowBaseTopPadding,
  scaledBarHeight,
  scaledBarSpacingY,
  scaledPointDepth,
  selectedIssueId
}: {
  canvas: HTMLCanvasElement;
  processFlowAxis: NonNullable<ReturnType<typeof buildTimelineAxis>>;
  processFlowChartHeight: number;
  processFlowLaneHeight: number;
  processFlowRenderSteps: ProcessFlowRenderStep[];
  processFlowBaseTopPadding: number;
  scaledBarHeight: number;
  scaledBarSpacingY: number;
  scaledPointDepth: number;
  selectedIssueId: number | null;
}) => {
  const context = prepareHiDPICanvas(canvas, processFlowAxis.timelineWidth, processFlowChartHeight);
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
    const fill = getProgressFillColor(step.progress ?? 0);
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
    const displayTitle = truncateCanvasText(context, step.title, step.visualWidth - 12, labelFont);
    if (!displayTitle) return;

    drawStrokeText(context, {
      text: displayTitle,
      x: step.textX,
      y: stepY + scaledBarHeight / 2,
      fill: '#ffffff',
      stroke: step.status === 'IN_PROGRESS' ? '#1e293b' : '#334155',
      strokeWidth: 2,
      font: labelFont
    });
  });
};
