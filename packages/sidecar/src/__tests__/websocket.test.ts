import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { SessionStore } from "../session/store.js";
import { connectWebSocketUpstream } from "../adapters/websocket.js";

describe("WebSocket upstream adapter", () => {
  let server: WebSocketServer;
  let port: number;
  let clientSocket: WebSocket | undefined;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      server = new WebSocketServer({ port: 0 }, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) port = addr.port;
        resolve();
      });
      server.on("connection", (s) => { clientSocket = s; });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("appends each incoming message to the store", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 20));
    clientSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    expect(statuses).toContain("connected");
    handle.close();
  });

  it("ignores malformed lines and emits a diagnostic-like status", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 20));
    clientSocket!.send("not-json");
    clientSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "good" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    handle.close();
  });
});
