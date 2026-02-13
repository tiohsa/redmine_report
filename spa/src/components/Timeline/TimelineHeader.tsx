import { addMonths, addWeeks, addDays, format, getDaysInMonth, differenceInDays, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { clsx } from 'clsx';
import { FilterState } from '../../stores/uiStore';

interface TimelineHeaderProps {
  startDate: Date;
  endDate: Date;
  viewMode: FilterState['viewMode'];
}

export const TimelineHeader = ({ startDate, endDate, viewMode }: TimelineHeaderProps) => {
  const totalDays = differenceInDays(endDate, startDate) + 1; // Include end date

  const renderCells = () => {
    if (viewMode === 'month') {
      const monthsCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
      return Array.from({ length: monthsCount }).map((_, i) => {
        const d = addMonths(startDate, i);
        const days = getDaysInMonth(d);
        // Adjust width if start/end dates are mid-month (though we snap to month boundaries currently)
        // For simplicity, assuming full months as per TimelineService
        const widthPct = (days / totalDays) * 100;

        return (
          <div
            key={i}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "flex-shrink-0 flex items-center justify-center",
              "border-r border-gray-200 text-sm font-medium text-gray-500 truncate"
            )}
            title={format(d, 'MMMM yyyy')}
          >
            {format(d, 'MMM yyyy').toUpperCase()}
          </div>
        );
      });
    } else if (viewMode === 'week') {
      // Iterate weeks
      const cells = [];
      let current = startOfWeek(startDate, { weekStartsOn: 1 });
      const weeksCount = Math.ceil(totalDays / 7) + 1; // Rough estimate, loop condition is better

      while (current <= endDate) {
        const weekEnd = addDays(current, 6);
        // Calculate width
        // If partial week is visible? TimelineService snaps to weeks
        const widthPct = (7 / totalDays) * 100;

        cells.push(
          <div
            key={current.toISOString()}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "flex-shrink-0 flex items-center justify-center",
              "border-r border-gray-200 text-xs font-medium text-gray-500 truncate px-1"
            )}
            title={`Week of ${format(current, 'PP')}`}
          >
            {format(current, 'MMM d')}
          </div>
        );
        current = addWeeks(current, 1);
      }
      return cells;
    } else {
      // Day view
      const cells = [];
      let current = startDate;
      while (current <= endDate) {
        const widthPct = (1 / totalDays) * 100;
        cells.push(
          <div
            key={current.toISOString()}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "flex-shrink-0 flex flex-col items-center justify-center",
              "border-r border-gray-200 text-[10px] text-gray-500 truncate"
            )}
            title={format(current, 'PP')}
          >
            <span className="font-bold">{format(current, 'd')}</span>
            <span className="text-[9px] uppercase">{format(current, 'EEE')}</span>
          </div>
        );
        current = addDays(current, 1);
      }
      return cells;
    }
  };

  return (
    <div className="flex h-full bg-gray-50">
      {renderCells()}
    </div>
  );
};
