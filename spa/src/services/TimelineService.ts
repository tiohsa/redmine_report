import { addMonths, addWeeks, addDays, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { CategoryBar, ProjectRow } from './scheduleReportApi';
import { FilterState } from '../stores/uiStore';

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
    viewMode: FilterState['viewMode'];
};

export class TimelineService {
    calculateLayout(
        rows: ProjectRow[],
        bars: CategoryBar[],
        startDate: Date,
        endDate: Date,
        viewMode: FilterState['viewMode']
    ): TimelineLayout {
        const totalDays = differenceInDays(endDate, startDate) + 1; // Include end date

        // Group bars by project
        const barsByProject = new Map<number, CategoryBar[]>();
        bars.forEach(bar => {
            const list = barsByProject.get(bar.project_id) || [];
            list.push(bar);
            barsByProject.set(bar.project_id, list);
        });

        const timelineRows: TimelineRow[] = rows.map(row => {
            const projectBars = barsByProject.get(row.project_id) || [];
            const { bars: laidOutBars, laneCount } = this.layoutRow(projectBars, startDate, totalDays);

            // Calculate row height based on lanes.
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
            startDate,
            endDate,
            viewMode
        };
    }

    getTimelineRange(bars: CategoryBar[], viewMode: FilterState['viewMode'] = 'month', configuredMonths: number = 4): { startDate: Date; endDate: Date } {
        if (bars.length === 0) {
            const now = new Date();
            return this.getDefaultRange(now, viewMode, configuredMonths);
        }

        let minDate = new Date(bars[0].start_date);
        let maxDate = new Date(bars[0].end_date);

        bars.forEach(bar => {
            const start = new Date(bar.start_date);
            const end = new Date(bar.end_date);
            if (start < minDate) minDate = start;
            if (end > maxDate) maxDate = end;
        });

        return this.adjustRange(minDate, maxDate, viewMode, configuredMonths);
    }

    private getDefaultRange(date: Date, viewMode: FilterState['viewMode'], months: number): { startDate: Date; endDate: Date } {
        const start = new Date(date);
        if (viewMode === 'month') {
            return {
                startDate: startOfMonth(start),
                endDate: endOfMonth(addMonths(start, months - 1))
            };
        } else if (viewMode === 'week') {
            // Default 12 weeks?
            const s = startOfWeek(start, { weekStartsOn: 1 });
            return {
                startDate: s,
                endDate: addWeeks(s, 12)
            };
        } else {
            // Day view: Default 30 days?
            return {
                startDate: start,
                endDate: addDays(start, 30)
            };
        }
    }

    private adjustRange(min: Date, max: Date, viewMode: FilterState['viewMode'], months: number): { startDate: Date; endDate: Date } {
        if (viewMode === 'month') {
            const startDate = startOfMonth(min);
            // Ensure we show at least configured months or enough to cover max date
            let endDate = endOfMonth(max);
            const minEndDate = endOfMonth(addMonths(startDate, months - 1));
            if (endDate < minEndDate) {
                endDate = minEndDate;
            }
            return { startDate, endDate };
        } else if (viewMode === 'week') {
            const startDate = startOfWeek(min, { weekStartsOn: 1 });
            let endDate = endOfWeek(max, { weekStartsOn: 1 });
            // Ensure at least some weeks?
            const minEndDate = addWeeks(startDate, 4);
            if (endDate < minEndDate) endDate = minEndDate;
            return { startDate, endDate };
        } else {
            const startDate = min;
            let endDate = max;
            const minEndDate = addDays(startDate, 14);
            if (endDate < minEndDate) endDate = minEndDate;
            return { startDate, endDate };
        }
    }

    private layoutRow(
        bars: CategoryBar[],
        startDate: Date,
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
            const startOffset = differenceInDays(start, startDate);
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
                laneIndex,
                dependencies: bar.dependencies || []
            });
        });

        return { bars: resultBars, laneCount: lanes.length };
    }
}
