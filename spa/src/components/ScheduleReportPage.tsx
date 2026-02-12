import { useEffect, useMemo, useState } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { LayoutEngine, CalculatedRow } from '../services/LayoutEngine';
import { formatMonthYear, intersectsInterval, startOfMonth } from '../services/dateUtils';
import { FilterToolbar } from './FilterToolbar';
import { ProjectList } from './ProjectList';
import { wireBarClickNavigation, wireBarHover } from '../app/bootstrapInteractions';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

const projectIdentifier =
  (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';
const TIMELINE_WIDTH = 1200;

const getViewStartDate = (monthValue: string) => {
  if (!monthValue) {
    return startOfMonth(new Date());
  }
  return startOfMonth(new Date(`${monthValue}-01`));
};

export function ScheduleReportPage() {
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars }));
  const warnings = useTaskStore((s) => s.warnings);
  const filters = useUiStore((s) => s.filters);
  const months = filters.months;

  const [layout, setLayout] = useState<{ rows: CalculatedRow[]; totalHeight: number }>({
    rows: [],
    totalHeight: 600
  });

  const layoutEngine = useMemo(() => new LayoutEngine(), []);

  useEffect(() => {
    if (!projectIdentifier) return;
    void fetchScheduleReport(projectIdentifier, filters).then((data) => {
      setSnapshot({
        ...data,
        rows: mapProjectRows(data.rows),
        bars: mapCategoryBars(data.bars)
      });
    });
  }, [setSnapshot, filters]);

  const viewStartDate = useMemo(() => getViewStartDate(filters.start_month), [filters.start_month]);

  useEffect(() => {
    const { rows, totalHeight } = layoutEngine.calculateLayout(
      snapshot.rows,
      snapshot.bars,
      months,
      TIMELINE_WIDTH,
      viewStartDate
    );
    setLayout({ rows, totalHeight: Math.max(totalHeight, 600) });
  }, [layoutEngine, snapshot.rows, snapshot.bars, months, viewStartDate]);

  const monthLabels = useMemo(
    () =>
      Array.from({ length: months }).map((_, index) => {
        const date = new Date(viewStartDate);
        date.setMonth(date.getMonth() + index);
        return formatMonthYear(date).toUpperCase();
      }),
    [months, viewStartDate]
  );

  const isBarInRange = (startDate: string, endDate: string) => {
    const rangeEnd = new Date(viewStartDate.getFullYear(), viewStartDate.getMonth() + months, 0);
    return intersectsInterval(new Date(startDate), new Date(endDate), viewStartDate, rangeEnd);
  };

  return (
    <div className="schedule-report-page">
      <FilterToolbar />
      <header className="schedule-report-header">
        <div className="header-sidebar-spacer">CATEGORY</div>
        <div className="header-months" style={{ width: TIMELINE_WIDTH }}>
          {monthLabels.map((label) => (
            <div key={label} className="header-month-item">
              {label}
            </div>
          ))}
        </div>
      </header>

      <div className="schedule-report-body">
        <ProjectList rows={layout.rows} />
        <div className="schedule-report-timeline-wrapper">
          <div
            className="schedule-report-timeline"
            style={{
              width: TIMELINE_WIDTH,
              minHeight: layout.totalHeight,
              backgroundSize: `${TIMELINE_WIDTH / months}px 100%`
            }}
          >
            {layout.rows.map((row) => (
              <div key={row.data.project_id} className="timeline-row" style={{ height: row.height }}>
                {row.bars
                  .filter((bar) => isBarInRange(bar.data.start_date, bar.data.end_date))
                  .map((bar) => (
                    <button
                      key={bar.data.bar_key}
                      type="button"
                      className={`timeline-bar ${bar.data.is_delayed ? 'is-delayed' : ''}`}
                      style={{
                        left: bar.x,
                        top: bar.rowY,
                        width: bar.width,
                        height: bar.height
                      }}
                      title={`${bar.data.category_name} (${bar.data.issue_count})`}
                      onMouseEnter={() => wireBarHover(bar.data.bar_key)}
                      onMouseLeave={() => wireBarHover(null)}
                      onClick={() => wireBarClickNavigation(projectIdentifier, bar.data.category_id)}
                    >
                      <span className="timeline-bar-label">{bar.data.category_name}</span>
                      <span className="timeline-bar-count">{bar.data.issue_count}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="schedule-report-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
