import { differenceInCalendarDays, parseISO } from 'date-fns';
import { type TaskDetailIssue } from '../../../services/scheduleReportApi';
import {
  calculateStaggeredLanes,
  createDateToX,
  createRangeToWidth,
  type TimelineAxis
} from '../timelineAxis';

export type ProcessFlowShapeKind = 'range' | 'start-only' | 'due-only';
export type ProcessFlowStatus = 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

export type ProcessFlowStep = {
  id: number;
  title: string;
  rangeLabel: string;
  startDate: string | null;
  dueDate: string | null;
  anchorDate: string;
  shapeKind: ProcessFlowShapeKind;
  status: ProcessFlowStatus;
  progress: number;
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

export type ProcessFlowDragMode = 'move' | 'resize-left' | 'resize-right';

export type ProcessFlowDragSession = {
  issueId: number;
  pointerId: number;
  mode: ProcessFlowDragMode;
  startClientX: number;
  originalStartDate: string;
  originalDueDate: string;
  currentStartDate: string;
  currentDueDate: string;
  moved: boolean;
};

export type ProcessFlowScaleMetrics = {
  laneHeight: number;
  barHeight: number;
  barSpacingY: number;
  pointDepth: number;
  triangleWidth: number;
  diamondWidth: number;
};

export const PROCESS_FLOW_MIN_WIDTH = 640;
export const PROCESS_FLOW_YEAR_ROW_HEIGHT = 23;
export const PROCESS_FLOW_MONTH_ROW_HEIGHT = 23;
export const PROCESS_FLOW_HEADER_HEIGHT = PROCESS_FLOW_YEAR_ROW_HEIGHT + PROCESS_FLOW_MONTH_ROW_HEIGHT;
export const PROCESS_FLOW_DATE_LABEL_INSET = 8;
export const PROCESS_FLOW_DRAG_THRESHOLD_PX = 4;

const PROCESS_FLOW_LANE_HEIGHT = 136;
const PROCESS_FLOW_BAR_HEIGHT = 36;
const PROCESS_FLOW_BAR_SPACING_Y = 34;
const PROCESS_FLOW_POINT_DEPTH = 22;
const PROCESS_FLOW_LEFT_NOTCH_RATIO = 0.55;
const PROCESS_FLOW_RIGHT_HEAD_RATIO = 0.62;
const PROCESS_FLOW_DIAMOND_WIDTH = PROCESS_FLOW_BAR_HEIGHT;
const PROCESS_FLOW_TRIANGLE_WIDTH = (PROCESS_FLOW_BAR_HEIGHT * Math.sqrt(3)) / 2;

export const buildProcessFlowScaleMetrics = (scale = 1): ProcessFlowScaleMetrics => ({
  laneHeight: Math.round(PROCESS_FLOW_LANE_HEIGHT * scale),
  barHeight: Math.round(PROCESS_FLOW_BAR_HEIGHT * scale),
  barSpacingY: Math.round(PROCESS_FLOW_BAR_SPACING_Y * scale),
  pointDepth: Math.round(PROCESS_FLOW_POINT_DEPTH * scale),
  triangleWidth: Math.round(PROCESS_FLOW_TRIANGLE_WIDTH * scale),
  diamondWidth: Math.round(PROCESS_FLOW_DIAMOND_WIDTH * scale)
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
      const status: ProcessFlowStatus = issue.status_is_closed || progress === 100
        ? 'COMPLETED'
        : progress > 0
          ? 'IN_PROGRESS'
          : 'PENDING';
      const startDate = issue.start_date ?? null;
      const dueDate = issue.due_date ?? null;
      const anchorDate = startDate ?? dueDate;

      if (!anchorDate) {
        return null;
      }

      const shapeKind: ProcessFlowShapeKind = startDate && dueDate
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
};

export const getProcessFlowTimelineWidth = (
  containerWidth: number,
  stepCount: number
): number => (
  containerWidth > 0
    ? Math.max(containerWidth, PROCESS_FLOW_MIN_WIDTH)
    : Math.max(PROCESS_FLOW_MIN_WIDTH, stepCount * 180)
);

export const buildProcessFlowRenderSteps = ({
  axis,
  steps,
  dragSession,
  scaleMetrics
}: {
  axis: TimelineAxis | null;
  steps: ProcessFlowStep[];
  dragSession: ProcessFlowDragSession | null;
  scaleMetrics: ProcessFlowScaleMetrics;
}): ProcessFlowRenderStep[] => {
  if (!axis) {
    return [];
  }

  const getX = createDateToX(axis.minDate, axis.pixelsPerDay);
  const getWidth = createRangeToWidth(axis.pixelsPerDay);

  const rawSteps = steps.map((step) => {
    const currentSession = step.shapeKind === 'range' && dragSession?.issueId === step.id ? dragSession : null;
    const startDate = currentSession?.currentStartDate ?? step.startDate;
    const dueDate = currentSession?.currentDueDate ?? step.dueDate;
    const anchorDate = startDate ?? dueDate;
    const anchorX = anchorDate ? getX(anchorDate) : 0;
    const visualWidth = step.shapeKind === 'range'
      ? getWidth(startDate, dueDate)
      : step.shapeKind === 'start-only'
        ? scaleMetrics.triangleWidth
        : scaleMetrics.diamondWidth;
    const hitWidth = step.shapeKind === 'range'
      ? visualWidth
      : Math.max(visualWidth, axis.pixelsPerDay);
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
    const joinsPrevious = Boolean(
      step.shapeKind === 'range' &&
      previousStep?.shapeKind === 'range' &&
      step.startDate &&
      previousStep.dueDate &&
      differenceInCalendarDays(parseISO(step.startDate), parseISO(previousStep.dueDate)) === 1 &&
      step.laneIndex === previousStep.laneIndex
    );

    return {
      ...step,
      isFirst: index === 0,
      hasLeftNotch: false,
      joinsPrevious,
      x: step.shapeX,
      width: step.visualWidth,
      textX: step.shapeKind === 'due-only' ? step.anchorX : step.shapeX + step.visualWidth / 2
    };
  });
};

export const getProcessFlowLayout = (
  renderSteps: ProcessFlowRenderStep[],
  scaleMetrics: ProcessFlowScaleMetrics
) => {
  const maxLaneIndex = renderSteps.length > 0 ? Math.max(...renderSteps.map((step) => step.laneIndex)) : 0;
  const laneHeight = Math.max(
    scaleMetrics.laneHeight,
    40 + (maxLaneIndex + 1) * scaleMetrics.barHeight + maxLaneIndex * scaleMetrics.barSpacingY + 40
  );
  const chartHeight = PROCESS_FLOW_HEADER_HEIGHT + laneHeight;
  const totalBarsHeight = (maxLaneIndex + 1) * scaleMetrics.barHeight + maxLaneIndex * scaleMetrics.barSpacingY;
  const baseTopPadding = (laneHeight - totalBarsHeight) / 2;

  return {
    maxLaneIndex,
    laneHeight,
    chartHeight,
    baseTopPadding
  };
};

export const getProcessStepY = (
  laneIndex: number,
  baseTopPadding: number,
  scaleMetrics: ProcessFlowScaleMetrics
) => PROCESS_FLOW_HEADER_HEIGHT + baseTopPadding + laneIndex * (scaleMetrics.barHeight + scaleMetrics.barSpacingY);

export const extractProcessFlowMonthDayLabel = (isoDate: string) => {
  const parts = isoDate.split('-');
  return `${Number(parts[1])}/${Number(parts[2])}`;
};

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

export const buildProcessChevronPathData = (
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
