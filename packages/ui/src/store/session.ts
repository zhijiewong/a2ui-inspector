import { create } from "zustand";
import type { Event, SessionEntry } from "@a2ui-inspector/shared";
import { useBookmarksStore } from "./bookmarks.js";
import { useDiagnosticsStore } from "./diagnostics.js";
import { deriveProtocolDiagnostics } from "../diagnostics/deriveProtocolDiagnostics.js";

interface SessionState {
  entries: SessionEntry[];
  upstreamStatus: "idle" | "connecting" | "connected" | "closed" | "error";
  upstreamDetail?: string;
  applyEvent: (e: Event) => void;
  loadEntries: (entries: SessionEntry[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  entries: [],
  upstreamStatus: "idle",
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
          useDiagnosticsStore.getState().clear();
          return { entries: [] };
        case "diagnostic":
          // Side-effect only: route the diagnostic to its dedicated store; session state unchanged.
          useDiagnosticsStore.getState().add(e.diagnostic);
          return s;
      }
    }),
  loadEntries: (entries) => {
    useBookmarksStore.getState().clear();
    useDiagnosticsStore.getState().clear();
    useDiagnosticsStore.getState().addMany(deriveProtocolDiagnostics(entries));
    set({ entries });
  },
  reset: () => {
    useBookmarksStore.getState().clear();
    useDiagnosticsStore.getState().clear();
    set({ entries: [], upstreamStatus: "idle", upstreamDetail: undefined });
  },
}));
