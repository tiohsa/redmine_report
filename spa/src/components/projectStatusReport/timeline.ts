import {
  addMonths,
  addYears,
  differenceInDays,
  endOfMonth,
  endOfYear,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfYear,
  getDate
} from 'date-fns';
import { CategoryBar, ProjectInfo } from '../../services/scheduleReportApi';
import { getDateFnsLocale, getLocale, t } from '../../i18n';
import { buildStatusStyles, StatusStyle } from './constants';

export type TimelineStep = {
  issueId?: number;
  name: string;
  x: number;
  width: number;
  status: StatusStyle;
  progress?: number;
  id: string;
  startDateStr?: string;
  endDateStr?: string;
  startLabelPos: 'in' | 'out';
  endLabelPos: 'in' | 'out';
};

export type TimelineLane = {
  laneKey: string;
  projectId: number;
  projectIdentifier: string;
  projectName: string;
  versionId?: number;
  versionName: string;
  steps: TimelineStep[];
};

export type HeaderMonth = {
  label: string;
  x: number;
  width: number;
};

export type HeaderYear = {
  year: string;
  x: number;
  width: number;
};

export type TimelineViewModel = {
  timelineData: TimelineLane[];
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  totalDurationText: string;
  todayX: number;
};

type TimelineCalculationInput = {
  bars: CategoryBar[];
  selectedVersions: string[];
  projectMap: Map<number, ProjectInfo>;
  containerWidth: number;
};

const DEFAULT_TIMELINE_WIDTH = 1000;
const POINT_DEPTH = 15; // Visual depth of the arrow point

export function buildTimelineViewModel({
  bars,
  selectedVersions,
  projectMap,
  containerWidth
}: TimelineCalculationInput): TimelineViewModel {
  const statusStyles = buildStatusStyles();
  if (bars.length === 0) {
    return {
      timelineData: [],
      timelineWidth: DEFAULT_TIMELINE_WIDTH,
      headerMonths: [],
      headerYears: [],
      totalDurationText: t('timeline.noDataDuration'),
      todayX: -1
    };
  }

  const { minDate, maxDate } = getDateRangeWithBuffer(bars);
  const totalDays = differenceInDays(maxDate, minDate) + 1;
  const effectiveContainerWidth = containerWidth > 0 ? containerWidth : DEFAULT_TIMELINE_WIDTH;
  const pixelsPerDay = effectiveContainerWidth / totalDays;

  const getX = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const date = parseISO(dateStr);
    return Math.max(0, differenceInDays(date, minDate) * pixelsPerDay);
  };

  const getWidth = (startStr?: string, endStr?: string): number => {
    if (!startStr || !endStr) return 0;
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    return Math.max(differenceInDays(end, start) + 1, 0.5) * pixelsPerDay;
  };

  const headerMonths = buildHeaderMonths(minDate, maxDate, pixelsPerDay);
  const headerYears = buildHeaderYears(minDate, maxDate, pixelsPerDay);
  const timelineData = buildTimelineData({
    bars,
    selectedVersions,
    projectMap,
    getX,
    getWidth,
    statusStyles
  });

  return {
    timelineData,
    timelineWidth: effectiveContainerWidth,
    headerMonths,
    headerYears,
    totalDurationText: `${format(minDate, 'yyyy/MM/dd')} - ${format(maxDate, 'yyyy/MM/dd')}`,
    todayX: getX(new Date().toISOString())
  };
}

