import { CommandSchema, type Event } from "@a2ui-inspector/shared";
import type { WebSocket } from "ws";
import { connectWebSocketUpstream, type UpstreamHandle } from "./adapters/websocket.js";
import { loadFileIntoStore } from "./adapters/file.js";
import { saveSession } from "./session/persistence.js";
import type { SessionStore } from "./session/store.js";

export function registerBridgeClient(socket: WebSocket, store: SessionStore): void {
  let upstream: UpstreamHandle | undefined;

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
        if (cmd.config.transport === "websocket") {
          upstream?.close();
          upstream = await connectWebSocketUpstream(cmd.config.url, store, (s) =>
            send({ kind: "upstreamStatus", status: s.status, detail: s.detail })
          );
        } else {
          send({ kind: "diagnostic", level: "warn", message: "SSE transport not implemented in Phase 1" });
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
    unsubAppend();
    unsubReplace();
  });
}
