import { describe, expect, it, vi } from 'vitest';
import { buildTimelineAxis, createDateToX, createRangeToWidth } from './timelineAxis';

vi.mock('../../i18n', async () => {
  const actual = await vi.importActual<typeof import('../../i18n')>('../../i18n');
  return {
    ...actual,
    t: (key: string) => key,
    getLocale: () => 'ja',
    getDateFnsLocale: () => undefined
  };
});

describe('buildTimelineAxis', () => {
  it('builds a buffered axis with year and month headers across boundaries', () => {
    const axis = buildTimelineAxis({
      items: [
        { start_date: '2025-12-30', end_date: '2026-01-05' },
        { start_date: '2026-02-01', end_date: '2026-02-03' }
      ],
      containerWidth: 640
    });

    expect(axis.axisStartDateIso).toBe('2025-12-27');
    expect(axis.axisEndDateIso).toBe('2026-02-06');
    expect(axis.headerYears.map((year) => year.year)).toEqual(['2025年', '2026年']);
    expect(axis.headerMonths.map((month) => month.label)).toEqual(expect.arrayContaining(['12月', '1月', '2月']));

    const toX = createDateToX(axis.minDate, axis.pixelsPerDay);
    const toWidth = createRangeToWidth(axis.pixelsPerDay);

    expect(toX('2025-12-30')).toBeCloseTo(axis.pixelsPerDay * 3, 4);
    expect(toWidth('2026-02-01', '2026-02-03')).toBeCloseTo(axis.pixelsPerDay * 3, 4);
  });
});