function getDateRangeWithBuffer(bars: CategoryBar[]): { minDate: Date; maxDate: Date } {
  let minDate = new Date();
  let maxDate = new Date();
  let hasDates = false;

  bars.forEach((bar) => {
    if (bar.start_date) {
      const startDate = parseISO(bar.start_date);
      if (!hasDates || isBefore(startDate, minDate)) minDate = startDate;
      hasDates = true;
    }

    if (bar.end_date) {
      const endDate = parseISO(bar.end_date);
      if (!hasDates || isAfter(endDate, maxDate)) maxDate = endDate;
      hasDates = true;
    }
  });

  if (!hasDates) {
    return {
      minDate: startOfMonth(new Date()),
      maxDate: endOfMonth(addMonths(new Date(), 2))
    };
  }

  const bufferedMinDate = new Date(minDate);
  bufferedMinDate.setDate(bufferedMinDate.getDate() - 7);
  const bufferedMaxDate = new Date(maxDate);
  bufferedMaxDate.setDate(bufferedMaxDate.getDate() + 7);

  const minMonthStart = startOfMonth(minDate);
  const maxMonthEnd = endOfMonth(maxDate);

  return {
    minDate: isBefore(bufferedMinDate, minMonthStart) ? minMonthStart : bufferedMinDate,
    maxDate: isAfter(bufferedMaxDate, maxMonthEnd) ? maxMonthEnd : bufferedMaxDate
  };
}

function buildHeaderMonths(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderMonth[] {
  const headerMonths: HeaderMonth[] = [];
  const locale = getDateFnsLocale();
  const monthFormat = getLocale() === 'ja' ? 'M月' : 'MMM';
  let currentMonth = startOfMonth(minDate);

  while (isBefore(currentMonth, maxDate) || currentMonth.getTime() === maxDate.getTime()) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const visibleStart = isBefore(monthStart, minDate) ? minDate : monthStart;
    const visibleEnd = isAfter(monthEnd, maxDate) ? maxDate : monthEnd;

    const monthDays = differenceInDays(visibleEnd, visibleStart) + 1;

    headerMonths.push({
      label: format(currentMonth, monthFormat, { locale }),
      x: differenceInDays(visibleStart, minDate) * pixelsPerDay,
      width: monthDays * pixelsPerDay
    });

    currentMonth = addMonths(currentMonth, 1);
  }

  return headerMonths;
}

