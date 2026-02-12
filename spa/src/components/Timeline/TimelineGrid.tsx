import { addMonths, getDaysInMonth, differenceInDays } from 'date-fns';
import { clsx } from 'clsx';

interface TimelineGridProps {
  startDate: Date;
  months: number;
}

export const TimelineGrid = ({ startDate, months }: TimelineGridProps) => {
  const endDate = addMonths(startDate, months);
  const totalDays = differenceInDays(endDate, startDate);

  return (
    <div className="absolute inset-0 flex pointer-events-none z-0">
      {Array.from({ length: months }).map((_, i) => {
        const d = addMonths(startDate, i);
        const days = getDaysInMonth(d);
        const widthPct = (days / totalDays) * 100;

        return (
          <div
            key={i}
            style={{ width: `${widthPct}%` }}
            className={clsx(
              "h-full border-r border-gray-100 last:border-r-0",
              i % 2 === 0 ? "bg-white" : "bg-gray-50/30" // Alternating background for months? Optional.
            )}
          />
        );
      })}
    </div>
  );
};
