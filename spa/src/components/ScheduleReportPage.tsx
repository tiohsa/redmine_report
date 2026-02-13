import { useEffect } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { ProjectStatusReport } from './ProjectStatusReport';
import { FilterToolbar } from './FilterToolbar';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

const projectIdentifier = (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';

export function ScheduleReportPage() {
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars }));
  const filters = useUiStore((s) => s.filters);


  // const [layout, setLayout] = useState<TimelineLayout | null>(null);

  //   const timelineService = useMemo(() => new TimelineService(), []);

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

  return (
    <div className="schedule-report-page bg-white h-screen flex flex-col overflow-hidden">
      <FilterToolbar />
      {snapshot.bars ? (
        <ProjectStatusReport bars={snapshot.bars} projectIdentifier={projectIdentifier} />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
      )}
    </div>
  );
}
