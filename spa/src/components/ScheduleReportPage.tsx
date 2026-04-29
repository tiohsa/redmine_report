import { useMemo } from 'react';
import { ProjectStatusReport } from './ProjectStatusReport';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { t } from '../i18n';
import { type CategoryBar } from '../services/scheduleReportApi';
import { useScheduleReportData } from './useScheduleReportData';
import { useVersionSelectionPersistence } from './useVersionSelectionPersistence';
import { reportStyles } from './designSystem';

const collectVersionNames = (bars: CategoryBar[]): string[] => {
  const versions = new Set<string>();
  bars.forEach((bar) => {
    versions.add(bar.version_name || t('common.noVersion'));
  });
  return Array.from(versions).sort();
};

export function ScheduleReportPage() {
  const snapshot = useTaskStore((s) => ({
    rows: s.rows,
    bars: s.bars,
    isLoading: s.isLoading,
    errorMessage: s.errorMessage,
    available_projects: s.availableProjects
  }));
  const filters = useUiStore((s) => s.filters);
  const rootProjectIdentifier = useUiStore((s) => s.rootProjectIdentifier);
  const currentProjectIdentifier = useUiStore((s) => s.currentProjectIdentifier);
  const selectedProjectIdentifiers = useUiStore((s) => s.selectedProjectIdentifiers);

  const hasNoSnapshotData = snapshot.rows.length === 0 && snapshot.bars.length === 0;
  const hasCachedSnapshotData = !hasNoSnapshotData;
  const showInitialLoading = snapshot.isLoading && hasNoSnapshotData;
  const showUpdatingBanner = snapshot.isLoading && hasCachedSnapshotData;
  const showBlockingError = Boolean(snapshot.errorMessage) && hasNoSnapshotData;
  const showNonBlockingError = Boolean(snapshot.errorMessage) && hasCachedSnapshotData;
  const { refresh } = useScheduleReportData({
    filters,
    rootProjectIdentifier,
    currentProjectIdentifier,
    selectedProjectIdentifiers
  });

  const allVersions = useMemo(() => collectVersionNames(snapshot.bars), [snapshot.bars]);
  const { selectedVersions, setSelectedVersions } = useVersionSelectionPersistence(rootProjectIdentifier, allVersions);

  return (
    <div className="schedule-report-page report-page-shell">
      <div className={reportStyles.shellScroll} data-testid="schedule-report-scroll">
        {showInitialLoading ? (
          <div className="flex min-h-full items-center justify-center p-6">
            <div className={reportStyles.loadingState}>{t('common.loading')}</div>
          </div>
        ) : (
          <ProjectStatusReport
            bars={snapshot.bars}
            projectIdentifier={currentProjectIdentifier}
            availableProjects={snapshot.available_projects}
            selectedVersions={selectedVersions}
            onVersionChange={setSelectedVersions}
            onTaskDatesUpdated={refresh}
            fetchError={hasNoSnapshotData ? snapshot.errorMessage : null}
          />
        )}
        {showUpdatingBanner && (
          <div className={`mx-4 mb-4 ${reportStyles.alertInfo}`}>{t('schedule.updating')}</div>
        )}
        {showBlockingError && (
          <div className={`mx-4 mb-4 ${reportStyles.alertError}`} role="alert">
            {snapshot.errorMessage}
          </div>
        )}
        {showNonBlockingError && (
          <div className={`mx-4 mb-4 ${reportStyles.alertWarning}`} role="alert">
            {t('schedule.refreshFailedShowingCached')}
          </div>
        )}
      </div>
    </div>
  );
}
