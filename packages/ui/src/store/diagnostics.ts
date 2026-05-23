import { create } from "zustand";
import type { Diagnostic } from "@a2ui-inspector/shared";

interface DiagnosticsState {
  diagnostics: Map<string, Diagnostic>;   // id → Diagnostic
  byTick: Map<number, Diagnostic[]>;      // derived
  add: (d: Diagnostic) => void;
  addMany: (ds: Diagnostic[]) => void;
  clear: () => void;
}

// O(n) rebuild on every add — intentional: keeps byTick a fresh Map for
// Zustand === identity checks. Sessions are bounded; profile if T11/T12 say so.
function rebuildByTick(map: Map<string, Diagnostic>): Map<number, Diagnostic[]> {
  const out = new Map<number, Diagnostic[]>();
  for (const d of map.values()) {
    if (d.tick === undefined) continue;
    const arr = out.get(d.tick);
    if (arr) arr.push(d); else out.set(d.tick, [d]);
  }
  return out;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => {
  let serial = 0;
  const makeId = (d: Diagnostic): string =>
    `${d.ts}-${d.category}-${d.code}-${d.tick ?? "-"}-${serial++}`;
  return {
    diagnostics: new Map(),
    byTick: new Map(),
    add: (d) => {
      const next = new Map(get().diagnostics);
      next.set(makeId(d), d);
      set({ diagnostics: next, byTick: rebuildByTick(next) });
    },
    addMany: (ds) => {
      const next = new Map(get().diagnostics);
      for (const d of ds) next.set(makeId(d), d);
      set({ diagnostics: next, byTick: rebuildByTick(next) });
    },
    clear: () => set({ diagnostics: new Map(), byTick: new Map() }),
  };
});
