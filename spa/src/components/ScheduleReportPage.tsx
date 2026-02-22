import { useEffect, useRef, useState, useMemo } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { ProjectStatusReport } from './ProjectStatusReport';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { mapProjectInfo } from '../services/mappers/projectInfoMapper';
import { t } from '../i18n';

type ScheduleReportSnapshot = Awaited<ReturnType<typeof fetchScheduleReport>>;
type UiFilters = ReturnType<typeof useUiStore.getState>['filters'];

const collectTargets = (selectedProjectIdentifiers: string[], currentProjectIdentifier: string): string[] => {
  if (selectedProjectIdentifiers.length > 0) {
    return selectedProjectIdentifiers;
  }
  return currentProjectIdentifier ? [currentProjectIdentifier] : [];
};

const mergeWarnings = (warningsBySnapshot: string[][]): string[] => warningsBySnapshot.flat();

const fetchTargetSnapshot = async (
  rootProjectIdentifier: string,
  targetProjectIdentifier: string,
  filters: UiFilters
): Promise<ScheduleReportSnapshot | null> => {
  try {
    return await fetchScheduleReport(rootProjectIdentifier, targetProjectIdentifier, {
      ...filters,
      include_subprojects: false
    });
  } catch (err) {
    console.error(`Failed to fetch for ${targetProjectIdentifier}`, err);
    return null;
  }
};

const mergeAvailableProjects = (snapshots: ScheduleReportSnapshot[]) => {
  const allAvailableProjects = snapshots.flatMap((snapshot) => snapshot.available_projects || []);
  return Array.from(
    new Map(allAvailableProjects.map((project) => [project.identifier, project])).values()
  );
};

const mergeScheduleSnapshots = (snapshots: ScheduleReportSnapshot[]) => {
  const rawRows = snapshots.flatMap((snapshot) => snapshot.rows);
  const rawBars = snapshots.flatMap((snapshot) => snapshot.bars);
  const baseSnapshot = snapshots[0];
  const baseMeta = baseSnapshot.meta;

  return {
    rows: mapProjectRows(rawRows),
    bars: mapCategoryBars(rawBars),
    available_projects: mapProjectInfo(mergeAvailableProjects(snapshots)),
    selection_summary: baseSnapshot.selection_summary,
    meta: {
      ...baseMeta,
      warnings: mergeWarnings(snapshots.map((snapshot) => snapshot.meta.warnings))
    }
  };
};

const errorMessageForFetch = (error: unknown): string =>
  error instanceof Error ? error.message : t('schedule.fetchFailed');

const collectVersionNames = (bars: Array<{ version_name?: string }>): string[] => {
  const versions = new Set<string>();
  bars.forEach((bar) => {
    versions.add(bar.version_name || t('common.noVersion'));
  });
  return Array.from(versions).sort();
};

const areSameVersions = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((version, index) => version === right[index]);

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
  const [refreshToken, setRefreshToken] = useState(0);

  // Version Selection State
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const hasNoSnapshotData = snapshot.rows.length === 0 && snapshot.bars.length === 0;
  const hasCachedSnapshotData = !hasNoSnapshotData;
  const showInitialLoading = snapshot.isLoading && hasNoSnapshotData;
  const showUpdatingBanner = snapshot.isLoading && hasCachedSnapshotData;
  const showBlockingError = Boolean(snapshot.errorMessage) && hasNoSnapshotData;
  const showNonBlockingError = Boolean(snapshot.errorMessage) && hasCachedSnapshotData;

  // Extract all available versions from the current snapshot
  const allVersions = useMemo(() => collectVersionNames(snapshot.bars), [snapshot.bars]);

  // Reset selected versions when allVersions changes (new data loaded)
  // But only if we have data now
  useEffect(() => {
    if (allVersions.length === 0) {
      setSelectedVersions([]);
      return;
    }

    setSelectedVersions((current) => {
      if (areSameVersions(current, allVersions)) {
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
      targets.map((pid) => fetchTargetSnapshot(rootProjectIdentifier, pid, filters))
    )
      .then((results) => {
        if (requestId !== requestSequenceRef.current) return;

        const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        if (validResults.length === 0) {
          setError(t('schedule.fetchFailedSelected'));
          return;
        }

        setSnapshot(mergeScheduleSnapshots(validResults));
      })
      .catch((error) => {
        if (requestId !== requestSequenceRef.current) return;
        setError(errorMessageForFetch(error));
      })
      .finally(() => {
        if (requestId !== requestSequenceRef.current) return;
        setLoading(false);
      });
  }, [setSnapshot, setLoading, setError, filters, rootProjectIdentifier, currentProjectIdentifier, selectedProjectIdentifiers, refreshToken]);
  return (
    <div className="schedule-report-page bg-white h-screen flex flex-col overflow-auto">
      {showInitialLoading ? (
        <div className="flex items-center justify-center h-full text-gray-400">{t('common.loading')}</div>
      ) : (
        <ProjectStatusReport
          bars={snapshot.bars}
          projectIdentifier={currentProjectIdentifier}
          availableProjects={snapshot.available_projects}
          selectedVersions={selectedVersions}
          onVersionChange={setSelectedVersions}
          onTaskDatesUpdated={() => setRefreshToken((current) => current + 1)}
          fetchError={hasNoSnapshotData ? snapshot.errorMessage : null}
        />
      )}
      {showUpdatingBanner && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">{t('schedule.updating')}</div>
      )}
      {showBlockingError && (
        <div className="px-4 py-2 text-sm text-red-600 border-t border-red-100" role="alert">
          {snapshot.errorMessage}
        </div>
      )}
      {showNonBlockingError && (
        <div className="px-4 py-2 text-sm text-amber-700 border-t border-amber-100" role="alert">
          {t('schedule.refreshFailedShowingCached')}
        </div>
      )}
    </div>
  );
}
