import { describe, expect, it } from "vitest";
import { SseDecoder } from "../adapters/sse.js";

describe("SseDecoder", () => {
  it("emits the data payload of a complete event", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it("buffers an event split across two chunks", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a"')).toEqual([]);
    expect(d.push(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it("emits multiple events from one chunk", () => {
    const d = new SseDecoder();
    expect(d.push("data: one\n\ndata: two\n\n")).toEqual(["one", "two"]);
  });

  it("joins multi-line data fields with newlines", () => {
    const d = new SseDecoder();
    expect(d.push("data: line1\ndata: line2\n\n")).toEqual(["line1\nline2"]);
  });

  it("ignores comment lines and non-data fields", () => {
    const d = new SseDecoder();
    expect(d.push(": keep-alive\nevent: update\ndata: payload\n\n")).toEqual(["payload"]);
  });

  it("normalizes CRLF line endings", () => {
    const d = new SseDecoder();
    expect(d.push("data: x\r\n\r\n")).toEqual(["x"]);
  });

  it("skips events that have no data field", () => {
    const d = new SseDecoder();
    expect(d.push(": just a comment\n\n")).toEqual([]);
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { SessionStore } from "../session/store.js";
import { connectSseUpstream } from "../adapters/sse.js";

describe("connectSseUpstream", () => {
  let server: Server;
  let port: number;
  let pushEvent: ((data: string) => void) | undefined;

  beforeEach(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      pushEvent = (data: string) => res.write(`data: ${data}\n\n`);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    pushEvent = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("appends each valid A2UI message streamed over SSE", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 50));
    pushEvent!(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(store.length).toBe(1);
    expect(statuses).toContain("connected");
    handle.close();
  });

  it("ignores malformed SSE payloads", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    await new Promise((r) => setTimeout(r, 50));
    pushEvent!("not-json");
    pushEvent!(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "ok" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(store.length).toBe(1);
    handle.close();
  });

  it("appends a schema diagnostic when an inbound SSE payload fails parsing", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    await vi.waitFor(() => { expect(pushEvent).toBeDefined(); });
    pushEvent!("not-json");
    await vi.waitFor(() => {
      expect(store.diagnostics().some((d) => d.category === "schema" && d.code === "inbound-parse-failed")).toBe(true);
    });
    handle.close();
  });

  it("mirrors upstream close as a transport diagnostic on SSE", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    // Wait until the server-side handler has been invoked, so the adapter's
    // fetch loop is actively reading — only then will abort() reach the catch
    // block that emits the `closed` diagnostic.
    await vi.waitFor(() => { expect(pushEvent).toBeDefined(); });
    handle.close();
    await vi.waitFor(() => {
      expect(store.diagnostics().some((d) =>
        d.category === "transport" && d.code === "upstream-closed"
      )).toBe(true);
    });
  });

  it("does not expose a send() — SSE is unidirectional", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.send).toBeUndefined();
    handle.close();
  });
});
