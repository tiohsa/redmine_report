
import { useUiStore } from '../stores/uiStore';
import { useTaskStore } from '../stores/taskStore';

export function FilterToolbar() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const availableProjects = useTaskStore((s) => s.availableProjects);

  const currentProjectIdentifier = useUiStore((s) => s.currentProjectIdentifier);
  const setCurrentProjectIdentifier = useUiStore((s) => s.setCurrentProjectIdentifier);

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIdentifier = e.target.value;
    if (newIdentifier && newIdentifier !== currentProjectIdentifier) {
      setCurrentProjectIdentifier(newIdentifier);
    }
  };

  const toggleStatus = () => {
    const next = filters.status_scope === 'open' ? 'all' : 'open';
    setFilters({ status_scope: next });
  };

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

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 font-medium">Project:</label>
        <select
          aria-label="Project"
          className="bg-white border border-gray-300 text-gray-700 text-sm rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={currentProjectIdentifier}
          onChange={handleProjectChange}
        >
          {availableProjects.map((p) => (
            <option key={p.project_id} value={p.identifier} disabled={p.selectable === false}>
              {'\u00A0'.repeat(p.level * 2)}{p.name}
            </option>
          ))}
        </select>
      </div>

    </div>

  );
}
