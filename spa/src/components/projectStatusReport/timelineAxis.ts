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
import { getDateFnsLocale, getLocale, t } from '../../i18n';

export function calculateStaggeredLanes<T>(
  items: T[],
  getStartDate: (item: T) => string | undefined | null,
  getEndDate: (item: T) => string | undefined | null
): (T & { laneIndex: number })[] {
  const sortedItems = [...items].sort((a, b) => {
    const aStart = getStartDate(a) || '9999-12-31';
    const bStart = getStartDate(b) || '9999-12-31';
    const aEnd = getEndDate(a) || '9999-12-31';
    const bEnd = getEndDate(b) || '9999-12-31';
    const startCmp = aStart.localeCompare(bStart);
    return startCmp !== 0 ? startCmp : aEnd.localeCompare(bEnd);
  });

  const lanesEndDate: Date[] = [];

  return sortedItems.map(item => {
    const startStr = getStartDate(item) || '9999-12-31';
    const endStr = getEndDate(item) || '9999-12-31';
    const start = parseISO(startStr);
    const end = parseISO(endStr);

    let maxOverlappingLane = -1;
    for (let i = 0; i < lanesEndDate.length; i++) {
      if (!isAfter(start, lanesEndDate[i])) {
        maxOverlappingLane = Math.max(maxOverlappingLane, i);
      }
    }

    const assignedLane = maxOverlappingLane + 1;

    if (assignedLane >= lanesEndDate.length) {
      lanesEndDate.push(end);
    } else {
      lanesEndDate[assignedLane] = end;
    }

    return { ...item, laneIndex: assignedLane };
  });
}

export type TimelineAxisItem = {
  start_date?: string | null;
  end_date?: string | null;
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

export type TimelineAxis = {
  minDate: Date;
  maxDate: Date;
  timelineWidth: number;
  headerMonths: HeaderMonth[];
  headerYears: HeaderYear[];
  totalDurationText: string;
  todayX: number;
  axisStartDateIso: string;
  axisEndDateIso: string;
  pixelsPerDay: number;
};

export const DEFAULT_TIMELINE_WIDTH = 1000;
const DEFAULT_LEFT_BUFFER_DAYS = 3;
const DEFAULT_RIGHT_BUFFER_DAYS = 3;

export function buildTimelineAxis({
  items,
  containerWidth,
  displayStartDateIso,
  displayEndDateIso,
  defaultTimelineWidth = DEFAULT_TIMELINE_WIDTH,
  leftBufferDays = DEFAULT_LEFT_BUFFER_DAYS,
  rightBufferDays = DEFAULT_RIGHT_BUFFER_DAYS
}: {
  items: TimelineAxisItem[];
  containerWidth: number;
  displayStartDateIso?: string;
  displayEndDateIso?: string;
  defaultTimelineWidth?: number;
  leftBufferDays?: number;
  rightBufferDays?: number;
}): TimelineAxis {
  const { minDate, maxDate } = getDateRangeWithBuffer(items, {
    displayStartDateIso,
    displayEndDateIso,
    leftBufferDays,
    rightBufferDays
  });
  const totalDays = differenceInDays(maxDate, minDate) + 1;
  const timelineWidth = containerWidth > 0 ? containerWidth : defaultTimelineWidth;
  const pixelsPerDay = timelineWidth / totalDays;
  const dateToX = createDateToX(minDate, pixelsPerDay);

  return {
    minDate,
    maxDate,
    timelineWidth,
    headerMonths: buildHeaderMonths(minDate, maxDate, pixelsPerDay),
    headerYears: buildHeaderYears(minDate, maxDate, pixelsPerDay),
    totalDurationText: `${format(minDate, 'yyyy/MM/dd')} - ${format(maxDate, 'yyyy/MM/dd')}`,
    todayX: dateToX(format(new Date(), 'yyyy-MM-dd')) + pixelsPerDay / 2,
    axisStartDateIso: format(minDate, 'yyyy-MM-dd'),
    axisEndDateIso: format(maxDate, 'yyyy-MM-dd'),
    pixelsPerDay
  };
}

export function createDateToX(minDate: Date, pixelsPerDay: number) {
  return (dateStr?: string | null): number => {
    if (!dateStr) return 0;
    return differenceInDays(parseISO(dateStr), minDate) * pixelsPerDay;
  };
}

export function createRangeToWidth(pixelsPerDay: number) {
  return (startStr?: string | null, endStr?: string | null): number => {
    if (!startStr || !endStr) return 0;
    return Math.max(differenceInDays(parseISO(endStr), parseISO(startStr)) + 1, 0.5) * pixelsPerDay;
  };
}

export function getDateRangeWithBuffer(
  items: TimelineAxisItem[],
  displayRange: {
    displayStartDateIso?: string;
    displayEndDateIso?: string;
    leftBufferDays?: number;
    rightBufferDays?: number;
  }
): { minDate: Date; maxDate: Date } {
  const configuredRange = resolveConfiguredDateRange(displayRange.displayStartDateIso, displayRange.displayEndDateIso);
  if (configuredRange) {
    return configuredRange;
  }

  const leftBufferDays = Math.max(displayRange.leftBufferDays ?? DEFAULT_LEFT_BUFFER_DAYS, 0);
  const rightBufferDays = Math.max(displayRange.rightBufferDays ?? DEFAULT_RIGHT_BUFFER_DAYS, 0);

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  items.forEach((item) => {
    if (item.start_date) {
      const startDate = parseISO(item.start_date);
      if (!minDate || isBefore(startDate, minDate)) minDate = startDate;
    }

    if (item.end_date) {
      const endDate = parseISO(item.end_date);
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
  bufferedMinDate.setDate(bufferedMinDate.getDate() - leftBufferDays);
  const bufferedMaxDate = new Date(effectiveMaxDate);
  bufferedMaxDate.setDate(bufferedMaxDate.getDate() + rightBufferDays);

  return {
    minDate: bufferedMinDate,
    maxDate: bufferedMaxDate
  };
}

export function resolveConfiguredDateRange(
  displayStartDateIso?: string,
  displayEndDateIso?: string
): { minDate: Date; maxDate: Date } | null {
  if (!displayStartDateIso || !displayEndDateIso) return null;

  const minDate = parseISO(displayStartDateIso);
  const maxDate = parseISO(displayEndDateIso);

  if (Number.isNaN(minDate.getTime()) || Number.isNaN(maxDate.getTime()) || isAfter(minDate, maxDate)) {
    return null;
  }

  return { minDate, maxDate };
}

export function buildHeaderMonths(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderMonth[] {
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

export function buildHeaderYears(minDate: Date, maxDate: Date, pixelsPerDay: number): HeaderYear[] {
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
