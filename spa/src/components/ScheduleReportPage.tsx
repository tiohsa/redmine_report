import { useEffect, useRef, useState, useMemo } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { ProjectStatusReport } from './ProjectStatusReport';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { mapProjectInfo } from '../services/mappers/projectInfoMapper';

const collectTargets = (selectedProjectIdentifiers: string[], currentProjectIdentifier: string): string[] => {
  if (selectedProjectIdentifiers.length > 0) {
    return selectedProjectIdentifiers;
  }
  return currentProjectIdentifier ? [currentProjectIdentifier] : [];
};

const mergeWarnings = (warningsBySnapshot: string[][]): string[] => warningsBySnapshot.flat();

export function ScheduleReportPage() {
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const setLoading = useTaskStore((s) => s.setLoading);
  const setError = useTaskStore((s) => s.setError);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars, isLoading: s.isLoading, errorMessage: s.errorMessage, available_projects: s.availableProjects }));
  const filters = useUiStore((s) => s.filters);
  const rootProjectIdentifier = useUiStore((s) => s.rootProjectIdentifier);
  const currentProjectIdentifier = useUiStore((s) => s.currentProjectIdentifier);
  const selectedProjectIdentifiers = useUiStore((s) => s.selectedProjectIdentifiers);
  const requestSequenceRef = useRef(0);

  // Version Selection State
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

  // Extract all available versions from the current snapshot
  const allVersions = useMemo(() => {
    const versions = new Set<string>();
    snapshot.bars.forEach(bar => {
      versions.add(bar.version_name || 'No Version');
    });
    return Array.from(versions).sort();
  }, [snapshot.bars]);

  // Reset selected versions when allVersions changes (new data loaded)
  // But only if we have data now
  useEffect(() => {
    if (allVersions.length === 0) {
      setSelectedVersions([]);
      return;
    }

    setSelectedVersions((current) => {
      if (
        current.length === allVersions.length &&
        current.every((version, index) => version === allVersions[index])
      ) {
        return current;
      }
      return allVersions;
    });
  }, [allVersions]);

  useEffect(() => {
    if (!rootProjectIdentifier) return;

    const targets = collectTargets(selectedProjectIdentifiers || [], currentProjectIdentifier);

    if (targets.length === 0) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);

    Promise.all(
      targets.map((pid) =>
        fetchScheduleReport(rootProjectIdentifier, pid, {
          ...filters,
          include_subprojects: false
        }).catch((err) => {
          console.error(`Failed to fetch for ${pid}`, err);
          return null;
        })
      )
    )
      .then((results) => {
        if (requestId !== requestSequenceRef.current) return;

        const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        if (validResults.length === 0) {
          setError('Failed to fetch schedule report for selected projects.');
          return;
        }

        // Merge results
        const rawRows = validResults.flatMap((r) => r.rows);
        const rawBars = validResults.flatMap((r) => r.bars);

        // Merge available projects from all responses to ensure we have info for all
        const allAvailableProjects = validResults.flatMap((r) => r.available_projects || []);
        const uniqueAvailableProjects = Array.from(
          new Map(allAvailableProjects.map((p) => [p.identifier, p])).values()
        );

        // Keep base metadata from first snapshot and merge warnings from every response.
        const baseMeta = validResults[0].meta;

        setSnapshot({
          rows: mapProjectRows(rawRows),
          bars: mapCategoryBars(rawBars),
          available_projects: mapProjectInfo(uniqueAvailableProjects),
          selection_summary: validResults[0].selection_summary,
          meta: {
            ...baseMeta,
            warnings: mergeWarnings(validResults.map((result) => result.meta.warnings))
          }
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
  }, [setSnapshot, setLoading, setError, filters, rootProjectIdentifier, currentProjectIdentifier, selectedProjectIdentifiers]);



  return (
    <div className="schedule-report-page bg-white h-screen flex flex-col overflow-hidden">
      {snapshot.isLoading && snapshot.rows.length === 0 && snapshot.bars.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
      ) : (
        <ProjectStatusReport
          bars={snapshot.bars}
          projectIdentifier={currentProjectIdentifier}
          availableProjects={snapshot.available_projects}
          selectedVersions={selectedVersions}
          onVersionChange={setSelectedVersions}
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
