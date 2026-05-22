import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSession } from "../session/persistence.js";

// The sidecar package is ESM, so `__dirname` is not defined — derive it.
const here = dirname(fileURLToPath(import.meta.url));
const RECORDINGS = resolve(here, "../../../../examples/recordings");

const FIXTURES = [
  "restaurant-finder-happy-path.jsonl",
  "malformed-components.jsonl",
  "multi-surface.jsonl",
  "action-roundtrip.jsonl",
];

describe("example fixture recordings", () => {
  for (const name of FIXTURES) {
    it(`${name} parses cleanly as a session`, async () => {
      const entries = await loadSession(resolve(RECORDINGS, name));
      expect(entries.length).toBeGreaterThan(0);
      entries.forEach((e, i) => expect(e.tick).toBe(i));
    });
  }

  it("multi-surface.jsonl creates two distinct surfaces", async () => {
    const entries = await loadSession(resolve(RECORDINGS, "multi-surface.jsonl"));
    const created = entries
      .map((e) => {
        const m = e.message as { createSurface?: { surfaceId?: string } } | undefined;
        return m?.createSurface?.surfaceId;
      })
      .filter((s): s is string => typeof s === "string");
    expect(new Set(created)).toEqual(new Set(["main", "sidebar"]));
  });

  it("action-roundtrip.jsonl contains a client->agent action", async () => {
    const entries = await loadSession(resolve(RECORDINGS, "action-roundtrip.jsonl"));
    expect(entries.some((e) => e.direction === "client->agent" && e.action)).toBe(true);
  });
});
