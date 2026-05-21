import { describe, expect, it } from "vitest";
import { SessionEntrySchema } from "../session.js";

describe("SessionEntrySchema", () => {
  it("parses a message entry", () => {
    const e = {
      tick: 0,
      ts: 1000,
      direction: "agent->client",
      message: { version: "v0.9", createSurface: { surfaceId: "main" } }
    };
    expect(() => SessionEntrySchema.parse(e)).not.toThrow();
  });

  it("parses an action entry", () => {
    const e = {
      tick: 1,
      ts: 1001,
      direction: "client->agent",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" }
    };
    expect(() => SessionEntrySchema.parse(e)).not.toThrow();
  });

  it("rejects entry missing both message and action", () => {
    expect(() => SessionEntrySchema.parse({ tick: 0, ts: 0, direction: "agent->client" })).toThrow();
  });
});
