import { addMonths, differenceInDays } from 'date-fns';
import { CategoryBar, ProjectRow } from './scheduleReportApi';

export type TimelineBar = CategoryBar & {
    leftPct: number;
    widthPct: number;
    laneIndex: number;
};

export type TimelineRow = ProjectRow & {
    bars: TimelineBar[];
    height: number; // Suggested height in pixels based on content
};

export type TimelineLayout = {
    rows: TimelineRow[];
    totalDays: number;
    startDate: Date;
    endDate: Date;
};

export class TimelineService {
    calculateLayout(
        rows: ProjectRow[],
        bars: CategoryBar[],
        months: number,
        viewStartDate: Date
    ): TimelineLayout {
        const endDate = addMonths(viewStartDate, months);
        const totalDays = differenceInDays(endDate, viewStartDate);

        // Group bars by project
        const barsByProject = new Map<number, CategoryBar[]>();
        bars.forEach(bar => {
            const list = barsByProject.get(bar.project_id) || [];
            list.push(bar);
            barsByProject.set(bar.project_id, list);
        });

        const timelineRows: TimelineRow[] = rows.map(row => {
            const projectBars = barsByProject.get(row.project_id) || [];
            const { bars: laidOutBars, laneCount } = this.layoutRow(projectBars, viewStartDate, totalDays);

            // Calculate row height based on lanes.
            // Base height + (laneCount * laneHeight)
            // Let's say each bar is 32px high with 8px margin.
            const BAR_HEIGHT = 32;
            const BAR_MARGIN = 8;
            const PADDING = 20;

            const height = Math.max(60, PADDING + laneCount * (BAR_HEIGHT + BAR_MARGIN));

            return {
                ...row,
                bars: laidOutBars,
                height
            };
        });

        return {
            rows: timelineRows,
            totalDays,
            startDate: viewStartDate,
            endDate
        };
    }

    private layoutRow(
        bars: CategoryBar[],
        viewStartDate: Date,
        totalDays: number
    ): { bars: TimelineBar[]; laneCount: number } {
        if (bars.length === 0) return { bars: [], laneCount: 0 };

        // Sort by start date
        const sortedBars = [...bars].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

        const lanes: number[] = []; // End day of the last bar in each lane
        const resultBars: TimelineBar[] = [];

        sortedBars.forEach(bar => {
            const start = new Date(bar.start_date);
            const end = new Date(bar.end_date);

            // Calculate position in days relative to view start
            const startOffset = differenceInDays(start, viewStartDate);
            const duration = differenceInDays(end, start);

            // Convert to percentage
            const leftPct = (startOffset / totalDays) * 100;
            const widthPct = Math.max((duration / totalDays) * 100, 0.5); // Min width 0.5%

            // Find lane
            let laneIndex = -1;
            for (let i = 0; i < lanes.length; i++) {
                if (lanes[i] <= startOffset) {
                    laneIndex = i;
                    break;
                }
            }
            if (laneIndex === -1) {
                laneIndex = lanes.length;
                lanes.push(0);
            }

            // Update lane end (with a buffer of say 1 day for visual gap)
            lanes[laneIndex] = startOffset + duration + 1;

            resultBars.push({
                ...bar,
                leftPct,
                widthPct,
                laneIndex
            });
        });

        return { bars: resultBars, laneCount: lanes.length };
    }
}
