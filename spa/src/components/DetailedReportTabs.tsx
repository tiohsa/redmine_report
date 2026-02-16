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
      {/* Project Tabs - Outlined Style */}
      <div>
        <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200" aria-label="Projects">
          {projectTabs.map((tab) => {
            const active = tab.project_identifier === activeProject.project_identifier;
            return (
              <button
                key={tab.project_identifier}
                onClick={() => onProjectChange(tab.project_identifier)}
                className={`
                  whitespace-nowrap px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 border
                  ${active
                    ? 'bg-white border-blue-500 text-blue-600 shadow-sm'
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

      {/* Version Tabs - Outlined Style with Badge Label */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center justify-center mr-2 px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-500 uppercase tracking-wide">
          VERSIONS
        </div>

        {activeProject.versions.map((version) => {
          const active = version.version_id === selectedVersionId;
          return (
            <button
              key={`${activeProject.project_identifier}-${version.version_id}`}
              onClick={() => onVersionChange(version.version_id)}
              className={`
                group relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 border
                ${active
                  ? 'bg-white border-blue-500 text-blue-600 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >
              <div className="flex items-center gap-1.5">
                {version.version_name}
                {version.has_saved_response && (
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-blue-500' : 'bg-slate-300 group-hover:bg-blue-400'} transition-colors`}></span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
