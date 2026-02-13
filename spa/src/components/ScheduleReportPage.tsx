import { useEffect, useRef } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { ProjectStatusReport } from './ProjectStatusReport';
import { FilterToolbar } from './FilterToolbar';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { mapProjectInfo } from '../services/mappers/projectInfoMapper';



export function ScheduleReportPage() {
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const setLoading = useTaskStore((s) => s.setLoading);
  const setError = useTaskStore((s) => s.setError);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars, isLoading: s.isLoading, errorMessage: s.errorMessage }));
  const filters = useUiStore((s) => s.filters);
  const rootProjectIdentifier = useUiStore((s) => s.rootProjectIdentifier);
  const currentProjectIdentifier = useUiStore((s) => s.currentProjectIdentifier);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    if (!currentProjectIdentifier || !rootProjectIdentifier) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);

    void fetchScheduleReport(rootProjectIdentifier, currentProjectIdentifier, {
      ...filters,
      include_subprojects: false
    })
      .then((data) => {
        if (requestId !== requestSequenceRef.current) return;
        setSnapshot({
          ...data,
          rows: mapProjectRows(data.rows),
          bars: mapCategoryBars(data.bars),
          available_projects: mapProjectInfo(data.available_projects || [])
        });
      })
      .catch((error) => {
        if (requestId !== requestSequenceRef.current) return;
        setError(error instanceof Error ? error.message : 'Failed to fetch schedule report.');
      })
      .finally(() => {
        if (requestId !== requestSequenceRef.current) return;
        setLoading(false);
      });
  }, [setSnapshot, setLoading, setError, filters, rootProjectIdentifier, currentProjectIdentifier]);

  return (
    <div className="schedule-report-page bg-white h-screen flex flex-col overflow-hidden">
      <FilterToolbar />
      {snapshot.isLoading && snapshot.rows.length === 0 && snapshot.bars.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
      ) : (
        <ProjectStatusReport
          bars={snapshot.bars}
          projectIdentifier={currentProjectIdentifier}
          fetchError={snapshot.rows.length === 0 && snapshot.bars.length === 0 ? snapshot.errorMessage : null}
        />
      )}
      {snapshot.isLoading && snapshot.rows.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">Updating report…</div>
      )}
      {snapshot.errorMessage && snapshot.rows.length === 0 && snapshot.bars.length === 0 && (
        <div className="px-4 py-2 text-sm text-red-600 border-t border-red-100" role="alert">
          {snapshot.errorMessage}
        </div>
      )}
      {snapshot.errorMessage && snapshot.rows.length > 0 && (
        <div className="px-4 py-2 text-sm text-amber-700 border-t border-amber-100" role="alert">
          Failed to refresh report. Showing last successful data.
        </div>
      )}
    </div>
  );
}
