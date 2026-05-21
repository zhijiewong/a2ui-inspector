import { CommandSchema, EventSchema, type Command, type Event } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";

export class BridgeClient {
  private ws?: WebSocket;
  private url: string;

  constructor(url = import.meta.env.DEV
    ? `ws://127.0.0.1:8765/bridge`
    : `ws://${location.host}/bridge`) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (ev) => {
      let parsed: unknown;
      try { parsed = JSON.parse(ev.data as string); } catch { return; }
      const result = EventSchema.safeParse(parsed);
      if (!result.success) {
        useSessionStore.getState().applyEvent({
          kind: "diagnostic", level: "warn",
          message: `bridge: bad event — ${result.error.message}`
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
