import { create } from 'zustand';
import { useTaskStore } from './taskStore';

export type UIState = {
  zoomLevel: number;
  selectedBarKey: string | null;
  hoveredBarKey: string | null;
  setZoom: (value: number) => void;
  setSelectedBar: (key: string | null) => void;
  setHoveredBar: (key: string | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  zoomLevel: 1,
  selectedBarKey: null,
  hoveredBarKey: null,
  setZoom: (value) => set({ zoomLevel: value }),
  setSelectedBar: (key) => set({ selectedBarKey: key }),
  setHoveredBar: (key) => set({ hoveredBarKey: key })
}));

export { useTaskStore };
