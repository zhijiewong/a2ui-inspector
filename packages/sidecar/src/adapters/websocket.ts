import { WebSocket } from "ws";
import { A2UIMessageSchema, type A2UIAction } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import type { UpstreamHandle, UpstreamStatus } from "./types.js";

export type { UpstreamHandle, UpstreamStatus } from "./types.js";

export async function connectWebSocketUpstream(
  url: string,
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void
): Promise<UpstreamHandle> {
  onStatus({ status: "connecting" });
  const ws = new WebSocket(url);

  ws.on("open", () => onStatus({ status: "connected" }));
  ws.on("close", () => onStatus({ status: "closed" }));
  ws.on("error", (err) => onStatus({ status: "error", detail: String(err) }));

  ws.on("message", (data) => {
    let parsed: unknown;
    try { parsed = JSON.parse(data.toString()); } catch { return; }
    const result = A2UIMessageSchema.safeParse(parsed);
    if (result.success) store.appendMessage(result.data);
  });

  return {
    close: () => ws.close(),
    send: (action: A2UIAction) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(action));
    },
  };
}
