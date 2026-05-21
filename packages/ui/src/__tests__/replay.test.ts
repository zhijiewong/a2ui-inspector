import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { stateAtTick } from "../replay/processor.js";

const e = (i: number, fn: () => any): SessionEntry => ({
  tick: i,
  ts: i,
  direction: "agent->client",
  message: fn(),
});

describe("stateAtTick", () => {
  it("returns empty state at tick 0 for an empty session", () => {
    const s = stateAtTick([], -1);
    expect(s.surfaces.size).toBe(0);
  });

  it("materializes createSurface", () => {
    const entries = [
      e(0, () => ({
        version: "v0.9",
        createSurface: { surfaceId: "main", catalogId: "x" },
      })),
    ];
    const s = stateAtTick(entries, 0);
    expect(s.surfaces.has("main")).toBe(true);
  });

  it("ignores entries past the requested tick", () => {
    const entries = [
      e(0, () => ({
        version: "v0.9",
        createSurface: { surfaceId: "a" },
      })),
      e(1, () => ({
        version: "v0.9",
        createSurface: { surfaceId: "b" },
      })),
    ];
    const s = stateAtTick(entries, 0);
    expect(s.surfaces.has("a")).toBe(true);
    expect(s.surfaces.has("b")).toBe(false);
  });
});
