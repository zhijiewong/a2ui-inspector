import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { SessionStore } from "../session/store.js";
import { startWebSocketProxy } from "../adapters/proxy.js";

describe("startWebSocketProxy", () => {
  let agent: WebSocketServer;
  let agentPort: number;
  let agentSocket: WebSocket | undefined;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      agent = new WebSocketServer({ port: 0 }, () => {
        const addr = agent.address();
        if (typeof addr === "object" && addr) agentPort = addr.port;
        resolve();
      });
      agent.on("connection", (s) => { agentSocket = s; });
    });
  });

  afterEach(async () => {
    agentSocket = undefined;
    await new Promise<void>((resolve) => agent.close(() => resolve()));
  });

  it("pipes agent messages to the renderer and records them", async () => {
    const store = new SessionStore();
    const proxy = await startWebSocketProxy(0, `ws://127.0.0.1:${agentPort}`, store, () => {});

    const renderer = new WebSocket(`ws://127.0.0.1:${proxy.port}`);
    const fromAgent: string[] = [];
    renderer.on("message", (d) => fromAgent.push(d.toString()));
    await new Promise<void>((r) => renderer.once("open", () => r()));
    await new Promise((r) => setTimeout(r, 20));

    agentSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fromAgent.length).toBe(1);
    expect(store.length).toBe(1);
    expect(store.entries()[0]?.direction).toBe("agent->client");
    renderer.close();
    proxy.close();
  });

  it("pipes renderer actions to the agent and records them", async () => {
    const store = new SessionStore();
    const proxy = await startWebSocketProxy(0, `ws://127.0.0.1:${agentPort}`, store, () => {});

    const renderer = new WebSocket(`ws://127.0.0.1:${proxy.port}`);
    await new Promise<void>((r) => renderer.once("open", () => r()));
    await new Promise((r) => setTimeout(r, 20));

    const fromRenderer: string[] = [];
    agentSocket!.on("message", (d) => fromRenderer.push(d.toString()));
    renderer.send(JSON.stringify({ surfaceId: "main", componentId: "btn", kind: "tap" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fromRenderer.length).toBe(1);
    expect(store.length).toBe(1);
    expect(store.entries()[0]?.direction).toBe("client->agent");
    renderer.close();
    proxy.close();
  });
});
