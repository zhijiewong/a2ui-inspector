import { WebSocket } from "ws";
import { A2UIMessageSchema } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";

export interface UpstreamStatus {
  status: "connecting" | "connected" | "closed" | "error";
  detail?: string;
}

export interface UpstreamHandle {
  close: () => void;
}

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
  };
}
