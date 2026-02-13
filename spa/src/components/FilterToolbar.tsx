
import { useUiStore } from '../stores/uiStore';

export function FilterToolbar() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);

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

    </div>

  );
}
