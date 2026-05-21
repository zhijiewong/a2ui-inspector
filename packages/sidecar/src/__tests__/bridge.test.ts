import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
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
});
