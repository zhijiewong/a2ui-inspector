import { WebSocket, WebSocketServer } from "ws";
import { A2UIActionSchema, A2UIMessageSchema } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import type { ProxyHandle, UpstreamStatus } from "./types.js";

/** A ProxyHandle that also exposes the actual listening port. */
export interface RunningProxy extends ProxyHandle {
  port: number;
}

/**
 * Experimental man-in-the-middle WebSocket proxy. A renderer connects to the
 * returned `port`; the proxy dials `targetUrl` (the agent) and pipes frames
 * both ways, copying A2UI messages and actions into `store`.
 *
 * Async because the listening socket binds asynchronously — the returned
 * `port` is only known once the server is actually listening.
 *
 * Security: the proxy dials whatever `targetUrl` the bridge client supplies
 * and relays frames verbatim. It must only ever listen on loopback — never
 * expose the proxy (or the bridge) beyond 127.0.0.1.
 */
export async function startWebSocketProxy(
  listenPort: number,
  targetUrl: string,
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void
): Promise<RunningProxy> {
  const wss = new WebSocketServer({ port: listenPort });

  wss.on("connection", (renderer) => {
    const agent = new WebSocket(targetUrl);
    const pending: string[] = [];

    agent.on("open", () => {
      for (const msg of pending) agent.send(msg);
      pending.length = 0;
    });
    agent.on("error", (err) => {
      onStatus({ status: "error", detail: String(err) });
      if (renderer.readyState === WebSocket.OPEN) renderer.close();
    });
    agent.on("close", () => renderer.close());
    renderer.on("close", () => agent.close());

    // agent -> renderer
    agent.on("message", (data) => {
      const text = data.toString();
      if (renderer.readyState === WebSocket.OPEN) renderer.send(text);
      try {
        const result = A2UIMessageSchema.safeParse(JSON.parse(text));
        if (result.success) store.appendMessage(result.data);
      } catch { /* non-A2UI frame; forwarded but not recorded */ }
    });

    // renderer -> agent
    renderer.on("message", (data) => {
      const text = data.toString();
      if (agent.readyState === WebSocket.OPEN) agent.send(text);
      else pending.push(text);
      try {
        const result = A2UIActionSchema.safeParse(JSON.parse(text));
        if (result.success) store.appendAction(result.data);
      } catch { /* non-A2UI frame; forwarded but not recorded */ }
    });
  });

  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", reject);
  });

  const address = wss.address();
  const port = typeof address === "object" && address ? address.port : listenPort;
  onStatus({ status: "connected", detail: `proxy listening on :${port}` });

  return { port, close: () => wss.close() };
}
