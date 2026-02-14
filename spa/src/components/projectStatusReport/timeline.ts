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
  startOfYear
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { CategoryBar, ProjectInfo } from '../../services/scheduleReportApi';
import { STATUS, StatusStyle } from './constants';

export type TimelineStep = {
  name: string;
  x: number;
  width: number;
  status: StatusStyle;
  progress?: number;
  id: string;
  startDate?: string;
  endDate?: string;
};

export type TimelineLane = {
  laneKey: string;
  projectId: number;
  projectName: string;
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

export function buildTimelineViewModel({
  bars,
  selectedVersions,
  projectMap,
  containerWidth
}: TimelineCalculationInput): TimelineViewModel {
  if (bars.length === 0) {
    return {
      timelineData: [],
      timelineWidth: DEFAULT_TIMELINE_WIDTH,
      headerMonths: [],
      headerYears: [],
      totalDurationText: 'データなし',
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
    getWidth
  });

  return {
    timelineData,
    timelineWidth: effectiveContainerWidth,
    headerMonths,
    headerYears,
    totalDurationText: `表示期間: ${format(minDate, 'yyyy/MM/dd')} - ${format(maxDate, 'yyyy/MM/dd')}`,
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
  bufferedMinDate.setDate(bufferedMinDate.getDate() - 2);
  const bufferedMaxDate = new Date(maxDate);
  bufferedMaxDate.setDate(bufferedMaxDate.getDate() + 2);

  return { minDate: bufferedMinDate, maxDate: bufferedMaxDate };
}

function buildHeaderMonths(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderMonth[] {
  const headerMonths: HeaderMonth[] = [];
  let currentMonth = minDate;

  while (isBefore(currentMonth, maxDate) || currentMonth.getTime() === maxDate.getTime()) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const visibleStart = isBefore(monthStart, minDate) ? minDate : monthStart;
    const visibleEnd = isAfter(monthEnd, maxDate) ? maxDate : monthEnd;

    const monthDays = differenceInDays(visibleEnd, visibleStart) + 1;

    headerMonths.push({
      label: format(currentMonth, 'M月', { locale: ja }),
      x: differenceInDays(visibleStart, minDate) * pixelsPerDay,
      width: monthDays * pixelsPerDay
    });

    currentMonth = addMonths(currentMonth, 1);
  }

  return headerMonths;
}

function buildHeaderYears(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderYear[] {
  const headerYears: HeaderYear[] = [];
  let currentYearDate = startOfYear(minDate);

  while (isBefore(currentYearDate, maxDate) || currentYearDate.getTime() <= maxDate.getTime()) {
    const yearStart = startOfYear(currentYearDate);
    const yearEnd = endOfYear(currentYearDate);

    const visibleStart = isBefore(yearStart, minDate) ? minDate : yearStart;
    const visibleEnd = isAfter(yearEnd, maxDate) ? maxDate : yearEnd;

    if (isBefore(visibleStart, visibleEnd) || visibleStart.getTime() === visibleEnd.getTime()) {
      const yearDays = differenceInDays(visibleEnd, visibleStart) + 1;

      headerYears.push({
        year: format(currentYearDate, 'yyyy年', { locale: ja }),
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
  getWidth
}: {
  bars: CategoryBar[];
  selectedVersions: string[];
  projectMap: Map<number, ProjectInfo>;
  getX: (dateStr?: string) => number;
  getWidth: (startStr?: string, endStr?: string) => number;
}): TimelineLane[] {
  const groupedByProject = new Map<number, Map<string, CategoryBar[]>>();

  bars.forEach((bar) => {
    const versionKey = bar.version_name || 'No Version';
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
    const projectName = projectMap.get(projectId)?.name || `Project ${projectId}`;

    Array.from(versionMap.entries()).forEach(([versionKey, versionBars]) => {
      const sortedBars = [...versionBars].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

      timelineData.push({
        laneKey: `${projectId}:${versionKey}`,
        projectId,
        projectName,
        versionName: versionKey,
        steps: sortedBars.map((bar, idx) => {
          const { status, progress } = resolveStatus(bar.progress_rate);

          return {
            name: bar.ticket_subject || bar.category_name,
            x: getX(bar.start_date),
            width: getWidth(bar.start_date, bar.end_date),
            status,
            progress,
            id: `ticket-${bar.project_id}-${bar.category_id}-${idx}`,
            startDate: toLabelDate(bar.start_date),
            endDate: toLabelDate(bar.end_date)
          };
        })
      });
    });
  });

  return timelineData;
}

function resolveStatus(progressRate: number): { status: StatusStyle; progress?: number } {
  if (progressRate === 100) {
    return { status: STATUS.COMPLETED };
  }

  if (progressRate > 0) {
    return { status: STATUS.IN_PROGRESS, progress: progressRate };
  }

  return { status: STATUS.PENDING };
}

function toLabelDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}
