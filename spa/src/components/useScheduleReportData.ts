import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectInfo } from '../services/mappers/projectInfoMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { fetchScheduleReport, type ReportFilterSet } from '../services/scheduleReportApi';
import { useTaskStore } from '../stores/taskStore';

type ScheduleReportSnapshot = Awaited<ReturnType<typeof fetchScheduleReport>>;

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
  filters: ReportFilterSet,
): Promise<ScheduleReportSnapshot | null> => {
  try {
    return await fetchScheduleReport(rootProjectIdentifier, targetProjectIdentifier, {
      ...filters,
      include_subprojects: false,
    });
  } catch (error) {
    console.error(`Failed to fetch for ${targetProjectIdentifier}`, error);
    return null;
  }
};

const mergeAvailableProjects = (snapshots: ScheduleReportSnapshot[]) => {
  const allAvailableProjects = snapshots.flatMap((snapshot) => snapshot.available_projects || []);

  return Array.from(
    new Map(allAvailableProjects.map((project) => [project.identifier, project])).values(),
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
      warnings: mergeWarnings(snapshots.map((snapshot) => snapshot.meta.warnings)),
    },
  };
};

const errorMessageForFetch = (error: unknown): string =>
  error instanceof Error ? error.message : t('schedule.fetchFailed');

type UseScheduleReportDataArgs = {
  filters: ReportFilterSet;
  rootProjectIdentifier: string;
  currentProjectIdentifier: string;
  selectedProjectIdentifiers: string[];
};

export const useScheduleReportData = ({
  filters,
  rootProjectIdentifier,
  currentProjectIdentifier,
  selectedProjectIdentifiers,
}: UseScheduleReportDataArgs) => {
  const setSnapshot = useTaskStore((state) => state.setSnapshot);
  const setLoading = useTaskStore((state) => state.setLoading);
  const setError = useTaskStore((state) => state.setError);
  const requestSequenceRef = useRef(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!rootProjectIdentifier) return;

    const targets = collectTargets(selectedProjectIdentifiers || [], currentProjectIdentifier);
    if (targets.length === 0) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);

    Promise.all(targets.map((projectId) => fetchTargetSnapshot(rootProjectIdentifier, projectId, filters)))
      .then((results) => {
        if (requestId !== requestSequenceRef.current) return;

        const validResults = results.filter((result): result is NonNullable<typeof result> => result !== null);
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
  }, [
    currentProjectIdentifier,
    filters,
    refreshToken,
    rootProjectIdentifier,
    selectedProjectIdentifiers,
    setError,
    setLoading,
    setSnapshot,
  ]);

  return { refresh };
};
