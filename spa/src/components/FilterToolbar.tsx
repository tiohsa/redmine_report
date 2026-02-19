import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';
import { t } from '../i18n';

interface FilterToolbarProps {
  allVersions?: string[];
  selectedVersions?: string[];
  onVersionChange?: (versions: string[]) => void;
}

export function FilterToolbar(props: FilterToolbarProps) {
  const availableProjects = useTaskStore((s) => s.availableProjects);

  const selectedProjectIdentifiers = useUiStore((s) => s.selectedProjectIdentifiers) || [];
  const setSelectedProjectIdentifiers = useUiStore((s) => s.setSelectedProjectIdentifiers);

  // Project Dropdown State
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Version Dropdown State
  const [isVersionOpen, setIsVersionOpen] = useState(false);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  // Props for version selection
  const { allVersions = [], selectedVersions = [], onVersionChange } = props;

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setIsProjectOpen(false);
      }
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
        setIsVersionOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleProject = (identifier: string) => {
    if (selectedProjectIdentifiers.includes(identifier)) {
      setSelectedProjectIdentifiers(selectedProjectIdentifiers.filter(pid => pid !== identifier));
    } else {
      setSelectedProjectIdentifiers([...selectedProjectIdentifiers, identifier]);
    }
  };

  const selectedCount = selectedProjectIdentifiers.length;
  const buttonLabel = selectedCount === 0
    ? t('filter.selectProjects')
    : selectedCount === 1
      ? availableProjects.find(p => p.identifier === selectedProjectIdentifiers[0])?.name || t('filter.oneProject')
      : t('filter.projectsCount', { count: selectedCount });

  return (
    <div className="schedule-report-filter-toolbar flex items-center gap-4 p-2 bg-gray-50 border-b border-gray-200">

      {/* Project Selection */}
      <div className="flex items-center gap-2 relative" ref={projectDropdownRef}>
        <label className="text-sm text-gray-600 font-medium">{t('filter.projects')}</label>
        <button
          onClick={() => setIsProjectOpen(!isProjectOpen)}
          className="bg-white border border-gray-300 text-gray-700 text-sm rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[200px] justify-between"
        >
          <span className="truncate max-w-[180px]">{buttonLabel}</span>
          <svg className={`w-4 h-4 transition-transform ${isProjectOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {isProjectOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg z-50">
            {availableProjects.map((p) => {
              const isSelected = selectedProjectIdentifiers.includes(p.identifier);
              const isDisabled = p.selectable === false;
              return (
                <div
                  key={p.project_id}
                  className={`px-3 py-2 flex items-center gap-2 hover:bg-gray-50 cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isDisabled && toggleProject(p.identifier)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    disabled={isDisabled}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`} style={{ paddingLeft: `${p.level * 12}px` }}>
                    {p.name}
                  </span>
                </div>
              );
            })}
            {availableProjects.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">{t('filter.noProjects')}</div>
            )}
          </div>
        )}
      </div>

      <div className="h-6 w-px bg-gray-300 mx-2"></div>

      {/* Version Selection */}
      <div className="flex items-center gap-2 relative" ref={versionDropdownRef}>
        <label className="text-sm text-gray-600 font-medium">{t('filter.versions')}</label>
        <button
          onClick={() => setIsVersionOpen(!isVersionOpen)}
          className="bg-white border border-gray-300 text-gray-700 text-sm rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[150px] justify-between"
        >
          <span className="truncate max-w-[130px]">
            {selectedVersions.length === allVersions.length ? t('filter.allVersions') : t('filter.selectedCount', { count: selectedVersions.length })}
          </span>
          <svg className={`w-4 h-4 transition-transform ${isVersionOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {isVersionOpen && onVersionChange && (
          <div className="absolute top-full left-0 mt-1 w-64 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg z-50">
            <div className="p-2 border-b border-gray-100 flex justify-between bg-gray-50 sticky top-0 z-10">
              <button
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                onClick={() => onVersionChange(allVersions)}
              >
                {t('filter.selectAll')}
              </button>
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => onVersionChange([])}
              >
                {t('filter.clear')}
              </button>
            </div>
            {allVersions.map((version) => (
              <div
                key={version}
                className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  if (selectedVersions.includes(version)) {
                    onVersionChange(selectedVersions.filter(v => v !== version));
                  } else {
                    onVersionChange([...selectedVersions, version]);
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedVersions.includes(version)}
                  readOnly
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                />
                <span className="text-sm text-gray-700 truncate">{version}</span>
              </div>
            ))}
            {allVersions.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">{t('filter.noVersions')}</div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
