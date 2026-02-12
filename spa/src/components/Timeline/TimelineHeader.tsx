import { addMonths, format, getDaysInMonth, differenceInDays } from 'date-fns';
import { clsx } from 'clsx';

interface TimelineHeaderProps {
  startDate: Date;
  months: number;
}

export const TimelineHeader = ({ startDate, months }: TimelineHeaderProps) => {
  const endDate = addMonths(startDate, months);
  const totalDays = differenceInDays(endDate, startDate);

  return (
    <div className="flex h-full bg-gray-50">
      {Array.from({ length: months }).map((_, i) => {
        const d = addMonths(startDate, i);
        const days = getDaysInMonth(d);
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
      })}
    </div>
  );
};
