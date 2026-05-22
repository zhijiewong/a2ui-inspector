import { create } from "zustand";

export type DeviceFrame = "mobile" | "tablet" | "desktop";

/** Max content width per frame, in CSS pixels. `desktop` is unconstrained. */
export const FRAME_WIDTHS: Record<DeviceFrame, number | undefined> = {
  mobile: 390,
  tablet: 768,
  desktop: undefined,
};

interface PreviewState {
  frame: DeviceFrame;
  setFrame: (frame: DeviceFrame) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  frame: "desktop",
  setFrame: (frame) => set({ frame }),
}));
