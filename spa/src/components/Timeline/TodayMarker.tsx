

interface TodayMarkerProps {
  startDate: Date;
  endDate: Date;
  totalDays: number; // Optional optimization
  variant?: 'header' | 'body';
}

export const TodayMarker = ({ startDate, endDate, variant = 'body' }: TodayMarkerProps) => {
  const today = new Date();

  // More precise calculation
  const totalMs = endDate.getTime() - startDate.getTime();
  const currentMs = today.getTime() - startDate.getTime();

  if (currentMs < 0 || currentMs > totalMs) return null;

  const leftPct = (currentMs / totalMs) * 100;

  if (variant === 'header') {
    return (
      <div
        className="absolute top-0 bottom-0 w-0 z-30 pointer-events-none"
        style={{ left: `${leftPct}%` }}
      >
        <div className="absolute top-0 left-0 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-b shadow-sm whitespace-nowrap">
          Today
        </div>
        {/* Small arrow or indicator at the bottom of header if needed, but the label is usually enough */}
        <div className="absolute bottom-0 left-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-red-500"></div>
      </div>
    );
  }

  // Body variant
  return (
    <div
      className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-red-500 z-30 pointer-events-none"
      style={{ left: `${leftPct}%` }}
    >
      {/* No label in body */}
    </div>
  );
};
