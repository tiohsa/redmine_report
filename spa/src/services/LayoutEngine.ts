import { CategoryBar, ProjectRow } from './scheduleReportApi';
import { differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from './dateUtils';

export type CalculatedBar = {
  data: CategoryBar;
  x: number;
  y: number;
  width: number;
  height: number;
  rowY: number;
};

export type CalculatedRow = {
  data: ProjectRow;
  y: number;
  height: number;
  bars: CalculatedBar[];
};

const ROW_PADDING = 10;
const BAR_HEIGHT = 32;
const BAR_MARGIN = 8;
const MIN_ROW_HEIGHT = 60;
const LANE_GAP = 10;

const safeDate = (value: string) => startOfDay(new Date(value));

export class LayoutEngine {
  calculateLayout(
    rows: ProjectRow[],
    bars: CategoryBar[],
    months: number,
    totalWidth: number,
    viewStartDate: Date
  ): { rows: CalculatedRow[]; totalHeight: number } {
    const barsByProject = this.groupBarsByProject(bars);
    let currentY = 0;
    const calculatedRows: CalculatedRow[] = [];

    rows.forEach((row) => {
      const projectBars = barsByProject.get(row.project_id) || [];
      const { rowHeight, calculatedBars } = this.layoutRow(projectBars, months, totalWidth, viewStartDate);

      calculatedRows.push({
        data: row,
        y: currentY,
        height: rowHeight,
        bars: calculatedBars.map((bar) => ({ ...bar, y: currentY + bar.rowY }))
      });

      currentY += rowHeight;
    });

    return { rows: calculatedRows, totalHeight: currentY };
  }

  private groupBarsByProject(bars: CategoryBar[]): Map<number, CategoryBar[]> {
    return bars.reduce((map, bar) => {
      const existing = map.get(bar.project_id) || [];
      existing.push(bar);
      map.set(bar.project_id, existing);
      return map;
    }, new Map<number, CategoryBar[]>());
  }

  private layoutRow(
    bars: CategoryBar[],
    months: number,
    totalWidth: number,
    viewStartDate: Date
  ): { rowHeight: number; calculatedBars: CalculatedBar[] } {
    if (bars.length === 0) {
      return { rowHeight: MIN_ROW_HEIGHT, calculatedBars: [] };
    }

    const sortedBars = [...bars].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const lanes: number[] = [];
    const calculatedBars: CalculatedBar[] = [];

    sortedBars.forEach((bar) => {
      const { startX, width } = this.calculateBarX(bar, months, totalWidth, viewStartDate);

      let laneIndex = lanes.findIndex((lastBarRight) => lastBarRight + LANE_GAP < startX);
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push(0);
      }

      lanes[laneIndex] = startX + width;

      calculatedBars.push({
        data: bar,
        x: startX,
        y: 0,
        width,
        height: BAR_HEIGHT,
        rowY: ROW_PADDING + laneIndex * (BAR_HEIGHT + BAR_MARGIN)
      });
    });

    const rowHeight = ROW_PADDING * 2 + lanes.length * (BAR_HEIGHT + BAR_MARGIN);
    return { rowHeight: Math.max(rowHeight, MIN_ROW_HEIGHT), calculatedBars };
  }

  private calculateBarX(
    bar: CategoryBar,
    months: number,
    totalWidth: number,
    viewStartDate: Date
  ): { startX: number; width: number } {
    const startDate = safeDate(bar.start_date);
    const endDate = safeDate(bar.end_date);
    const timelineStart = startOfMonth(viewStartDate);
    const timelineEnd = endOfMonth(new Date(viewStartDate.getFullYear(), viewStartDate.getMonth() + months - 1, 1));

    const clampedEnd = endDate > timelineEnd ? timelineEnd : endDate;
    const totalDays = Math.max(1, differenceInCalendarDays(timelineEnd, timelineStart) + 1);
    const pixelsPerDay = totalWidth / totalDays;

    const diffDaysStart = differenceInCalendarDays(startDate, timelineStart);
    const durationDays = Math.max(1, differenceInCalendarDays(clampedEnd, startDate) + 1);

    return {
      startX: Math.max(0, diffDaysStart * pixelsPerDay),
      width: Math.max(10, durationDays * pixelsPerDay)
    };
  }
}
