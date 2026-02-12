import { clsx } from 'clsx';
import { TimelineBar } from '../../services/TimelineService';
import { buildIssueListUrl } from '../../services/issueLinkService';

interface TaskBarProps {
  bar: TimelineBar;
  projectIdentifier: string;
  height?: number; // Height of the bar itself
  marginTop?: number; // Top margin for the row
  gap?: number; // Gap between stacked bars
}

export const TaskBar = ({ bar, projectIdentifier, height = 32, marginTop = 10, gap = 8 }: TaskBarProps) => {
  const isDelayed = bar.is_delayed;

  // Calculate top position based on lane index
  const top = marginTop + bar.laneIndex * (height + gap);
  const href = buildIssueListUrl(projectIdentifier, bar.category_id);

  return (
    <a
      href={href}
      className={clsx(
        "absolute rounded-md shadow-sm border border-transparent hover:border-gray-400 transition-colors cursor-pointer group flex items-center px-2 overflow-hidden no-underline",
        isDelayed ? "bg-red-100" : "bg-blue-100"
      )}
      style={{
        left: `${bar.leftPct}%`,
        width: `${bar.widthPct}%`,
        height: `${height}px`,
        top: `${top}px`,
        zIndex: 10,
      }}
      title={`${bar.category_name}: ${Math.round(bar.progress_rate)}% complete`}
    >
      {/* Progress Overlay (Filled portion) */}
      <div
        className={clsx(
          "absolute left-0 top-0 h-full pointer-events-none transition-all duration-300",
          isDelayed ? "bg-red-600" : "bg-blue-600"
        )}
        style={{ width: `${bar.progress_rate}%` }}
      />

      {/* Label */}
      {/* Label */}
      <span className="relative z-10 text-white text-xs font-bold truncate w-full text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {bar.category_name}
      </span>

      {/* Percentage Badge - only show if bar is wide enough */}
      {bar.progress_rate > 0 && (
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-mono hidden sm:inline-block">
          {Math.round(bar.progress_rate)}%
        </span>
      )}
    </a>
  );
};
