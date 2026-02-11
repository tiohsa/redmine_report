import type { CategoryBar } from '../services/scheduleReportApi';

export class OverlayRenderer {
  findBarAtPosition(bars: CategoryBar[], y: number): CategoryBar | null {
    const rowHeight = 24;
    const index = Math.floor((y - 8) / rowHeight);
    return bars[index] || null;
  }

  tooltipLines(bar: CategoryBar): string[] {
    return [
      `Category: ${bar.category_name}`,
      `Period: ${bar.start_date} - ${bar.end_date}`,
      `Issues: ${bar.issue_count}`,
      `Delayed: ${bar.delayed_issue_count}`,
      `Progress: ${bar.progress_rate}%`
    ];
  }
}
