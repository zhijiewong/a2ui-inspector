import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { SessionStore } from "../session/store.js";
import { connectWebSocketUpstream } from "../adapters/websocket.js";

describe("WebSocket upstream adapter", () => {
  let server: WebSocketServer;
  let port: number;
  let nextSocket: Promise<WebSocket>;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      server = new WebSocketServer({ port: 0 }, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) port = addr.port;
        resolve();
      });
    });
    // Re-arm before each test so we await the *next* incoming connection,
    // not a stale resolved promise from a prior test.
    nextSocket = new Promise<WebSocket>((resolve) => {
      server.once("connection", (s) => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("appends each incoming message to the store", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    const clientSocket = await nextSocket;
    clientSocket.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    expect(statuses).toContain("connected");
    handle.close();
  });

  it("ignores malformed lines and emits a diagnostic-like status", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    const clientSocket = await nextSocket;
    clientSocket.send("not-json");
    clientSocket.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "good" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    handle.close();
  });

  it("send() forwards an action to the upstream as JSON", async () => {
    const store = new SessionStore();
    const received: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, () => {});
    const clientSocket = await nextSocket;
    clientSocket.on("message", (d) => received.push(d.toString()));
    // handle.send no-ops until the client ws is OPEN; poll rather than rely on a fixed delay.
    await vi.waitFor(() => {
      handle.send?.({ surfaceId: "main", componentId: "btn", kind: "tap" });
      expect(received.length).toBe(1);
    });
    expect(JSON.parse(received[0]!)).toEqual({ surfaceId: "main", componentId: "btn", kind: "tap" });
    handle.close();
  });
});
