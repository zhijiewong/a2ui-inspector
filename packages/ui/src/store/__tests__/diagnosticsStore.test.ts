import { describe, expect, it, beforeEach } from "vitest";
import { useDiagnosticsStore } from "../diagnostics.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const make = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  ts: 1, category: "schema", severity: "error",
  code: "parse-failed", message: "bad", ...over,
});

describe("useDiagnosticsStore", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("starts empty", () => {
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("add() inserts and groups by tick", () => {
    useDiagnosticsStore.getState().add(make({ tick: 3 }));
    useDiagnosticsStore.getState().add(make({ tick: 3, code: "dangling-ref" }));
    useDiagnosticsStore.getState().add(make({ tick: 5, code: "x" }));

    const state = useDiagnosticsStore.getState();
    expect(state.diagnostics.size).toBe(3);
    expect(state.byTick.get(3)?.length).toBe(2);
    expect(state.byTick.get(5)?.length).toBe(1);
  });

  it("addMany() bulk inserts", () => {
    useDiagnosticsStore.getState().addMany([make({ tick: 1 }), make({ tick: 2 })]);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(2);
  });

  it("clear() empties both maps", () => {
    useDiagnosticsStore.getState().add(make({ tick: 1 }));
    useDiagnosticsStore.getState().clear();
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("diagnostics with no tick are stored but not in byTick", () => {
    useDiagnosticsStore.getState().add(make({ code: "upstream-closed" }));
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(1);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("each add bumps map identity (Zustand selector contract)", () => {
    const before = useDiagnosticsStore.getState().diagnostics;
    useDiagnosticsStore.getState().add(make({ tick: 1 }));
    const after = useDiagnosticsStore.getState().diagnostics;
    expect(after).not.toBe(before);
  });
});
