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
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-sm">
        <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200" aria-label={t('detailedTabs.projectsAria')}>
          {projectTabs.map((tab) => {
            const active = tab.project_identifier === activeProject.project_identifier;
            return (
              <button
                key={tab.project_identifier}
                onClick={() => onProjectChange(tab.project_identifier)}
                className={`
                  whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border
                  ${active
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
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
        <div className="flex items-center justify-center mr-2 px-2.5 py-1 bg-slate-900 rounded-full text-[11px] font-semibold text-white uppercase tracking-wide shadow-sm">
          {t('detailedTabs.versionsLabel')}
        </div>

        {activeProject.versions.map((version) => {
          const active = version.version_id === selectedVersionId;
          return (
            <button
              key={`${activeProject.project_identifier}-${version.version_id}`}
              onClick={() => onVersionChange(version.version_id)}
              className={`
                group relative px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 border
                ${active
                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >
              <div className="flex items-center gap-1.5">
                {version.version_name}
                {version.has_saved_response && (
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-blue-400'} transition-colors`}></span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
