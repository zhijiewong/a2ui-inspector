import { create } from "zustand";

interface SelectionState {
  surfaceId: string | undefined;
  componentId: string | undefined;
  selectSurface: (surfaceId: string) => void;
  selectComponent: (surfaceId: string, componentId: string) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  surfaceId: undefined,
  componentId: undefined,
  selectSurface: (surfaceId) => set({ surfaceId, componentId: undefined }),
  selectComponent: (surfaceId, componentId) => set({ surfaceId, componentId }),
}));
