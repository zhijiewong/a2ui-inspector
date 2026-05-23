import { describe, expect, it, beforeEach } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useDiagnosticsStore } from "../store/diagnostics.js";

const seedDiagnostic = () =>
  useDiagnosticsStore.getState().add({
    ts: 1, category: "schema", severity: "error",
    code: "parse-failed", message: "bad",
  });

const entry = (tick: number): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

beforeEach(() => {
  useSessionStore.getState().reset();
  useBookmarksStore.getState().clear();
});

describe("session store loadEntries", () => {
  it("replaces entries with the given array", () => {
    useSessionStore.getState().loadEntries([entry(0), entry(1)]);
    expect(useSessionStore.getState().entries).toHaveLength(2);
    expect(useSessionStore.getState().entries[0]?.tick).toBe(0);
  });

  it("replaces any pre-existing entries", () => {
    useSessionStore.getState().loadEntries([entry(0), entry(1), entry(2)]);
    useSessionStore.getState().loadEntries([entry(0)]);
    expect(useSessionStore.getState().entries).toHaveLength(1);
  });

  it("loadEntries clears bookmarks (session replacement)", () => {
    useBookmarksStore.getState().toggle(7);
    seedDiagnostic();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(1);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(1);
    useSessionStore.getState().loadEntries([entry(0)]);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
  });

  it("reset clears bookmarks (session replacement)", () => {
    useBookmarksStore.getState().toggle(7);
    seedDiagnostic();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(1);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(1);
    useSessionStore.getState().reset();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
  });

  it("loadEntries seeds protocol diagnostics for the new entries", () => {
    useSessionStore.getState().loadEntries([
      {
        tick: 0, ts: 0, direction: "agent->client",
        // unknown-surface: updateComponents for a surface never createSurface'd
        message: { version: "v0.9", updateComponents: { surfaceId: "ghost", components: [] } } as never,
      },
    ]);
    const codes = Array.from(useDiagnosticsStore.getState().diagnostics.values()).map((d) => d.code);
    expect(codes).toContain("unknown-surface");
  });

  it("applying a sessionLoaded event clears bookmarks", () => {
    useBookmarksStore.getState().toggle(7);
    seedDiagnostic();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(1);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(1);
    useSessionStore.getState().applyEvent({ kind: "sessionLoaded" } as never);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
  });
});
