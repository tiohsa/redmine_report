import { addMonths } from 'date-fns';

interface TodayMarkerProps {
  startDate: Date;
  months: number;
}

export const TodayMarker = ({ startDate, months }: TodayMarkerProps) => {
  const today = new Date();
  const endDate = addMonths(startDate, months);

  // More precise calculation
  const totalMs = endDate.getTime() - startDate.getTime();
  const currentMs = today.getTime() - startDate.getTime();

  if (currentMs < 0 || currentMs > totalMs) return null;

  const leftPct = (currentMs / totalMs) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-red-500 z-30 pointer-events-none"
      style={{ left: `${leftPct}%` }}
    >
      <div className="absolute top-0 left-0 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-b shadow-sm whitespace-nowrap">
        Today
      </div>
    </div>
  );
};
