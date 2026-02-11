import { create } from 'zustand';

type FilterState = {
  include_subprojects: boolean;
  months: number;
  start_month: string;
  status_scope: 'open';
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
};

const currentMonth = new Date().toISOString().slice(0, 7);

export const useUiStore = create<UIStore>((set) => ({
  filters: {
    include_subprojects: true,
    months: 4,
    start_month: currentMonth,
    status_scope: 'open'
  },
  zoomLevel: 1,
  selectedBarKey: null,
  hoveredBarKey: null,
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setZoomLevel: (value) => set({ zoomLevel: value }),
  setSelectedBarKey: (value) => set({ selectedBarKey: value }),
  setHoveredBarKey: (value) => set({ hoveredBarKey: value })
}));
