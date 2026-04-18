import { t } from '../i18n';
import type { AiResponseProjectTab } from '../types/weeklyReport';

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
    <div className="space-y-4 mb-6">
      <div className="rounded-[16px] border border-gray-200 bg-[rgba(0,0,0,0.02)] p-3 shadow-none">
        <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200" aria-label={t('detailedTabs.projectsAria')}>
          {projectTabs.map((tab) => {
            const active = tab.project_identifier === activeProject.project_identifier;
            return (
              <button
                key={tab.project_identifier}
                onClick={() => onProjectChange(tab.project_identifier)}
                className={`
                  whitespace-nowrap px-4 py-2 rounded-full text-[14px] font-sans font-medium transition-all duration-200 border
                  ${active
                    ? 'bg-[#181e25] border-[#181e25] text-white shadow-subtle'
                    : 'bg-white border-gray-200 text-[#45515e] hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                {tab.project_name}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center justify-center mr-2 px-3 py-1 bg-[#181e25] rounded-full text-[12px] font-sans font-medium text-white uppercase tracking-wide shadow-none">
          {t('detailedTabs.versionsLabel')}
        </div>

        {activeProject.versions.map((version) => {
          const active = version.version_id === selectedVersionId;
          return (
            <button
              key={`${activeProject.project_identifier}-${version.version_id}`}
              onClick={() => onVersionChange(version.version_id)}
              className={`
                group relative px-4 py-1.5 rounded-full text-[14px] font-sans font-medium transition-all duration-200 border
                ${active
                  ? 'bg-[var(--color-primary-200)] border-[var(--color-brand-6)] text-[var(--color-primary-700)] shadow-subtle'
                  : 'bg-white border-gray-200 text-[#45515e] hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <div className="flex items-center gap-1.5">
                {version.version_name}
                {version.has_saved_response && (
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-[var(--color-brand-6)]' : 'bg-gray-300 group-hover:bg-[var(--color-primary-light)]'} transition-colors`}></span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
