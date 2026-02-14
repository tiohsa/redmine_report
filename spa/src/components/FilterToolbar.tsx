import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';

export function FilterToolbar() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const availableProjects = useTaskStore((s) => s.availableProjects);

  const selectedProjectIdentifiers = useUiStore((s) => s.selectedProjectIdentifiers) || [];
  const setSelectedProjectIdentifiers = useUiStore((s) => s.setSelectedProjectIdentifiers);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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

  const toggleStatus = () => {
    const next = filters.status_scope === 'open' ? 'all' : 'open';
    setFilters({ status_scope: next });
  };

  const selectedCount = selectedProjectIdentifiers.length;
  const buttonLabel = selectedCount === 0
    ? "Select Projects"
    : selectedCount === 1
      ? availableProjects.find(p => p.identifier === selectedProjectIdentifiers[0])?.name || "1 Project"
      : `${selectedCount} Projects`;

  return (
    <div className="schedule-report-filter-toolbar flex items-center gap-4 p-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 font-medium">Status:</label>
        <button
          onClick={toggleStatus}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${filters.status_scope === 'all'
            ? 'bg-blue-100 text-blue-700 border border-blue-200'
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
        >
          {filters.status_scope === 'all' ? 'All Tickets' : 'Open Only'}
        </button>
      </div>

      <div className="h-6 w-px bg-gray-300 mx-2"></div>

      <div className="flex items-center gap-2 relative" ref={dropdownRef}>
        <label className="text-sm text-gray-600 font-medium">Projects:</label>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white border border-gray-300 text-gray-700 text-sm rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[200px] justify-between"
        >
          <span className="truncate max-w-[180px]">{buttonLabel}</span>
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {isOpen && (
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
              <div className="px-3 py-2 text-sm text-gray-500">No projects available</div>
            )}
          </div>
        )}
      </div>

    </div>

  );
}
