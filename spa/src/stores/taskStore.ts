import { create } from 'zustand';
import type { CategoryBar, ProjectRow, ReportSnapshot } from '../services/scheduleReportApi';

type TaskState = {
  rows: ProjectRow[];
  bars: CategoryBar[];
  warnings: string[];
  generatedAt: string | null;
  setSnapshot: (snapshot: ReportSnapshot) => void;
};

export const useTaskStore = create<TaskState>((set) => ({
  rows: [],
  bars: [],
  warnings: [],
  generatedAt: null,
  setSnapshot: (snapshot) =>
    set({
      rows: snapshot.rows,
      bars: snapshot.bars,
      warnings: snapshot.meta.warnings,
      generatedAt: snapshot.meta.generated_at
    })
}));