function buildHeaderYears(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderYear[] {
  const headerYears: HeaderYear[] = [];
  const locale = getDateFnsLocale();
  const yearFormat = getLocale() === 'ja' ? 'yyyy年' : 'yyyy';
  let currentYearDate = startOfYear(minDate);

  while (isBefore(currentYearDate, maxDate) || currentYearDate.getTime() <= maxDate.getTime()) {
    const yearStart = startOfYear(currentYearDate);
    const yearEnd = endOfYear(currentYearDate);

    const visibleStart = isBefore(yearStart, minDate) ? minDate : yearStart;
    const visibleEnd = isAfter(yearEnd, maxDate) ? maxDate : yearEnd;

    if (isBefore(visibleStart, visibleEnd) || visibleStart.getTime() === visibleEnd.getTime()) {
      const yearDays = differenceInDays(visibleEnd, visibleStart) + 1;

      headerYears.push({
        year: format(currentYearDate, yearFormat, { locale }),
        x: differenceInDays(visibleStart, minDate) * pixelsPerDay,
        width: yearDays * pixelsPerDay
      });
    }

    currentYearDate = addYears(currentYearDate, 1);
  }

  return headerYears;
}

function buildTimelineData({
  bars,
  selectedVersions,
  projectMap,
  getX,
  getWidth,
  statusStyles
}: {
  bars: CategoryBar[];
  selectedVersions: string[];
  projectMap: Map<number, ProjectInfo>;
  getX: (dateStr?: string) => number;
  getWidth: (startStr?: string, endStr?: string) => number;
  statusStyles: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle>;
}): TimelineLane[] {
  const groupedByProject = new Map<number, Map<string, CategoryBar[]>>();

  bars.forEach((bar) => {
    const versionKey = bar.version_name || t('common.noVersion');
    if (!selectedVersions.includes(versionKey)) return;

    if (!groupedByProject.has(bar.project_id)) {
      groupedByProject.set(bar.project_id, new Map<string, CategoryBar[]>());
    }

    const versionMap = groupedByProject.get(bar.project_id)!;
    if (!versionMap.has(versionKey)) {
      versionMap.set(versionKey, []);
    }

    versionMap.get(versionKey)!.push(bar);
  });

  const timelineData: TimelineLane[] = [];
  const GAP_THRESHOLD_PX = 45; // Approximately space for 2 digits
  const MIN_WIDTH_FOR_INSIDE = 40; // Minimum width to fit text inside

  Array.from(groupedByProject.entries()).forEach(([projectId, versionMap]) => {
    const project = projectMap.get(projectId);
    const projectName = project?.name || t('timeline.projectFallback', { id: projectId });
    const projectIdentifier = project?.identifier || '';

    Array.from(versionMap.entries()).forEach(([versionKey, versionBars]) => {
      const sortedBars = [...versionBars].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
      const versionId = sortedBars.find((bar) => typeof bar.version_id === 'number')?.version_id;

      const steps: TimelineStep[] = sortedBars.map((bar, idx) => {
        const { status, progress } = resolveStatus(bar.progress_rate, statusStyles);
        const width = getWidth(bar.start_date, bar.end_date);

        let startDateStr = '';
        if (bar.start_date) {
            startDateStr = format(parseISO(bar.start_date), 'M/d');
        }

        let endDateStr = '';
        if (bar.end_date) {
            endDateStr = format(parseISO(bar.end_date), 'M/d');
        }

        return {
          issueId: bar.category_id,
          name: bar.ticket_subject || bar.category_name,
          x: getX(bar.start_date),
          width,
          status,
          progress,
          id: `ticket-${bar.project_id}-${bar.category_id}-${idx}`,
          startDateStr,
          endDateStr,
          startLabelPos: 'out', // Default
          endLabelPos: 'out' // Default
        };
      });

      // Calculate label positions based on overlap
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const prevStep = i > 0 ? steps[i - 1] : null;
        const nextStep = i < steps.length - 1 ? steps[i + 1] : null;

        const currStart = step.x;
        const currEnd = step.x + step.width;

        // Start Label Logic
        let startPos: 'in' | 'out' = 'out';
        if (prevStep) {
            const prevEnd = prevStep.x + prevStep.width + POINT_DEPTH;
            const gap = currStart - prevEnd;
            if (gap < 0) {
                 // Overlap: force out to preserve time order (e.g. 25 left of 26)
                 startPos = 'out';
            } else if (gap < GAP_THRESHOLD_PX) {
                if (step.width >= MIN_WIDTH_FOR_INSIDE) {
                    startPos = 'in';
                }
            }
        }
        // Also check if close to start of lane
        if (currStart < GAP_THRESHOLD_PX) {
             if (step.width >= MIN_WIDTH_FOR_INSIDE) {
                startPos = 'in';
            }
        }

        // End Label Logic
        let endPos: 'in' | 'out' = 'out';
        if (nextStep) {
            const nextStart = nextStep.x;
            // Include POINT_DEPTH in current end calculation
            const gap = nextStart - (currEnd + POINT_DEPTH);
            if (gap < 0) {
                 // Overlap: force out to preserve time order
                 endPos = 'out';
            } else if (gap < GAP_THRESHOLD_PX) {
                if (step.width >= MIN_WIDTH_FOR_INSIDE) {
                    endPos = 'in';
                }
            }
        }

        steps[i].startLabelPos = startPos;
        steps[i].endLabelPos = endPos;
      }

      timelineData.push({
        laneKey: `${projectId}:${versionKey}`,
        projectId,
        projectIdentifier,
        projectName,
        versionId,
        versionName: versionKey,
        steps
      });
    });
  });

  return timelineData;
}

function resolveStatus(
  progressRate: number,
  statusStyles: Record<'COMPLETED' | 'IN_PROGRESS' | 'PENDING', StatusStyle>
): { status: StatusStyle; progress?: number } {
  if (progressRate === 100) {
    return { status: statusStyles.COMPLETED };
  }

  if (progressRate > 0) {
    return { status: statusStyles.IN_PROGRESS, progress: progressRate };
  }

  return { status: statusStyles.PENDING };
}
