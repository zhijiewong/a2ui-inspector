import { WebSocket } from "ws";
import { type A2UIAction } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import { makeStatusEmitter, parseInboundPayload } from "./diagnostics.js";
import type { UpstreamHandle, UpstreamStatus } from "./types.js";

export type { UpstreamHandle, UpstreamStatus } from "./types.js";

export async function connectWebSocketUpstream(
  url: string,
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void,
): Promise<UpstreamHandle> {
  const emitStatus = makeStatusEmitter(store, onStatus);

  emitStatus({ status: "connecting" });
  const ws = new WebSocket(url);

  ws.on("open", () => emitStatus({ status: "connected" }));
  ws.on("close", () => emitStatus({ status: "closed" }));
  ws.on("error", (err) => emitStatus({ status: "error", detail: String(err) }));

  ws.on("message", (data) => {
    const message = parseInboundPayload(store, data.toString());
    if (message) store.appendMessage(message);
  });

  return {
    close: () => ws.close(),
    send: (action: A2UIAction) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(action));
    },
  };
}
