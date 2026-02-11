import type { ChangeEvent } from 'react';
import { useUiStore } from '../stores/uiStore';

export function FilterToolbar() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);

  const onMonths = (e: ChangeEvent<HTMLSelectElement>) => setFilters({ months: Number(e.target.value) });

  return (
    <div className="schedule-report-filter-toolbar">
      <label htmlFor="months">Months</label>
      <select id="months" value={filters.months} onChange={onMonths}>
        {[1, 2, 3, 4, 6, 12].map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
