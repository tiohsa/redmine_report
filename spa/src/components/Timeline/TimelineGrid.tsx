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

  const renderGrid = () => {
    if (viewMode === 'month') {
      const monthsCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
      return Array.from({ length: monthsCount }).map((_, i) => {
        const d = addMonths(startDate, i);
        const days = getDaysInMonth(d);
        const widthPct = (days / totalDays) * 100;

        // Calculate cumulative left position
        const startDiff = differenceInDays(d, startDate);
        const leftPct = (startDiff / totalDays) * 100;

        return (
          <g key={i}>
            {/* Alternating Background */}
            {i % 2 !== 0 && (
              <rect
                x={`${leftPct}%`}
                y="0"
                width={`${widthPct}%`}
                height="100%"
                className="fill-gray-50/30"
              />
            )}
            {/* Vertical Line (Right Border) */}
            <line
              x1={`${leftPct + widthPct}%`}
              y1="0"
              x2={`${leftPct + widthPct}%`}
              y2="100%"
              className="stroke-gray-100"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      });
    } else if (viewMode === 'week') {
      const elements = [];
      let current = startOfWeek(startDate, { weekStartsOn: 1 });
      let i = 0;

      while (current <= endDate) {
        const widthPct = (7 / totalDays) * 100;
        const startDiff = differenceInDays(current, startDate);
        const leftPct = (startDiff / totalDays) * 100;

        elements.push(
          <g key={current.toISOString()}>
            {i % 2 !== 0 && (
              <rect
                x={`${leftPct}%`}
                y="0"
                width={`${widthPct}%`}
                height="100%"
                className="fill-gray-50/30"
              />
            )}
            <line
              x1={`${leftPct + widthPct}%`}
              y1="0"
              x2={`${leftPct + widthPct}%`}
              y2="100%"
              className="stroke-gray-100"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
        current = addWeeks(current, 1);
        i++;
      }
      return elements;
    } else {
      // Day view
      const elements = [];
      let current = startDate;

      // For performance in day view with many days, we might want to optimize this
      // But for now, direct port
      while (current <= endDate) {
        const widthPct = (1 / totalDays) * 100;
        const startDiff = differenceInDays(current, startDate);
        const leftPct = (startDiff / totalDays) * 100;

        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        elements.push(
          <g key={current.toISOString()}>
            {isWeekend && (
              <rect
                x={`${leftPct}%`}
                y="0"
                width={`${widthPct}%`}
                height="100%"
                className="fill-gray-50/50"
              />
            )}
            <line
              x1={`${leftPct + widthPct}%`}
              y1="0"
              x2={`${leftPct + widthPct}%`}
              y2="100%"
              className="stroke-gray-100"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
        current = addDays(current, 1);
      }
      return elements;
    }
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
      {renderGrid()}
    </svg>
  );
};
