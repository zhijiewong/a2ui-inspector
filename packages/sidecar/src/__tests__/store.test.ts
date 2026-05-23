import { describe, expect, it, vi } from "vitest";
import { SessionStore } from "../session/store.js";
import type { A2UIMessage, A2UIAction, Diagnostic } from "@a2ui-inspector/shared";

const msg = (id: string): A2UIMessage =>
  ({ version: "v0.9", createSurface: { surfaceId: id } }) as A2UIMessage;
const act = (): A2UIAction => ({ surfaceId: "main", componentId: "btn", kind: "tap" });

describe("SessionStore", () => {
  it("starts empty", () => {
    const s = new SessionStore();
    expect(s.length).toBe(0);
    expect(s.entries()).toEqual([]);
  });

  it("appendMessage assigns sequential ticks starting at 0", () => {
    const s = new SessionStore();
    const e0 = s.appendMessage(msg("a"));
    const e1 = s.appendMessage(msg("b"));
    expect(e0.tick).toBe(0);
    expect(e1.tick).toBe(1);
    expect(s.length).toBe(2);
  });

  it("appendAction assigns the next tick in the same sequence", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    const e = s.appendAction(act());
    expect(e.tick).toBe(1);
    expect(e.direction).toBe("client->agent");
  });

  it("clear() resets length and tick counter", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    s.clear();
    expect(s.length).toBe(0);
    expect(s.appendMessage(msg("b")).tick).toBe(0);
  });

  it("replace() swaps the log atomically and re-emits tickCount", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    s.replace([
      { tick: 0, ts: 1, direction: "agent->client", message: msg("x") },
      { tick: 1, ts: 2, direction: "agent->client", message: msg("y") },
    ]);
    expect(s.length).toBe(2);
    expect((s.entries()[0]?.message as any)?.createSurface?.surfaceId).toBe("x");
  });

  it("calls onAppend listeners on every new entry", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    s.onAppend(listener);
    s.appendMessage(msg("a"));
    s.appendAction(act());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("calls onReplace listeners on replace()", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    s.onReplace(listener);
    s.replace([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe() stops onAppend listeners from firing", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    const off = s.onAppend(listener);
    s.appendMessage(msg("a"));
    off();
    s.appendMessage(msg("b"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe() stops onReplace listeners from firing", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    const off = s.onReplace(listener);
    s.replace([]);
    off();
    s.replace([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replace() does NOT trigger onAppend listeners", () => {
    const s = new SessionStore();
    const appendListener = vi.fn();
    s.onAppend(appendListener);
    s.replace([
      { tick: 0, ts: 1, direction: "agent->client", message: msg("x") },
    ]);
    expect(appendListener).not.toHaveBeenCalled();
  });
});

describe("SessionStore diagnostics", () => {
  it("appendDiagnostic stores the diagnostic and notifies listeners", () => {
    const store = new SessionStore();
    const seen: Diagnostic[] = [];
    store.onDiagnosticAppend((d) => seen.push(d));

    const d: Diagnostic = {
      ts: 1, category: "schema", severity: "error",
      code: "parse-failed", message: "bad",
    };
    store.appendDiagnostic(d);

    expect(store.diagnostics()).toEqual([d]);
    expect(seen).toEqual([d]);
  });

  it("clear() empties diagnostics and fires the replace listener with []", () => {
    const store = new SessionStore();
    const replaceCalls: Diagnostic[][] = [];
    store.onDiagnosticReplace((ds) => replaceCalls.push(ds));

    store.appendDiagnostic({
      ts: 1, category: "transport", severity: "warn",
      code: "x", message: "y",
    });
    store.clear();

    expect(store.diagnostics()).toEqual([]);
    expect(replaceCalls.at(-1)).toEqual([]);
  });

  it("replaceDiagnostics swaps the array and fires the replace listener", () => {
    const store = new SessionStore();
    const replaceCalls: Diagnostic[][] = [];
    store.onDiagnosticReplace((ds) => replaceCalls.push(ds));

    const ds: Diagnostic[] = [{
      ts: 2, category: "render", severity: "error",
      code: "preview-threw", message: "boom",
    }];
    store.replaceDiagnostics(ds);

    expect(store.diagnostics()).toEqual(ds);
    expect(replaceCalls.at(-1)).toEqual(ds);
  });

  it("the unsubscribe fn from onDiagnosticAppend stops the listener", () => {
    const store = new SessionStore();
    const seen: Diagnostic[] = [];
    const off = store.onDiagnosticAppend((d) => seen.push(d));
    store.appendDiagnostic({ ts: 1, category: "schema", severity: "error", code: "a", message: "" });
    off();
    store.appendDiagnostic({ ts: 2, category: "schema", severity: "error", code: "b", message: "" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe("a");
  });

  it("the unsubscribe fn from onDiagnosticReplace stops the listener", () => {
    const store = new SessionStore();
    const calls: Diagnostic[][] = [];
    const off = store.onDiagnosticReplace((ds) => calls.push(ds));
    store.replaceDiagnostics([{ ts: 1, category: "render", severity: "warn", code: "x", message: "" }]);
    off();
    store.replaceDiagnostics([]);
    expect(calls).toHaveLength(1);
  });

  it("replaceDiagnostics does NOT fire the diagnostic-append listener", () => {
    const store = new SessionStore();
    const appended: Diagnostic[] = [];
    store.onDiagnosticAppend((d) => appended.push(d));
    store.replaceDiagnostics([
      { ts: 1, category: "transport", severity: "warn", code: "x", message: "" },
    ]);
    expect(appended).toEqual([]);
  });
});
