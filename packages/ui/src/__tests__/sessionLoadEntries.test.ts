import { describe, expect, it, beforeEach } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";

const entry = (tick: number): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

beforeEach(() => useSessionStore.getState().reset());

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
});
