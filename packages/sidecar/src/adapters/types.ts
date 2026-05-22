import type { A2UIAction } from "@a2ui-inspector/shared";

export interface UpstreamStatus {
  status: "connecting" | "connected" | "closed" | "error";
  detail?: string;
}

/**
 * A live connection to an upstream A2UI agent.
 * `send` is present only for bidirectional transports (WebSocket); it is
 * absent for unidirectional ones (SSE).
 */
export interface UpstreamHandle {
  close: () => void;
  send?: (action: A2UIAction) => void;
}

/** A running man-in-the-middle proxy. */
export interface ProxyHandle {
  close: () => void;
}
