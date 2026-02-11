import { CategoryBar, ProjectRow } from './scheduleReportApi';

export type CalculatedBar = {
    data: CategoryBar;
    x: number;
    y: number;
    width: number;
    height: number;
    rowY: number; // Y position relative to the row start
};

export type CalculatedRow = {
    data: ProjectRow;
    y: number;
    height: number;
    bars: CalculatedBar[];
};

export class LayoutEngine {
    private readonly ROW_PADDING = 10;
    private readonly BAR_HEIGHT = 32;
    private readonly BAR_MARGIN = 8;
    private readonly HEADER_HEIGHT = 40;

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
            if (!row.expanded) {
                // If collapsed, we might skip or show summary. For now, let's assume standard behavior.
                // Current spec says "Project (and subproject)".
            }

            const projectBars = barsByProject.get(row.project_id) || [];
            const { rowHeight, calculatedBars } = this.layoutRow(projectBars, months, totalWidth, viewStartDate);

            calculatedRows.push({
                data: row,
                y: currentY,
                height: rowHeight,
                bars: calculatedBars.map(b => ({ ...b, y: currentY + b.rowY })),
            });

            currentY += rowHeight;
        });

        return { rows: calculatedRows, totalHeight: currentY };
    }

    private groupBarsByProject(bars: CategoryBar[]): Map<number, CategoryBar[]> {
        const map = new Map<number, CategoryBar[]>();
        bars.forEach((bar) => {
            const existing = map.get(bar.project_id) || [];
            existing.push(bar);
            map.set(bar.project_id, existing);
        });
        return map;
    }

    private layoutRow(
        bars: CategoryBar[],
        months: number,
        totalWidth: number,
        viewStartDate: Date
    ): { rowHeight: number; calculatedBars: CalculatedBar[] } {
        if (bars.length === 0) {
            return { rowHeight: 60, calculatedBars: [] }; // Minimum height
        }

        // Sort bars by start date
        const sortedBars = [...bars].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

        // Simple lane packing algorithm
        const lanes: number[] = []; // End X position of the last bar in each lane
        const calculatedBars: CalculatedBar[] = [];

        sortedBars.forEach((bar) => {
            const { startX, width } = this.calculateBarX(bar, months, totalWidth, viewStartDate);

            let laneIndex = -1;
            for (let i = 0; i < lanes.length; i++) {
                if (lanes[i] + 10 < startX) { // 10px gap
                    laneIndex = i;
                    break;
                }
            }

            if (laneIndex === -1) {
                laneIndex = lanes.length;
                lanes.push(0);
            }

            lanes[laneIndex] = startX + width;

            const rowY = this.ROW_PADDING + laneIndex * (this.BAR_HEIGHT + this.BAR_MARGIN);

            calculatedBars.push({
                data: bar,
                x: startX,
                y: 0, // Absolute Y will be set by parent
                width,
                height: this.BAR_HEIGHT,
                rowY,
            });
        });

        const rowHeight = this.ROW_PADDING * 2 + lanes.length * (this.BAR_HEIGHT + this.BAR_MARGIN);
        return { rowHeight: Math.max(rowHeight, 60), calculatedBars };
    }

    private calculateBarX(
        bar: CategoryBar,
        months: number,
        totalWidth: number,
        viewStartDate: Date
    ): { startX: number; width: number } {
        const startDate = new Date(bar.start_date);
        const endDate = new Date(bar.end_date);

        const msPerDay = 1000 * 60 * 60 * 24;
        const totalDays = months * 30; // Approx
        const pixelsPerDay = totalWidth / totalDays;

        const diffDaysStart = (startDate.getTime() - viewStartDate.getTime()) / msPerDay;
        const durationDays = (endDate.getTime() - startDate.getTime()) / msPerDay;

        const startX = Math.max(0, diffDaysStart * pixelsPerDay);
        const w = Math.max(10, durationDays * pixelsPerDay); // Min width 10px

        return { startX, width: w };
    }
}
