import { A2UIMessageSchema } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import type { UpstreamHandle, UpstreamStatus } from "./types.js";

export type { UpstreamHandle, UpstreamStatus } from "./types.js";

/**
 * Incremental Server-Sent-Events decoder. Feed it raw text chunks with
 * push(); it returns the `data` payload of every complete event seen so far.
 * Events are blank-line delimited per the SSE spec.
 */
export class SseDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const out: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = parseEventData(block);
      if (data !== undefined) out.push(data);
    }
    return out;
  }
}

function parseEventData(block: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // comment
    if (line === "data") {
      dataLines.push("");
    } else if (line.startsWith("data:")) {
      let value = line.slice(5);
      if (value.startsWith(" ")) value = value.slice(1);
      dataLines.push(value);
    }
    // event:, id:, retry: are intentionally ignored — A2UI carries its
    // payload in the data field only.
  }
  return dataLines.length > 0 ? dataLines.join("\n") : undefined;
}

export async function connectSseUpstream(
  url: string,
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void
): Promise<UpstreamHandle> {
  onStatus({ status: "connecting" });
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onStatus({ status: "error", detail: `HTTP ${res.status}` });
        return;
      }
      onStatus({ status: "connected" });
      const decoder = new SseDecoder();
      const reader = res.body.getReader();
      const text = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const payload of decoder.push(text.decode(value, { stream: true }))) {
          let parsed: unknown;
          try { parsed = JSON.parse(payload); } catch { continue; }
          const result = A2UIMessageSchema.safeParse(parsed);
          if (result.success) store.appendMessage(result.data);
        }
      }
      onStatus({ status: "closed" });
    } catch (err) {
      if (controller.signal.aborted) onStatus({ status: "closed" });
      else onStatus({ status: "error", detail: String(err) });
    }
  })();

  // No `send` — SSE is server->client only.
  return { close: () => controller.abort() };
}
