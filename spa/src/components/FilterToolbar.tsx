import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';
import { t } from '../i18n';
import { reportStyles } from './designSystem';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { SelectionList, SelectionRow, CheckboxRow } from './ui/SelectionList';

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
        <Button
          onClick={() => setIsProjectOpen(!isProjectOpen)}
          variant="secondary"
          className={`${reportStyles.selectTrigger} min-w-[200px]`}
        >
          <span className={`${reportStyles.selectTriggerLabel} max-w-[180px]`}>{buttonLabel}</span>
          <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${isProjectOpen ? 'rotate-180' : ''}`} />
        </Button>

        {isProjectOpen && (
          <div className={`${reportStyles.dropdownPanel} left-0 top-full mt-2 w-64 max-h-96 overflow-y-auto`}>
            <SelectionList>
              {availableProjects.map((p) => {
                const isSelected = selectedProjectIdentifiers.includes(p.identifier);
                const isDisabled = p.selectable === false;
                return (
                  <SelectionRow
                    key={p.project_id}
                    active={isSelected}
                    disabled={isDisabled}
                    indent={p.level * 12}
                    leading={<CheckboxRow checked={isSelected} />}
                    onClick={() => toggleProject(p.identifier)}
                  >
                    {p.name}
                  </SelectionRow>
                );
              })}
              {availableProjects.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500">{t('filter.noProjects')}</div>
              )}
            </SelectionList>
          </div>
        )}
      </div>

      <div className="mx-2 h-6 w-px bg-gray-200"></div>

      {/* Version Selection */}
      <div className="flex items-center gap-2 relative" ref={versionDropdownRef}>
        <label className="text-sm font-medium text-[#45515e]">{t('filter.versions')}</label>
        <Button
          onClick={() => setIsVersionOpen(!isVersionOpen)}
          variant="secondary"
          className={`${reportStyles.selectTrigger} min-w-[150px]`}
        >
          <span className={`${reportStyles.selectTriggerLabel} max-w-[130px]`}>
            {selectedVersions.length === allVersions.length ? t('filter.allVersions') : t('filter.selectedCount', { count: selectedVersions.length })}
          </span>
          <Icon name="chevron-down" className={`h-4 w-4 transition-transform ${isVersionOpen ? 'rotate-180' : ''}`} />
        </Button>

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
            <SelectionList>
              {allVersions.map((version) => (
                <SelectionRow
                  key={version}
                  active={selectedVersions.includes(version)}
                  leading={<CheckboxRow checked={selectedVersions.includes(version)} />}
                  onClick={() => {
                    if (selectedVersions.includes(version)) {
                      onVersionChange(selectedVersions.filter(v => v !== version));
                    } else {
                      onVersionChange([...selectedVersions, version]);
                    }
                  }}
                >
                  {version}
                </SelectionRow>
              ))}
            </SelectionList>
            {allVersions.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">{t('filter.noVersions')}</div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
