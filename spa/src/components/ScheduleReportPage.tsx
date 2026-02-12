import { useEffect, useMemo, useState } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { TimelineService, TimelineLayout } from '../services/TimelineService';
import { TimelineContainer } from './Timeline/TimelineContainer';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

const projectIdentifier = (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';

export function ScheduleReportPage() {
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars }));
  const filters = useUiStore((s) => s.filters);
  const months = filters.months;

  const [layout, setLayout] = useState<TimelineLayout | null>(null);

  const timelineService = useMemo(() => new TimelineService(), []);

  // Fetch Data
  useEffect(() => {
    if (!projectIdentifier) return;
    void fetchScheduleReport(projectIdentifier, filters).then((data) => {
      setSnapshot({
        ...data,
        rows: mapProjectRows(data.rows),
        bars: mapCategoryBars(data.bars)
      });
    });
  }, [setSnapshot, filters]);

  // Helper to determine view start date
  const viewStartDate = useMemo(() => {
    if (filters.start_month) {
      return new Date(`${filters.start_month}-01`);
    }
    const d = new Date();
    d.setDate(1);
    return d;
  }, [filters.start_month]);

  // Calculate Layout
  useEffect(() => {
    const newLayout = timelineService.calculateLayout(snapshot.rows, snapshot.bars, months, viewStartDate);
    setLayout(newLayout);
  }, [timelineService, snapshot.rows, snapshot.bars, months, viewStartDate]);

  return (
    <div className="schedule-report-page bg-white h-screen flex flex-col overflow-hidden">
      {layout ? (
        <TimelineContainer layout={layout} months={months} projectIdentifier={projectIdentifier} />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
      )}
    </div>
  );
}
