import type { CategoryBar } from '../scheduleReportApi';

export const mapCategoryBars = (bars: CategoryBar[]): CategoryBar[] =>
  bars.map((bar) => ({
    ...bar,
    is_delayed: Boolean(bar.is_delayed)
  }));
