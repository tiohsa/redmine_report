import { useEffect, useRef } from 'react';
import { TimelineLayout } from '../../services/TimelineService';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { TimelineArrows } from './TimelineArrows';
import { TodayMarker } from './TodayMarker';
import { TimelineRow } from './TimelineRow';
import { clsx } from 'clsx';

interface TimelineContainerProps {
  layout: TimelineLayout;
  projectIdentifier: string;
}

export const TimelineContainer = ({ layout, projectIdentifier }: TimelineContainerProps) => {
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync horizontal scrolling of header and content
  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current && scrollRef.current) {
        headerRef.current.scrollLeft = scrollRef.current.scrollLeft;
      }
    };
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (el) {
        el.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const MIN_WIDTH = 'min-w-[1000px]'; // Ensure enough space for months

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full bg-white relative">
      {/* Header Area */}
      <div className="flex flex-row border-b border-gray-200 bg-gray-50 flex-shrink-0 z-40 shadow-sm h-10">
        {/* Sidebar Header */}
        <div className="w-64 flex-shrink-0 px-4 flex items-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 bg-gray-50 sticky left-0 z-50">
          Project / Category
        </div>

        {/* Timeline Header (Scrollable, Synced) */}
        <div
          ref={headerRef}
          className="flex-1 overflow-hidden flex"
        >
          <div className={clsx("relative h-full flex-1", MIN_WIDTH)}>
            <TimelineHeader startDate={layout.startDate} endDate={layout.endDate} viewMode={layout.viewMode} />
          </div>
        </div>
      </div>

      {/* Body Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto flex flex-row relative scroll-smooth"
      >
        {/* Sidebar Body */}
        <div className="w-64 flex-shrink-0 sticky left-0 z-30 bg-white border-r border-gray-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)]">
          {layout.rows.map((row) => (
            <div
              key={row.project_id}
              className="border-b border-gray-100 flex items-center pr-2 truncate hover:bg-gray-50/50 transition-colors box-border"
              style={{ height: `${row.height}px`, paddingLeft: `${row.level * 16 + 16}px` }}
              title={row.name}
            >
              <span className={clsx("truncate text-sm", row.level === 0 ? "font-bold text-gray-900" : "text-gray-600")}>
                {row.name}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline Body */}
        <div className={clsx("flex-1 relative bg-white", MIN_WIDTH)}>
          <TimelineGrid startDate={layout.startDate} endDate={layout.endDate} viewMode={layout.viewMode} />
          <TimelineArrows />
          <TodayMarker startDate={layout.startDate} endDate={layout.endDate} totalDays={layout.totalDays} />

          <div className="relative z-10">
            {layout.rows.map((row) => (
              <TimelineRow key={row.project_id} row={row} projectIdentifier={projectIdentifier} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
