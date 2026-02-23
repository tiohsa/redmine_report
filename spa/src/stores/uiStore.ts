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
  selectedProjectIdentifiers: string[];
  setSelectedProjectIdentifiers: (value: string[]) => void;
};

const currentMonth = new Date().toISOString().slice(0, 7);
const initialProjectIdentifier =
  (document.getElementById('schedule-report-root') as HTMLElement | null)?.dataset.projectId || '';
const projectSelectionStorageKey = (rootProjectIdentifier: string) =>
  `redmine_report.schedule.selectedProjects.${rootProjectIdentifier || 'default'}`;

const readStoredSelectedProjectIdentifiers = (rootProjectIdentifier: string): string[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(projectSelectionStorageKey(rootProjectIdentifier));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null;
  } catch {
    return null;
  }
};

const writeStoredSelectedProjectIdentifiers = (rootProjectIdentifier: string, identifiers: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(projectSelectionStorageKey(rootProjectIdentifier), JSON.stringify(identifiers));
  } catch {
    // Ignore storage failures (private mode/quota)
  }
};

const initialSelectedProjects =
  readStoredSelectedProjectIdentifiers(initialProjectIdentifier)
  ?? (initialProjectIdentifier ? [initialProjectIdentifier] : []);

export const useUiStore = create<UIStore>((set, get) => ({
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
  selectedProjectIdentifiers: initialSelectedProjects,
  setRootProjectIdentifier: (value) => set({ rootProjectIdentifier: value }),
  setCurrentProjectIdentifier: (value) => set({ currentProjectIdentifier: value }),
  setSelectedProjectIdentifiers: (value) => {
    writeStoredSelectedProjectIdentifiers(get().rootProjectIdentifier, value);
    set({ selectedProjectIdentifiers: value });
  }
}));
