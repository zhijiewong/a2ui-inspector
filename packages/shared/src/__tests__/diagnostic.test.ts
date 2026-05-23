import { describe, expect, it } from "vitest";
import { DiagnosticSchema } from "../diagnostic.js";
import { EventSchema } from "../bridge.js";

describe("DiagnosticSchema", () => {
  it("round-trips a full diagnostic", () => {
    const d = {
      ts: 1_700_000_000_000,
      tick: 5,
      category: "schema" as const,
      severity: "error" as const,
      code: "parse-failed",
      message: "Expected string",
      detail: { raw: "bad" },
    };
    expect(DiagnosticSchema.parse(d)).toEqual(d);
  });

  it("accepts a diagnostic with no tick or detail", () => {
    const d = {
      ts: 1,
      category: "transport" as const,
      severity: "warn" as const,
      code: "connect-error",
      message: "ECONNREFUSED",
    };
    expect(DiagnosticSchema.parse(d)).toEqual(d);
  });

  it("rejects unknown category", () => {
    expect(() =>
      DiagnosticSchema.parse({
        ts: 1, category: "weird", severity: "error", code: "x", message: "y",
      }),
    ).toThrow();
  });

  it("rejects unknown severity", () => {
    expect(() =>
      DiagnosticSchema.parse({
        ts: 1, category: "render", severity: "info", code: "x", message: "y",
      }),
    ).toThrow();
  });
});

describe("EventSchema diagnostic variant", () => {
  it("accepts the new diagnostic event shape", () => {
    const e = {
      kind: "diagnostic" as const,
      diagnostic: {
        ts: 1, category: "transport" as const, severity: "warn" as const,
        code: "bridge-bad-event", message: "x",
      },
    };
    expect(EventSchema.parse(e)).toEqual(e);
  });

  it("rejects the old diagnostic event shape", () => {
    expect(() =>
      EventSchema.parse({ kind: "diagnostic", level: "warn", message: "x" }),
    ).toThrow();
  });
});
