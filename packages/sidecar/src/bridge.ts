import { CommandSchema, type Event } from "@a2ui-inspector/shared";
import type { WebSocket } from "ws";
import { connectWebSocketUpstream } from "./adapters/websocket.js";
import { connectSseUpstream } from "./adapters/sse.js";
import { startWebSocketProxy, type RunningProxy } from "./adapters/proxy.js";
import { loadFileIntoStore } from "./adapters/file.js";
import { saveSession } from "./session/persistence.js";
import type { SessionStore } from "./session/store.js";
import type { UpstreamHandle } from "./adapters/types.js";

export function registerBridgeClient(socket: WebSocket, store: SessionStore): void {
  let upstream: UpstreamHandle | undefined;
  let proxy: RunningProxy | undefined;

  const send = (e: Event) => socket.send(JSON.stringify(e));

  // Replay full session to a new client on connect.
  for (const entry of store.entries()) {
    if (entry.message) {
      send({ kind: "messageReceived", tick: entry.tick, ts: entry.ts, message: entry.message });
    } else if (entry.action) {
      send({ kind: "actionSent", tick: entry.tick, ts: entry.ts, action: entry.action });
    }
  }

  const unsubAppend = store.onAppend((entry) => {
    if (entry.message) send({ kind: "messageReceived", tick: entry.tick, ts: entry.ts, message: entry.message });
    else if (entry.action) send({ kind: "actionSent", tick: entry.tick, ts: entry.ts, action: entry.action });
  });

  const unsubReplace = store.onReplace((entries) => {
    send({ kind: "sessionLoaded", tickCount: entries.length });
    for (const entry of entries) {
      if (entry.message) send({ kind: "messageReceived", tick: entry.tick, ts: entry.ts, message: entry.message });
      else if (entry.action) send({ kind: "actionSent", tick: entry.tick, ts: entry.ts, action: entry.action });
    }
  });

  socket.on("message", async (raw) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString()); } catch {
      send({ kind: "diagnostic", level: "warn", message: "bridge: malformed JSON command" });
      return;
    }
    const result = CommandSchema.safeParse(parsed);
    if (!result.success) {
      send({ kind: "diagnostic", level: "warn", message: `bridge: invalid command — ${result.error.message}` });
      return;
    }
    const cmd = result.data;
    switch (cmd.kind) {
      case "connectUpstream": {
        upstream?.close();
        const onStatus = (s: { status: "connecting" | "connected" | "closed" | "error"; detail?: string }) =>
          send({ kind: "upstreamStatus", status: s.status, detail: s.detail });
        try {
          if (cmd.config.transport === "websocket") {
            upstream = await connectWebSocketUpstream(cmd.config.url, store, onStatus);
          } else {
            upstream = await connectSseUpstream(cmd.config.url, store, onStatus);
          }
        } catch (err) {
          send({ kind: "diagnostic", level: "error", message: `connectUpstream failed: ${String((err as Error).message)}` });
        }
        return;
      }
      case "startProxy": {
        proxy?.close();
        try {
          proxy = await startWebSocketProxy(cmd.port, cmd.target, store, (s) =>
            send({ kind: "upstreamStatus", status: s.status, detail: s.detail })
          );
        } catch (err) {
          send({ kind: "diagnostic", level: "error", message: `startProxy failed: ${String((err as Error).message)}` });
        }
        return;
      }
      case "injectAction": {
        if (upstream?.send) {
          upstream.send(cmd.action);
          store.appendAction(cmd.action);
        } else {
          send({ kind: "diagnostic", level: "warn", message: "injectAction: no sendable upstream connected (connect a WebSocket agent first)" });
        }
        return;
      }
      case "loadFile": {
        try { await loadFileIntoStore(cmd.path, store); }
        catch (err) { send({ kind: "diagnostic", level: "error", message: String((err as Error).message) }); }
        return;
      }
      case "saveSession": {
        try { await saveSession(cmd.path, [...store.entries()]); }
        catch (err) { send({ kind: "diagnostic", level: "error", message: String((err as Error).message) }); }
        return;
      }
      case "scrubTo":
        return; // UI-only; sidecar holds no scrub state
      case "clear":
        store.clear();
        return;
    }
  });

  socket.on("close", () => {
    upstream?.close();
    proxy?.close();
    unsubAppend();
    unsubReplace();
  });
}
