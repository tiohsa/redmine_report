import { create } from 'zustand';
import type { CategoryBar, ProjectInfo, ProjectRow, ReportSnapshot } from '../services/scheduleReportApi';

type TaskState = {
  rows: ProjectRow[];
  bars: CategoryBar[];
  availableProjects: ProjectInfo[];
  warnings: string[];
  generatedAt: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  setSnapshot: (snapshot: ReportSnapshot) => void;
  setLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
};

export const useTaskStore = create<TaskState>((set) => ({
  rows: [],
  bars: [],
  availableProjects: [],
  warnings: [],
  generatedAt: null,
  isLoading: false,
  errorMessage: null,
  setSnapshot: (snapshot) =>
    set({
      rows: snapshot.rows,
      bars: snapshot.bars,
      availableProjects: snapshot.available_projects || [],
      warnings: snapshot.meta.warnings,
      generatedAt: snapshot.meta.generated_at,
      errorMessage: null
    }),
  setLoading: (value) => set({ isLoading: value }),
  setError: (value) => set({ errorMessage: value })
}));
