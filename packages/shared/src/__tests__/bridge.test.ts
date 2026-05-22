import { describe, expect, it } from "vitest";
import { CommandSchema, EventSchema } from "../bridge.js";

describe("Bridge Command", () => {
  it("parses connectUpstream WS config", () => {
    const cmd = { kind: "connectUpstream", config: { transport: "websocket", url: "ws://localhost:8080" } };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("parses scrubTo", () => {
    expect(() => CommandSchema.parse({ kind: "scrubTo", tick: 42 })).not.toThrow();
  });

  it("parses loadFile", () => {
    expect(() => CommandSchema.parse({ kind: "loadFile", path: "/tmp/x.jsonl" })).not.toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() => CommandSchema.parse({ kind: "frobnicate" })).toThrow();
  });

  it("parses injectAction", () => {
    const cmd = {
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("rejects injectAction with a malformed action", () => {
    expect(() => CommandSchema.parse({ kind: "injectAction", action: { kind: "tap" } })).toThrow();
  });

  it("parses startProxy", () => {
    const cmd = { kind: "startProxy", port: 9100, target: "ws://localhost:8000" };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("rejects startProxy with a non-positive port", () => {
    expect(() => CommandSchema.parse({ kind: "startProxy", port: 0, target: "ws://x" })).toThrow();
  });
});

describe("Bridge Event", () => {
  it("parses messageReceived", () => {
    const ev = {
      kind: "messageReceived",
      tick: 0,
      ts: Date.now(),
      message: { version: "v0.9", createSurface: { surfaceId: "main" } }
    };
    expect(() => EventSchema.parse(ev)).not.toThrow();
  });

  it("parses upstreamStatus", () => {
    expect(() => EventSchema.parse({ kind: "upstreamStatus", status: "connected" })).not.toThrow();
  });
});
