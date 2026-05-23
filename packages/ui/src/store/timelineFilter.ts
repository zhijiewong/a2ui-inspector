import { create } from "zustand";
import {
  ALL_DIRECTIONS,
  ALL_KINDS,
  DEFAULT_FILTER,
  type Direction,
  type Kind,
  type TimelineFilter,
} from "../panels/timelineFilter.js";

export const STORAGE_KEY = "a2ui-inspector-timeline-filter";

interface TimelineFilterState extends TimelineFilter {
  toggleDirection: (d: Direction) => void;
  toggleKind: (k: Kind) => void;
  setQuery: (q: string) => void;
  reset: () => void;
  hydrate: () => void;
  isDefault: () => boolean;
}

function persist(state: TimelineFilter): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      directions: Array.from(state.directions),
      kinds: Array.from(state.kinds),
      query: state.query,
    })
  );
}

function freshDefaults(): TimelineFilter {
  return {
    directions: new Set<Direction>(DEFAULT_FILTER.directions),
    kinds: new Set<Kind>(DEFAULT_FILTER.kinds),
    query: DEFAULT_FILTER.query,
  };
}

export const useTimelineFilterStore = create<TimelineFilterState>((set, get) => ({
  ...freshDefaults(),

  toggleDirection: (d) => {
    const next = new Set(get().directions);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    set({ directions: next });
    persist(get());
  },

  toggleKind: (k) => {
    const next = new Set(get().kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    set({ kinds: next });
    persist(get());
  },

  setQuery: (query) => {
    set({ query });
    persist(get());
  },

  reset: () => {
    set(freshDefaults());
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  },

  hydrate: () => {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { directions?: unknown; kinds?: unknown; query?: unknown };
      const dirs = Array.isArray(parsed.directions)
        ? (parsed.directions.filter((d) => (ALL_DIRECTIONS as readonly string[]).includes(d as string)) as Direction[])
        : Array.from(DEFAULT_FILTER.directions);
      const kinds = Array.isArray(parsed.kinds)
        ? (parsed.kinds.filter((k) => (ALL_KINDS as readonly string[]).includes(k as string)) as Kind[])
        : Array.from(DEFAULT_FILTER.kinds);
      const query = typeof parsed.query === "string" ? parsed.query : "";
      set({ directions: new Set(dirs), kinds: new Set(kinds), query });
    } catch {
      set(freshDefaults());
    }
  },

  isDefault: () =>
    get().directions.size === ALL_DIRECTIONS.length &&
    get().kinds.size === ALL_KINDS.length &&
    get().query === "",
}));
