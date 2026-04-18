import { t } from '../i18n';
import type { AiResponseProjectTab } from '../types/weeklyReport';
import { reportStyles } from './designSystem';

type DetailedReportTabsProps = {
  projectTabs: AiResponseProjectTab[];
  selectedProjectIdentifier?: string;
  selectedVersionId?: number;
  onProjectChange: (projectIdentifier: string) => void;
  onVersionChange: (versionId: number) => void;
};

export const DetailedReportTabs = ({
  projectTabs,
  selectedProjectIdentifier,
  selectedVersionId,
  onProjectChange,
  onVersionChange
}: DetailedReportTabsProps) => {
  if (projectTabs.length === 0) return null;

  const activeProject =
    projectTabs.find((tab) => tab.project_identifier === selectedProjectIdentifier) ||
    projectTabs.find((tab) => tab.active) ||
    projectTabs[0];

  return (
    <div className="mb-6 space-y-4">
      <div className="report-panel bg-[#fbfdff] p-3 shadow-none">
        <nav className={reportStyles.tabGroup} aria-label={t('detailedTabs.projectsAria')}>
          {projectTabs.map((tab) => {
            const active = tab.project_identifier === activeProject.project_identifier;
            return (
              <button
                key={tab.project_identifier}
                onClick={() => onProjectChange(tab.project_identifier)}
                className={`${reportStyles.tab} ${active ? reportStyles.tabActive : ''}`}
              >
                {tab.project_name}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex items-center justify-center rounded-full bg-[#181e25] px-3 py-1 text-[12px] font-sans font-medium uppercase tracking-wide text-white shadow-none">
          {t('detailedTabs.versionsLabel')}
        </div>

        {activeProject.versions.map((version) => {
          const active = version.version_id === selectedVersionId;
          return (
            <button
              key={`${activeProject.project_identifier}-${version.version_id}`}
              onClick={() => onVersionChange(version.version_id)}
              className={`${reportStyles.tab} ${active ? reportStyles.tabActive : ''}`}
            >
              <div className="flex items-center gap-1.5">
                {version.version_name}
                {version.has_saved_response && (
                  <span className={`h-2 w-2 rounded-full ${active ? 'bg-[var(--color-brand-6)]' : 'bg-gray-300'} transition-colors`}></span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
