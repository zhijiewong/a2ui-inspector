import { describe, expect, it } from "vitest";
import { deriveProtocolDiagnostics } from "../deriveProtocolDiagnostics.js";
import type { SessionEntry } from "../session.js";

const msg = (tick: number, message: object): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", ...message } as SessionEntry["message"],
});

describe("deriveProtocolDiagnostics", () => {
  it("returns [] for empty input", () => {
    expect(deriveProtocolDiagnostics([])).toEqual([]);
  });

  it("emits unknown-surface when updateComponents targets a surface never created", () => {
    const entries: SessionEntry[] = [
      msg(0, { updateComponents: { surfaceId: "ghost", components: [] } }),
    ];
    const out = deriveProtocolDiagnostics(entries);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("unknown-surface");
    expect(out[0]!.category).toBe("protocol");
    expect(out[0]!.tick).toBe(0);
  });

  it("does NOT emit unknown-surface when updateComponents targets a created surface", () => {
    const entries: SessionEntry[] = [
      msg(0, { createSurface: { surfaceId: "main" } }),
      msg(1, { updateComponents: { surfaceId: "main", components: [] } }),
    ];
    expect(deriveProtocolDiagnostics(entries)).toEqual([]);
  });

  it("allows out-of-order create/update", () => {
    // updateComponents arrives BEFORE createSurface — still resolved by end-of-stream.
    const entries: SessionEntry[] = [
      msg(0, { updateComponents: { surfaceId: "main", components: [] } }),
      msg(1, { createSurface: { surfaceId: "main" } }),
    ];
    expect(deriveProtocolDiagnostics(entries)).toEqual([]);
  });

  it("emits version-mismatch for a non-v0.9 version field", () => {
    const entries: SessionEntry[] = [
      { tick: 0, ts: 0, direction: "agent->client",
        message: { version: "v1.0" } as unknown as SessionEntry["message"] },
    ];
    const out = deriveProtocolDiagnostics(entries);
    expect(out.some((d) => d.code === "version-mismatch")).toBe(true);
  });

  it("does not emit version-mismatch for v0.9", () => {
    const entries: SessionEntry[] = [msg(0, {})];
    expect(deriveProtocolDiagnostics(entries).some((d) => d.code === "version-mismatch")).toBe(false);
  });

  it("survives a malformed entry by emitting a single derive-crashed diagnostic", () => {
    // @ts-expect-error — deliberately bad entry shape to exercise try/catch
    const entries: SessionEntry[] = [{ tick: 0, ts: 0, direction: "agent->client", message: null }];
    const out = deriveProtocolDiagnostics(entries);
    expect(out.some((d) => d.code === "derive-crashed")).toBe(true);
  });
});
