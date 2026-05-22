import { create } from "zustand";

interface PreviewRendererState {
  rendererId: string;
  setRendererId: (id: string) => void;
}

export const usePreviewRendererStore = create<PreviewRendererState>((set) => ({
  rendererId: "react",
  setRendererId: (rendererId) => set({ rendererId }),
}));
