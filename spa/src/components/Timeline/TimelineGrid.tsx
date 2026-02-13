import { addMonths, addWeeks, addDays, getDaysInMonth, differenceInDays, startOfWeek } from 'date-fns';
import { clsx } from 'clsx';
import { FilterState } from '../../stores/uiStore';

interface TimelineGridProps {
  startDate: Date;
  endDate: Date;
  viewMode: FilterState['viewMode'];
}

export const TimelineGrid = ({ startDate, endDate, viewMode }: TimelineGridProps) => {
  const totalDays = differenceInDays(endDate, startDate) + 1;

  const renderLines = () => {
    if (viewMode === 'month') {
      const monthsCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
      return Array.from({ length: monthsCount }).map((_, i) => {
        const d = addMonths(startDate, i);
        const days = getDaysInMonth(d);
        const widthPct = (days / totalDays) * 100;
        return (
          <div
            key={i}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "h-full border-r border-gray-100 last:border-r-0",
              i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
            )}
          />
        );
      });
    } else if (viewMode === 'week') {
      const lines = [];
      let current = startOfWeek(startDate, { weekStartsOn: 1 });
      let i = 0;
      while (current <= endDate) {
        const widthPct = (7 / totalDays) * 100;
        lines.push(
          <div
            key={current.toISOString()}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "h-full border-r border-gray-100 last:border-r-0",
              i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
            )}
          />
        );
        current = addWeeks(current, 1);
        i++;
      }
      return lines;
    } else {
      // Day view
      const lines = [];
      let current = startDate;
      while (current <= endDate) {
        const widthPct = (1 / totalDays) * 100;
        // Highlight weekends?
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        lines.push(
          <div
            key={current.toISOString()}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "h-full border-r border-gray-100 last:border-r-0",
              isWeekend ? "bg-gray-50/50" : "bg-white"
            )}
          />
        );
        current = addDays(current, 1);
      }
      return lines;
    }
  };

  return (
    <div className="absolute inset-0 flex pointer-events-none z-0">
      {renderLines()}
    </div>
  );
};
