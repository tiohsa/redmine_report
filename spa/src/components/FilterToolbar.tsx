
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

      <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
        <label className="text-sm text-gray-600 font-medium">View:</label>
        <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilters({ viewMode: mode })}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${filters.viewMode === mode
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
