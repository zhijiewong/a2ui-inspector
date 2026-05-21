import { create } from "zustand";

interface TimelineState {
  scrubTick: number | "head";
  setScrubTick: (t: number | "head") => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  scrubTick: "head",
  setScrubTick: (t) => set({ scrubTick: t }),
}));
