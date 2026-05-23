import { create } from "zustand";

interface BookmarkEditorState {
  openTick: number | undefined;
  openFor: (tick: number) => void;
  close: () => void;
}

export const useBookmarkEditorStore = create<BookmarkEditorState>((set) => ({
  openTick: undefined,
  openFor: (openTick) => set({ openTick }),
  close: () => set({ openTick: undefined }),
}));
