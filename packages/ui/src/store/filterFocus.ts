import { create } from "zustand";

interface FilterFocusState {
  focusTick: number;
  requestFocus: () => void;
}

export const useFilterFocusStore = create<FilterFocusState>((set, get) => ({
  focusTick: 0,
  requestFocus: () => set({ focusTick: get().focusTick + 1 }),
}));
