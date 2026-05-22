import { create } from "zustand";

export type MainPaneTab = "preview" | "tree" | "diff";

interface MainPaneState {
  tab: MainPaneTab;
  setTab: (tab: MainPaneTab) => void;
}

export const useMainPaneStore = create<MainPaneState>((set) => ({
  tab: "preview",
  setTab: (tab) => set({ tab }),
}));
