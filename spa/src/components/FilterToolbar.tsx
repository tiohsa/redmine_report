import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';
import { t } from '../i18n';
import { reportStyles } from './designSystem';

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
    <div className="schedule-report-filter-toolbar report-panel flex items-center gap-4 border border-gray-100 bg-[#fbfdff] p-4 shadow-none">

      {/* Project Selection */}
      <div className="flex items-center gap-2 relative" ref={projectDropdownRef}>
        <label className="text-sm font-medium text-[#45515e]">{t('filter.projects')}</label>
        <button
          onClick={() => setIsProjectOpen(!isProjectOpen)}
          className="flex min-w-[200px] items-center justify-between gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)]"
        >
          <span className="truncate max-w-[180px]">{buttonLabel}</span>
          <svg className={`w-4 h-4 transition-transform ${isProjectOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {isProjectOpen && (
          <div className={`${reportStyles.dropdownPanel} left-0 top-full mt-2 w-64 max-h-96 overflow-y-auto`}>
            {availableProjects.map((p) => {
              const isSelected = selectedProjectIdentifiers.includes(p.identifier);
              const isDisabled = p.selectable === false;
              return (
                <div
                  key={p.project_id}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50 ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={() => !isDisabled && toggleProject(p.identifier)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    disabled={isDisabled}
                    className="rounded border-gray-300 text-[var(--color-primary-600)] focus:ring-[var(--color-primary-200)]"
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

      <div className="mx-2 h-6 w-px bg-gray-200"></div>

      {/* Version Selection */}
      <div className="flex items-center gap-2 relative" ref={versionDropdownRef}>
        <label className="text-sm font-medium text-[#45515e]">{t('filter.versions')}</label>
        <button
          onClick={() => setIsVersionOpen(!isVersionOpen)}
          className="flex min-w-[150px] items-center justify-between gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)]"
        >
          <span className="truncate max-w-[130px]">
            {selectedVersions.length === allVersions.length ? t('filter.allVersions') : t('filter.selectedCount', { count: selectedVersions.length })}
          </span>
          <svg className={`w-4 h-4 transition-transform ${isVersionOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {isVersionOpen && onVersionChange && (
          <div className={`${reportStyles.dropdownPanel} left-0 top-full mt-2 w-64 max-h-96 overflow-y-auto`}>
            <div className="sticky top-0 z-10 flex justify-between border-b border-gray-100 bg-[#fbfdff] p-2">
              <button
                className="text-xs font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)]"
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
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
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
                  className="pointer-events-none rounded border-gray-300 text-[var(--color-primary-600)] focus:ring-[var(--color-primary-200)]"
                />
                <span className="truncate text-sm text-gray-700">{version}</span>
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
