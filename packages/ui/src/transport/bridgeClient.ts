import { CommandSchema, EventSchema, type Command, type Event } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";

const SIDECAR_ORIGIN = import.meta.env.DEV ? "http://127.0.0.1:8765" : "";
const BRIDGE_WS = import.meta.env.DEV ? "ws://127.0.0.1:8765/bridge" : `ws://${location.host}/bridge`;

export class BridgeClient {
  private ws?: WebSocket;

  /** Fetch the bridge token (same-origin), then open the authed WebSocket. */
  async connect(): Promise<void> {
    let token = "";
    try {
      const res = await fetch(`${SIDECAR_ORIGIN}/bridge-token`);
      token = ((await res.json()) as { token?: string }).token ?? "";
    } catch {
      useSessionStore.getState().applyEvent({
        kind: "diagnostic",
        diagnostic: {
          ts: Date.now(), category: "transport", severity: "error",
          code: "bridge-http-error", message: "bridge: could not fetch auth token from the sidecar",
        },
      });
      return;
    }

    this.ws = new WebSocket(`${BRIDGE_WS}?token=${encodeURIComponent(token)}`);
    this.ws.addEventListener("message", (ev) => {
      let parsed: unknown;
      try { parsed = JSON.parse(ev.data as string); } catch { return; }
      const result = EventSchema.safeParse(parsed);
      if (!result.success) {
        useSessionStore.getState().applyEvent({
          kind: "diagnostic",
          diagnostic: {
            ts: Date.now(), category: "transport", severity: "warn",
            code: "bridge-bad-event", message: `bridge: bad event — ${result.error.message}`,
          },
        });
        return;
      }
      useSessionStore.getState().applyEvent(result.data as Event);
    });
  }

  send(cmd: Command): void {
    const validated = CommandSchema.parse(cmd);
    this.ws?.send(JSON.stringify(validated));
  }
}

export const bridge = new BridgeClient();
