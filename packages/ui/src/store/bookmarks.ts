import { create } from "zustand";

export interface Bookmark {
  tick: number;
  note: string;
}

interface BookmarksState {
  bookmarks: Map<number, Bookmark>;
  has: (tick: number) => boolean;
  get: (tick: number) => Bookmark | undefined;
  toggle: (tick: number) => void;
  setNote: (tick: number, note: string) => void;
  loadAll: (bookmarks: Bookmark[]) => void;
  clear: () => void;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: new Map(),

  has: (tick) => get().bookmarks.has(tick),
  get: (tick) => get().bookmarks.get(tick),

  toggle: (tick) => {
    const next = new Map(get().bookmarks);
    if (next.has(tick)) next.delete(tick);
    else next.set(tick, { tick, note: "" });
    set({ bookmarks: next });
  },

  setNote: (tick, note) => {
    const next = new Map(get().bookmarks);
    next.set(tick, { tick, note });
    set({ bookmarks: next });
  },

  loadAll: (bookmarks) => {
    const next = new Map<number, Bookmark>();
    for (const b of bookmarks) next.set(b.tick, b);
    set({ bookmarks: next });
  },

  clear: () => set({ bookmarks: new Map() }),
}));
