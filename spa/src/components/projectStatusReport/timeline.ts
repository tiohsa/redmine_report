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
  const visibleBars = bars.filter((bar) => {
    const versionKey = bar.version_name || t('common.noVersion');
    return selectedVersions.includes(versionKey);
  });

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

  const { minDate, maxDate } = getDateRangeWithBuffer(visibleBars);
  const totalDays = differenceInDays(maxDate, minDate) + 1;
  const effectiveContainerWidth = containerWidth > 0 ? containerWidth : DEFAULT_TIMELINE_WIDTH;
  const pixelsPerDay = effectiveContainerWidth / totalDays;

  const getX = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const date = parseISO(dateStr);
    return differenceInDays(date, minDate) * pixelsPerDay;
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
    // Place the "today" line at the center of today's day-cell on the date axis.
    todayX: getX(new Date().toISOString()) + pixelsPerDay / 2
  };
}

function getDateRangeWithBuffer(bars: CategoryBar[]): { minDate: Date; maxDate: Date } {
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  bars.forEach((bar) => {
    if (bar.start_date) {
      const startDate = parseISO(bar.start_date);
      if (!minDate || isBefore(startDate, minDate)) minDate = startDate;
    }

    if (bar.end_date) {
      const endDate = parseISO(bar.end_date);
      if (!maxDate || isAfter(endDate, maxDate)) maxDate = endDate;
    }
  });

  if (!minDate && !maxDate) {
    return {
      minDate: startOfMonth(new Date()),
      maxDate: endOfMonth(addMonths(new Date(), 2))
    };
  }

  const effectiveMinDate = minDate || maxDate!;
  const effectiveMaxDate = maxDate || minDate!;

  const bufferedMinDate = new Date(effectiveMinDate);
  bufferedMinDate.setDate(bufferedMinDate.getDate() - 3);
  const bufferedMaxDate = new Date(effectiveMaxDate);
  bufferedMaxDate.setDate(bufferedMaxDate.getDate() + 3);

  return {
    minDate: bufferedMinDate,
    maxDate: bufferedMaxDate
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
  Array.from(groupedByProject.entries()).forEach(([projectId, versionMap]) => {
    const project = projectMap.get(projectId);
    const projectName = project?.name || t('timeline.projectFallback', { id: projectId });
    const projectIdentifier = project?.identifier || '';

    Array.from(versionMap.entries()).forEach(([versionKey, versionBars]) => {
      const sortedBars = [...versionBars]
        .filter((bar) => bar.start_date && bar.end_date)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
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
          endDateStr
        };
      });

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
