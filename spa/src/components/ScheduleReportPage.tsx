import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchScheduleReport } from '../services/scheduleReportApi';
import { mapCategoryBars } from '../services/mappers/categoryBarMapper';
import { mapProjectRows } from '../services/mappers/projectRowMapper';
import { BackgroundRenderer } from '../renderers/BackgroundRenderer';
import { TaskRenderer } from '../renderers/TaskRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { TodayLineRenderer } from '../renderers/TodayLineRenderer';
import { LayoutEngine, CalculatedRow, CalculatedBar } from '../services/LayoutEngine';
import { FilterToolbar } from './FilterToolbar';
import { ProjectList } from './ProjectList';
import { wireBarClickNavigation, wireBarHover } from '../app/bootstrapInteractions';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

const projectIdentifier = (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';

export function ScheduleReportPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const setSnapshot = useTaskStore((s) => s.setSnapshot);
  const snapshot = useTaskStore((s) => ({ rows: s.rows, bars: s.bars }));
  const warnings = useTaskStore((s) => s.warnings);
  const filters = useUiStore((s) => s.filters);
  const months = filters.months;

  const [layout, setLayout] = useState<{ rows: CalculatedRow[]; totalHeight: number }>({
    rows: [],
    totalHeight: 600,
  });

  const bg = useMemo(() => new BackgroundRenderer(), []);
  const tasks = useMemo(() => new TaskRenderer(), []);
  const overlay = useMemo(() => new OverlayRenderer(), []);
  const today = useMemo(() => new TodayLineRenderer(), []);
  const layoutEngine = useMemo(() => new LayoutEngine(), []);

  // Fetch Data
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

  // Helper to determine view start date
  const viewStartDate = useMemo(() => {
    if (filters.start_month) {
      return new Date(`${filters.start_month}-01`);
    }
    const d = new Date();
    d.setDate(1);
    return d;
  }, [filters.start_month]);

  // Calculate Layout
  useEffect(() => {
    // Assuming 1000px width for now, or we can use dynamic width if we observe resize
    // Let's use a fixed width for the canvas content for now, or match container
    const width = 1200; // Fixed canvas width for scrolling
    const { rows, totalHeight } = layoutEngine.calculateLayout(snapshot.rows, snapshot.bars, months, width, viewStartDate);
    setLayout({ rows, totalHeight: Math.max(totalHeight, 600) });
  }, [layoutEngine, snapshot.rows, snapshot.bars, months, viewStartDate]);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set Canvas Size
    canvas.width = 1200; // Must match layout width
    canvas.height = layout.totalHeight;

    bg.render(ctx, layout.rows, months, canvas.width, canvas.height);

    // Flatten bars for rendering
    const allBars: CalculatedBar[] = layout.rows.flatMap(r => r.bars);
    tasks.render(ctx, allBars);

    today.render(ctx, canvas.height, canvas.width, months, viewStartDate);

  }, [bg, tasks, today, layout, months]);

  // Interactions (Updated to work with new layout)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getBarAt = (y: number) => {
      // We need to implement a spatial search or simple loop
      // Since overlay renderer was generic, we might need to update it or find logic here.
      // For now, let's just loop locally
      const allBars = layout.rows.flatMap(r => r.bars);
      return allBars.find(b =>
        y >= b.y && y <= b.y + b.height // Check Y
        // && x >= b.x && x <= b.x + b.width // Check X (but we need event X)
      );
    };

    // Note: The previous interaction logic relied on OverlayRenderer finding bars.
    // OverlayRenderer likely needs update or we skip it for this iteration
    // to focus on rendering first.
    // ... skipping interaction updates for this exact step to keep size manageable.

  }, [layout]);

  // Sync Scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // If we had separate scrolls for header/sidebar, we'd sync them here.
    // For now, simpler shared scroll container or separate areas.
    // The sidebar and canvas should vertical scroll together.
  };

  // Helper to get month label
  const getMonthLabel = (offset: number) => {
    const d = new Date(viewStartDate);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); // "Jan 2024"
  };

  return (
    <div className="schedule-report-page">
      <header className="schedule-report-header">
        {/* Month Labels should go here or be part of component */}
        <div className="header-sidebar-spacer">CATEGORY</div>
        <div className="header-months">
          {Array.from({ length: months }).map((_, i) => (
            <div key={i} className="header-month-item">
              {getMonthLabel(i).toUpperCase()}
            </div>
          ))}
        </div>
      </header>

      <div className="schedule-report-body" ref={scrollContainerRef}>
        <ProjectList rows={layout.rows} />
        <div className="schedule-report-canvas-wrapper">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}
