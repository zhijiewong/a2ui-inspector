import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { Event } from "@a2ui-inspector/shared";
import { buildServer } from "../server.js";
import { SessionStore } from "../session/store.js";

describe("bridge", () => {
  let close: () => Promise<void>;
  let port: number;
  let store: SessionStore;

  beforeEach(async () => {
    store = new SessionStore();
    const app = await buildServer({ store });
    const addr = await app.listen({ port: 0, host: "127.0.0.1" });
    port = Number(new URL(addr).port);
    close = async () => { await app.close(); };
  });

  afterEach(async () => { await close(); });

  it("emits messageReceived events to a connected browser client", async () => {
    const events: Event[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.on("message", (data) => events.push(JSON.parse(data.toString()) as Event));

    store.appendMessage({ version: "v0.9", createSurface: { surfaceId: "main" } } as any);

    await new Promise((r) => setTimeout(r, 20));
    expect(events.some((e) => e.kind === "messageReceived")).toBe(true);
    client.close();
  });

  it("accepts a scrubTo command without effect on the sidecar store", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify({ kind: "scrubTo", tick: 5 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(0);
    client.close();
  });

  it("injectAction with no upstream emits a diagnostic", async () => {
    const events: Event[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.on("message", (data) => events.push(JSON.parse(data.toString()) as Event));
    client.send(JSON.stringify({
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    }));
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.kind === "diagnostic")).toBe(true);
    expect(store.length).toBe(0);
    client.close();
  });

  it("injectAction with a connected WS upstream forwards the action and records it", async () => {
    const agent = new WebSocketServer({ port: 0 });
    const agentPort = (agent.address() as { port: number }).port;
    const received: string[] = [];
    agent.on("connection", (s) => s.on("message", (d) => received.push(d.toString())));

    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify({
      kind: "connectUpstream",
      config: { transport: "websocket", url: `ws://127.0.0.1:${agentPort}` },
    }));
    await new Promise((r) => setTimeout(r, 50));
    client.send(JSON.stringify({
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(store.entries().some((e) => e.action)).toBe(true);
    client.close();
    await new Promise<void>((r) => agent.close(() => r()));
  });
});
