import { CommandSchema, type Diagnostic, type Event } from "@a2ui-inspector/shared";
import type { WebSocket } from "ws";
import { connectWebSocketUpstream } from "./adapters/websocket.js";
import { connectSseUpstream } from "./adapters/sse.js";
import { startWebSocketProxy, type RunningProxy } from "./adapters/proxy.js";
import { loadFileIntoStore } from "./adapters/file.js";
import { saveSession } from "./session/persistence.js";
import type { SessionStore } from "./session/store.js";
import type { UpstreamHandle } from "./adapters/types.js";

// Diagnostic code naming convention: <subject>-<action-or-condition>, lowercase, hyphen-separated.
// Subject is the noun the diagnostic is about (command, upstream, proxy, action, file, session).
// Codes are stable identifiers — change them only with deliberate migration.
function makeDiagnostic(
  severity: "warn" | "error",
  code: string,
  message: string,
): { kind: "diagnostic"; diagnostic: Diagnostic } {
  return {
    kind: "diagnostic",
    diagnostic: {
      ts: Date.now(),
      category: "transport",
      severity,
      code,
      message,
    },
  };
}

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
      send(makeDiagnostic("warn", "command-malformed-json", "bridge: malformed JSON command"));
      return;
    }
    const result = CommandSchema.safeParse(parsed);
    if (!result.success) {
      send(makeDiagnostic("warn", "command-invalid-schema", `bridge: invalid command — ${result.error.message}`));
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
          send(makeDiagnostic("error", "upstream-connect-failed", `connectUpstream failed: ${String((err as Error).message)}`));
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
          send(makeDiagnostic("error", "proxy-start-failed", `startProxy failed: ${String((err as Error).message)}`));
        }
        return;
      }
      case "injectAction": {
        if (upstream?.send) {
          upstream.send(cmd.action);
          store.appendAction(cmd.action);
        } else {
          send(makeDiagnostic("warn", "action-inject-no-upstream", "injectAction: no sendable upstream connected (connect a WebSocket agent first)"));
        }
        return;
      }
      case "loadFile": {
        try { await loadFileIntoStore(cmd.path, store); }
        catch (err) { send(makeDiagnostic("error", "file-load-failed", String((err as Error).message))); }
        return;
      }
      case "saveSession": {
        try { await saveSession(cmd.path, [...store.entries()]); }
        catch (err) { send(makeDiagnostic("error", "session-save-failed", String((err as Error).message))); }
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
