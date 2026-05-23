import { create } from "zustand";
import type { Event, SessionEntry } from "@a2ui-inspector/shared";
import { useBookmarksStore } from "./bookmarks.js";

interface SessionState {
  entries: SessionEntry[];
  upstreamStatus: "idle" | "connecting" | "connected" | "closed" | "error";
  upstreamDetail?: string;
  diagnostics: Array<{ level: "warn" | "error"; message: string; ts: number }>;
  applyEvent: (e: Event) => void;
  loadEntries: (entries: SessionEntry[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  entries: [],
  upstreamStatus: "idle",
  diagnostics: [],
  applyEvent: (e) =>
    set((s) => {
      switch (e.kind) {
        case "messageReceived":
          return {
            entries: [...s.entries, { tick: e.tick, ts: e.ts, direction: "agent->client", message: e.message }],
          };
        case "actionSent":
          return {
            entries: [...s.entries, { tick: e.tick, ts: e.ts, direction: "client->agent", action: e.action }],
          };
        case "upstreamStatus":
          return { upstreamStatus: e.status, upstreamDetail: e.detail };
        case "sessionLoaded":
          useBookmarksStore.getState().clear();
          return { entries: [], diagnostics: s.diagnostics };
        case "diagnostic":
          return { diagnostics: [...s.diagnostics, { level: e.level, message: e.message, ts: Date.now() }] };
      }
    }),
  loadEntries: (entries) => {
    useBookmarksStore.getState().clear();
    set({ entries });
  },
  reset: () => {
    useBookmarksStore.getState().clear();
    set({ entries: [], upstreamStatus: "idle", upstreamDetail: undefined, diagnostics: [] });
  },
}));
