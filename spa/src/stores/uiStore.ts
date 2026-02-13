import { create } from 'zustand';

export type FilterState = {
  include_subprojects: boolean;
  months: number;

  start_month: string;
  status_scope: 'open' | 'all';
  viewMode: 'month' | 'week' | 'day' | 'report';
};

type UIStore = {
  filters: FilterState;
  zoomLevel: number;
  selectedBarKey: string | null;
  hoveredBarKey: string | null;
  setFilters: (filters: Partial<FilterState>) => void;
  setZoomLevel: (value: number) => void;
  setSelectedBarKey: (value: string | null) => void;
  setHoveredBarKey: (value: string | null) => void;
  rootProjectIdentifier: string;
  currentProjectIdentifier: string;
  setRootProjectIdentifier: (value: string) => void;
  setCurrentProjectIdentifier: (value: string) => void;
};

const currentMonth = new Date().toISOString().slice(0, 7);
const initialProjectIdentifier =
  (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';

export const useUiStore = create<UIStore>((set) => ({
  filters: {
    include_subprojects: false,
    months: 4,
    start_month: currentMonth,
    status_scope: 'all',
    viewMode: 'month'
  },
  zoomLevel: 1,
  selectedBarKey: null,
  hoveredBarKey: null,
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setZoomLevel: (value) => set({ zoomLevel: value }),
  setSelectedBarKey: (value) => set({ selectedBarKey: value }),
  setHoveredBarKey: (value) => set({ hoveredBarKey: value }),
  rootProjectIdentifier: initialProjectIdentifier,
  currentProjectIdentifier: initialProjectIdentifier,
  setRootProjectIdentifier: (value) => set({ rootProjectIdentifier: value }),
  setCurrentProjectIdentifier: (value) => set({ currentProjectIdentifier: value })
}));
