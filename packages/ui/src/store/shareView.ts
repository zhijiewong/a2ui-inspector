import { create } from "zustand";

interface ShareViewState {
  isSharedView: boolean;
  setSharedView: (v: boolean) => void;
}

export const useShareViewStore = create<ShareViewState>((set) => ({
  isSharedView: false,
  setSharedView: (isSharedView) => set({ isSharedView }),
}));
