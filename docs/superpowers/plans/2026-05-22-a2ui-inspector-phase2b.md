# A2UI Inspector — Phase 2b: Transports & Action Injection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two remaining upstream transports (SSE, experimental WebSocket proxy) and bidirectional action injection so the Inspector can debug SSE agents, sit in the middle of an agent↔renderer connection, and fire synthetic `action` events back to a live agent.

**Architecture:** Build on the Phase 1 + 2a monorepo. Extend the shared bridge `CommandSchema` with `injectAction` and `startProxy`. In the sidecar, lift the adapter types into a shared `adapters/types.ts`, add an SSE adapter (native `fetch` streaming + a pure `SseDecoder`) and an experimental WebSocket pass-through proxy, give `UpstreamHandle` an optional `send` for action write-back, and wire the three new behaviours into `bridge.ts`. In the UI, add an `ActionInjector` form and transport-aware connect affordances.

**Tech Stack:** Existing — TypeScript 5, Node 20, Fastify 4, `ws` 8, Zod 3, React 18, Zustand 4, Vitest. No new dependencies (SSE uses native `fetch`).

---

## Phase 2b scope

**In scope:**
- `shared`: `injectAction` + `startProxy` commands in `CommandSchema`
- `sidecar`: `adapters/types.ts` (shared `UpstreamStatus`/`UpstreamHandle`/`ProxyHandle`), `UpstreamHandle.send` for write-back
- `sidecar`: SSE upstream adapter (`SseDecoder` pure parser + `connectSseUpstream`)
- `sidecar`: experimental WebSocket pass-through proxy (`startWebSocketProxy`)
- `sidecar`: wire SSE, `startProxy`, `injectAction` into `bridge.ts`
- `ui`: `ActionInjector` form component + wiring; transport-aware Connect (ws→websocket, http→sse) + a Proxy affordance

**Deferred to Phase 2c:** command palette, full keyboard-shortcut set, light-mode toggle, device-frame toggle, Docker image, additional fixtures, capturing actions directly from Preview interactions (Phase 2b uses an explicit injector form), action write-back over SSE (SSE is unidirectional; the companion HTTP-POST channel is out of scope).

## Starting state

- Branch off `main` (Phase 1 + 2a merged).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`
- Existing relevant code:
  - `packages/shared/src/bridge.ts` — `CommandSchema` (5 kinds), `EventSchema`, `UpstreamConfigSchema` (transports `websocket`, `sse`).
  - `packages/shared/src/a2ui.ts` — `A2UIActionSchema`, `A2UIAction`, `A2UIMessageSchema`, `A2UIMessage`.
  - `packages/sidecar/src/adapters/websocket.ts` — `connectWebSocketUpstream`, `UpstreamStatus`, `UpstreamHandle` (interfaces currently live here).
  - `packages/sidecar/src/adapters/file.ts` — `loadFileIntoStore`.
  - `packages/sidecar/src/bridge.ts` — `registerBridgeClient`; command switch handles connectUpstream/loadFile/saveSession/scrubTo/clear; the SSE branch currently emits a "not implemented in Phase 1" diagnostic.
  - `packages/sidecar/src/session/store.ts` — `SessionStore` with `appendMessage`, `appendAction`.
  - `packages/ui/src/components/Toolbar.tsx` — `<Toolbar onConnect onLoadFile onSave upstreamStatus />`.
  - `packages/ui/src/App.tsx` — wires Toolbar, panels, `bridge`.
  - `packages/ui/src/transport/bridgeClient.ts` — `bridge` singleton, `send(cmd)`.

## File structure after Phase 2b

```
packages/sidecar/src/
├── adapters/
│   ├── types.ts            NEW — UpstreamStatus, UpstreamHandle, ProxyHandle
│   ├── websocket.ts        MODIFIED — import types from types.ts; add send()
│   ├── sse.ts              NEW — SseDecoder + connectSseUpstream
│   ├── proxy.ts            NEW — startWebSocketProxy (experimental)
│   └── file.ts             (unchanged)
└── bridge.ts               MODIFIED — wire sse / startProxy / injectAction

packages/shared/src/
└── bridge.ts               MODIFIED — injectAction + startProxy commands

packages/ui/src/
├── components/
│   ├── Toolbar.tsx         MODIFIED — add onProxy
│   └── ActionInjector.tsx  NEW — synthetic-action form
└── App.tsx                 MODIFIED — transport-aware connect, proxy, injector
```

## Pre-flight notes

1. Run `pnpm test` after each task — Phase 1+2a's 63 tests must stay green.
2. The SSE adapter uses Node's global `fetch` (Node 20+). No `eventsource` dependency.
3. The WebSocket proxy is **experimental** — scoped to WS pass-through (the realistic A2UI transport), not arbitrary HTTP MITM.
4. Commit after every task.

---

## Task 1: Extend `CommandSchema` with `injectAction` and `startProxy`

**Files:**
- Modify: `packages/shared/src/bridge.ts`
- Modify: `packages/shared/src/__tests__/bridge.test.ts`

- [ ] **Step 1: Add failing tests**

Append these cases inside the existing `describe("Bridge Command", ...)` block in `packages/shared/src/__tests__/bridge.test.ts`:

```typescript
  it("parses injectAction", () => {
    const cmd = {
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("rejects injectAction with a malformed action", () => {
    expect(() => CommandSchema.parse({ kind: "injectAction", action: { kind: "tap" } })).toThrow();
  });

  it("parses startProxy", () => {
    const cmd = { kind: "startProxy", port: 9100, target: "ws://localhost:8000" };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("rejects startProxy with a non-positive port", () => {
    expect(() => CommandSchema.parse({ kind: "startProxy", port: 0, target: "ws://x" })).toThrow();
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: FAIL — the four new cases fail (`injectAction`/`startProxy` not in the union).

- [ ] **Step 3: Add the two command variants**

In `packages/shared/src/bridge.ts`, replace the `CommandSchema` definition with:

```typescript
export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connectUpstream"), config: UpstreamConfigSchema }),
  z.object({ kind: z.literal("loadFile"), path: z.string() }),
  z.object({ kind: z.literal("saveSession"), path: z.string() }),
  z.object({ kind: z.literal("scrubTo"), tick: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("clear") }),
  z.object({ kind: z.literal("injectAction"), action: A2UIActionSchema }),
  z.object({ kind: z.literal("startProxy"), port: z.number().int().positive(), target: z.string().url() }),
]);
```

`A2UIActionSchema` is already imported at the top of the file.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: PASS — all bridge tests green. Run `pnpm --filter @a2ui-inspector/shared typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add injectAction + startProxy bridge commands"
```

---

## Task 2: Shared adapter types + `UpstreamHandle.send`

**Files:**
- Create: `packages/sidecar/src/adapters/types.ts`
- Modify: `packages/sidecar/src/adapters/websocket.ts`
- Modify: `packages/sidecar/src/__tests__/websocket.test.ts`

This lifts the adapter interfaces out of `websocket.ts` so SSE/proxy can share them, and adds an optional `send` so an upstream can carry an injected action back to the agent.

- [ ] **Step 1: Create `packages/sidecar/src/adapters/types.ts`**

```typescript
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
```

- [ ] **Step 2: Add a failing test for `send`**

Append inside the existing `describe("WebSocket upstream adapter", ...)` block in `packages/sidecar/src/__tests__/websocket.test.ts`:

```typescript
  it("send() forwards an action to the upstream as JSON", async () => {
    const store = new SessionStore();
    const received: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, () => {});
    await new Promise((r) => setTimeout(r, 20));
    clientSocket!.on("message", (d) => received.push(d.toString()));
    handle.send?.({ surfaceId: "main", componentId: "btn", kind: "tap" });
    await new Promise((r) => setTimeout(r, 20));
    expect(received.length).toBe(1);
    expect(JSON.parse(received[0]!)).toEqual({ surfaceId: "main", componentId: "btn", kind: "tap" });
    handle.close();
  });
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `handle.send` is undefined.

- [ ] **Step 4: Update `packages/sidecar/src/adapters/websocket.ts`**

Replace the whole file with:

```typescript
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
```

(`websocket.ts` re-exports the types so existing importers of `UpstreamHandle`/`UpstreamStatus` from `./adapters/websocket.js` keep working.)

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — all sidecar tests including the new `send()` test. `pnpm --filter a2ui-inspector typecheck` — clean.

- [ ] **Step 6: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): shared adapter types + UpstreamHandle.send for action write-back"
```

---

## Task 3: `SseDecoder` — pure SSE frame parser

**Files:**
- Create: `packages/sidecar/src/adapters/sse.ts` (decoder only this task; adapter added in Task 4)
- Create: `packages/sidecar/src/__tests__/sse.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sidecar/src/__tests__/sse.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SseDecoder } from "../adapters/sse.js";

describe("SseDecoder", () => {
  it("emits the data payload of a complete event", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it("buffers an event split across two chunks", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a"')).toEqual([]);
    expect(d.push(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it("emits multiple events from one chunk", () => {
    const d = new SseDecoder();
    expect(d.push("data: one\n\ndata: two\n\n")).toEqual(["one", "two"]);
  });

  it("joins multi-line data fields with newlines", () => {
    const d = new SseDecoder();
    expect(d.push("data: line1\ndata: line2\n\n")).toEqual(["line1\nline2"]);
  });

  it("ignores comment lines and non-data fields", () => {
    const d = new SseDecoder();
    expect(d.push(": keep-alive\nevent: update\ndata: payload\n\n")).toEqual(["payload"]);
  });

  it("normalizes CRLF line endings", () => {
    const d = new SseDecoder();
    expect(d.push("data: x\r\n\r\n")).toEqual(["x"]);
  });

  it("skips events that have no data field", () => {
    const d = new SseDecoder();
    expect(d.push(": just a comment\n\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `../adapters/sse.js` not found.

- [ ] **Step 3: Implement `packages/sidecar/src/adapters/sse.ts`**

```typescript
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
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — 7 SseDecoder tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add incremental SSE frame decoder"
```

---

## Task 4: SSE upstream adapter

**Files:**
- Modify: `packages/sidecar/src/adapters/sse.ts` (add `connectSseUpstream`)
- Modify: `packages/sidecar/src/__tests__/sse.test.ts` (add adapter tests)

- [ ] **Step 1: Add the failing adapter test**

Append to `packages/sidecar/src/__tests__/sse.test.ts`:

```typescript
import { afterEach, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { SessionStore } from "../session/store.js";
import { connectSseUpstream } from "../adapters/sse.js";

describe("connectSseUpstream", () => {
  let server: Server;
  let port: number;
  let pushEvent: ((data: string) => void) | undefined;

  beforeEach(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      pushEvent = (data: string) => res.write(`data: ${data}\n\n`);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    pushEvent = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("appends each valid A2UI message streamed over SSE", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 50));
    pushEvent!(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(store.length).toBe(1);
    expect(statuses).toContain("connected");
    handle.close();
  });

  it("ignores malformed SSE payloads", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    await new Promise((r) => setTimeout(r, 50));
    pushEvent!("not-json");
    pushEvent!(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "ok" } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(store.length).toBe(1);
    handle.close();
  });

  it("does not expose a send() — SSE is unidirectional", async () => {
    const store = new SessionStore();
    const handle = await connectSseUpstream(`http://127.0.0.1:${port}/`, store, () => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.send).toBeUndefined();
    handle.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `connectSseUpstream` is not exported from `sse.ts`.

- [ ] **Step 3: Add `connectSseUpstream` to `packages/sidecar/src/adapters/sse.ts`**

Add these imports at the top of the file and the function at the bottom (keep the existing `SseDecoder`):

```typescript
import { A2UIMessageSchema } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import type { UpstreamHandle, UpstreamStatus } from "./types.js";

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

  // No `send` — SSE is server→client only.
  return { close: () => controller.abort() };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — 3 new `connectSseUpstream` tests plus the 7 decoder tests. `pnpm --filter a2ui-inspector typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add SSE upstream adapter"
```

---

## Task 5: Experimental WebSocket pass-through proxy

**Files:**
- Create: `packages/sidecar/src/adapters/proxy.ts`
- Create: `packages/sidecar/src/__tests__/proxy.test.ts`

A man-in-the-middle proxy: a renderer connects to the proxy port, the proxy connects to the real agent, frames are piped both ways, and A2UI messages (agent→renderer) and actions (renderer→agent) are copied into the `SessionStore`. Experimental — WS pass-through only.

- [ ] **Step 1: Write the failing test**

`packages/sidecar/src/__tests__/proxy.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { SessionStore } from "../session/store.js";
import { startWebSocketProxy } from "../adapters/proxy.js";

describe("startWebSocketProxy", () => {
  let agent: WebSocketServer;
  let agentPort: number;
  let agentSocket: WebSocket | undefined;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      agent = new WebSocketServer({ port: 0 }, () => {
        const addr = agent.address();
        if (typeof addr === "object" && addr) agentPort = addr.port;
        resolve();
      });
      agent.on("connection", (s) => { agentSocket = s; });
    });
  });

  afterEach(async () => {
    agentSocket = undefined;
    await new Promise<void>((resolve) => agent.close(() => resolve()));
  });

  it("pipes agent messages to the renderer and records them", async () => {
    const store = new SessionStore();
    const proxy = await startWebSocketProxy(0, `ws://127.0.0.1:${agentPort}`, store, () => {});

    const renderer = new WebSocket(`ws://127.0.0.1:${proxy.port}`);
    const fromAgent: string[] = [];
    renderer.on("message", (d) => fromAgent.push(d.toString()));
    await new Promise<void>((r) => renderer.once("open", () => r()));
    await new Promise((r) => setTimeout(r, 20));

    agentSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fromAgent.length).toBe(1);
    expect(store.length).toBe(1);
    expect(store.entries()[0]?.direction).toBe("agent->client");
    renderer.close();
    proxy.close();
  });

  it("pipes renderer actions to the agent and records them", async () => {
    const store = new SessionStore();
    const proxy = await startWebSocketProxy(0, `ws://127.0.0.1:${agentPort}`, store, () => {});

    const renderer = new WebSocket(`ws://127.0.0.1:${proxy.port}`);
    await new Promise<void>((r) => renderer.once("open", () => r()));
    await new Promise((r) => setTimeout(r, 20));

    const fromRenderer: string[] = [];
    agentSocket!.on("message", (d) => fromRenderer.push(d.toString()));
    renderer.send(JSON.stringify({ surfaceId: "main", componentId: "btn", kind: "tap" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(fromRenderer.length).toBe(1);
    expect(store.length).toBe(1);
    expect(store.entries()[0]?.direction).toBe("client->agent");
    renderer.close();
    proxy.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `../adapters/proxy.js` not found.

- [ ] **Step 3: Implement `packages/sidecar/src/adapters/proxy.ts`**

```typescript
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
    agent.on("error", (err) => onStatus({ status: "error", detail: String(err) }));
    agent.on("close", () => renderer.close());
    renderer.on("close", () => agent.close());

    // agent → renderer
    agent.on("message", (data) => {
      const text = data.toString();
      renderer.send(text);
      try {
        const result = A2UIMessageSchema.safeParse(JSON.parse(text));
        if (result.success) store.appendMessage(result.data);
      } catch { /* non-A2UI frame; forwarded but not recorded */ }
    });

    // renderer → agent
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
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — both proxy tests green. `pnpm --filter a2ui-inspector typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add experimental WebSocket pass-through proxy"
```

---

## Task 6: Wire SSE, `startProxy`, `injectAction` into the bridge

**Files:**
- Modify: `packages/sidecar/src/bridge.ts`
- Modify: `packages/sidecar/src/__tests__/bridge.test.ts`

- [ ] **Step 1: Add failing bridge tests**

Append inside the existing `describe("bridge", ...)` block in `packages/sidecar/src/__tests__/bridge.test.ts` (it already has `buildServer`, `store`, `port`, `close` set up in `beforeEach`):

```typescript
  it("injectAction with no upstream emits a diagnostic", async () => {
    const events: Event[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.on("message", (data) => events.push(JSON.parse(data.toString()) as Event));
    client.send(JSON.stringify({
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    }));
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.kind === "diagnostic")).toBe(true);
    expect(store.length).toBe(0);
    client.close();
  });

  it("injectAction with a connected WS upstream forwards the action and records it", async () => {
    // A fake agent the sidecar will connect to as an upstream.
    const agent = new WebSocketServer({ port: 0 });
    const agentPort = (agent.address() as { port: number }).port;
    const received: string[] = [];
    agent.on("connection", (s) => s.on("message", (d) => received.push(d.toString())));

    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify({
      kind: "connectUpstream",
      config: { transport: "websocket", url: `ws://127.0.0.1:${agentPort}` },
    }));
    await new Promise((r) => setTimeout(r, 50));
    client.send(JSON.stringify({
      kind: "injectAction",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" },
    }));
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(store.entries().some((e) => e.action)).toBe(true);
    client.close();
    await new Promise<void>((r) => agent.close(() => r()));
  });
```

Make sure `WebSocketServer` is imported in the test file — add `WebSocketServer` to the existing `import { WebSocket } from "ws";` line so it reads `import { WebSocket, WebSocketServer } from "ws";`.

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `injectAction` is not handled (the command switch has no case; the second test's action is never forwarded).

- [ ] **Step 3: Rewrite `packages/sidecar/src/bridge.ts`**

Replace the whole file with:

```typescript
import { CommandSchema, type Event } from "@a2ui-inspector/shared";
import type { WebSocket } from "ws";
import { connectWebSocketUpstream } from "./adapters/websocket.js";
import { connectSseUpstream } from "./adapters/sse.js";
import { startWebSocketProxy, type RunningProxy } from "./adapters/proxy.js";
import { loadFileIntoStore } from "./adapters/file.js";
import { saveSession } from "./session/persistence.js";
import type { SessionStore } from "./session/store.js";
import type { UpstreamHandle } from "./adapters/types.js";

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
          send({ kind: "diagnostic", level: "error", message: `connectUpstream failed: ${String((err as Error).message)}` });
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
          send({ kind: "diagnostic", level: "error", message: `startProxy failed: ${String((err as Error).message)}` });
        }
        return;
      }
      case "injectAction": {
        if (upstream?.send) {
          upstream.send(cmd.action);
          store.appendAction(cmd.action);
        } else {
          send({ kind: "diagnostic", level: "warn", message: "injectAction: no sendable upstream connected (connect a WebSocket agent first)" });
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
    proxy?.close();
    unsubAppend();
    unsubReplace();
  });
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — all sidecar tests, including the two new `injectAction` bridge tests.

- [ ] **Step 5: Build the sidecar**

Run: `pnpm --filter a2ui-inspector build`
Expected: clean tsc compile.

- [ ] **Step 6: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): wire SSE upstream, startProxy, injectAction into the bridge"
```

---

## Task 7: `ActionInjector` UI component

**Files:**
- Create: `packages/ui/src/components/ActionInjector.tsx`
- Create: `packages/ui/src/__tests__/ActionInjector.test.tsx`

A small form: surface id, component id, action kind, optional JSON payload, and a Fire button that calls an `onInject` callback with a built `A2UIAction`.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/ActionInjector.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionInjector } from "../components/ActionInjector.js";

describe("ActionInjector", () => {
  it("calls onInject with the assembled action", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "btn" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "tap" } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).toHaveBeenCalledWith({ surfaceId: "main", componentId: "btn", kind: "tap" });
  });

  it("includes a parsed JSON payload when provided", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "field" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "textChange" } });
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: '{"text":"hi"}' } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).toHaveBeenCalledWith({
      surfaceId: "main", componentId: "field", kind: "textChange", payload: { text: "hi" },
    });
  });

  it("does not call onInject when surface or component is empty", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).not.toHaveBeenCalled();
  });

  it("shows an error and does not inject when the payload is invalid JSON", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "btn" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "tap" } });
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: "{bad" } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid json/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../components/ActionInjector.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/components/ActionInjector.tsx`**

```tsx
import { useState } from "react";
import type { A2UIAction } from "@a2ui-inspector/shared";

interface ActionInjectorProps {
  onInject: (action: A2UIAction) => void;
}

const KINDS = ["tap", "submit", "textChange", "change", "select"];

export function ActionInjector({ onInject }: ActionInjectorProps) {
  const [surfaceId, setSurfaceId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [kind, setKind] = useState("tap");
  const [payloadText, setPayloadText] = useState("");
  const [error, setError] = useState<string | undefined>();

  const fire = () => {
    setError(undefined);
    if (!surfaceId.trim() || !componentId.trim()) {
      setError("Surface and component are required.");
      return;
    }
    const action: A2UIAction = { surfaceId: surfaceId.trim(), componentId: componentId.trim(), kind };
    if (payloadText.trim()) {
      try {
        action.payload = JSON.parse(payloadText);
      } catch {
        setError("Invalid JSON payload.");
        return;
      }
    }
    onInject(action);
  };

  return (
    <div className="border-t border-neutral-800 p-2 mono text-xs">
      <div className="mb-1 text-neutral-500">Inject action</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          surface
          <input
            aria-label="surface"
            value={surfaceId}
            onChange={(e) => setSurfaceId(e.target.value)}
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <label className="flex items-center gap-1">
          component
          <input
            aria-label="component"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <label className="flex items-center gap-1">
          kind
          <select
            aria-label="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          payload
          <input
            aria-label="payload"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder='{"text":"…"}'
            className="w-40 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <button
          onClick={fire}
          className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        >
          Inject
        </button>
      </div>
      {error && <div className="mt-1 text-red-300">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — 4 ActionInjector tests green. `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add ActionInjector form component"
```

---

## Task 8: Wire ActionInjector + transport-aware connect + proxy into the UI

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/__tests__/` — no new test file; covered by typecheck/build + existing e2e

- [ ] **Step 1: Add an `onProxy` action to the Toolbar**

Replace `packages/ui/src/components/Toolbar.tsx` with:

```tsx
import { FilePlus, Link2, Save, Split } from "lucide-react";

export interface ToolbarProps {
  onConnect: () => void;
  onProxy: () => void;
  onLoadFile: () => void;
  onSave: () => void;
  upstreamStatus: string;
}

export function Toolbar({ onConnect, onProxy, onLoadFile, onSave, upstreamStatus }: ToolbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">A2UI Inspector</span>
        <span className="mono text-xs text-neutral-500">• {upstreamStatus}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onConnect} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <Link2 size={14} /> Connect
        </button>
        <button onClick={onProxy} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <Split size={14} /> Proxy
        </button>
        <button onClick={onLoadFile} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <FilePlus size={14} /> Load file
        </button>
        <button onClick={onSave} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <Save size={14} /> Save
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Wire transport-aware connect, proxy, and the injector into `App.tsx`**

Replace `packages/ui/src/App.tsx` with:

```tsx
import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { MainPaneTabs } from "./components/MainPaneTabs.js";
import { ActionInjector } from "./components/ActionInjector.js";
import { Timeline } from "./panels/Timeline.js";
import { Preview } from "./panels/Preview.js";
import { ComponentTree } from "./panels/ComponentTree.js";
import { Diff } from "./panels/Diff.js";
import { DataModel } from "./panels/DataModel.js";
import { useSessionStore } from "./store/session.js";
import { useMainPaneStore } from "./store/mainPane.js";
import { bridge } from "./transport/bridgeClient.js";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);
  const mainTab = useMainPaneStore((s) => s.tab);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bridge.connect(); }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const path = window.prompt(`Enter the host filesystem path for "${file.name}":`);
      if (path) bridge.send({ kind: "loadFile", path });
    };
    el.addEventListener("dragover", prevent);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div ref={dropRef} className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => {
          const url = window.prompt("Upstream URL — ws:// or wss:// for WebSocket, http:// or https:// for SSE:");
          if (!url) return;
          const transport = /^wss?:\/\//i.test(url) ? "websocket" : "sse";
          bridge.send({ kind: "connectUpstream", config: { transport, url } });
        }}
        onProxy={() => {
          const portStr = window.prompt("Proxy listen port (e.g. 9100):");
          if (!portStr) return;
          const port = Number(portStr);
          if (!Number.isInteger(port) || port <= 0) {
            window.alert("Port must be a positive integer.");
            return;
          }
          const target = window.prompt("Target agent WebSocket URL (ws:// or wss://):");
          if (target) bridge.send({ kind: "startProxy", port, target });
        }}
        onLoadFile={() => {
          const path = window.prompt("Path to .a2ui-session.jsonl on the host:");
          if (path) bridge.send({ kind: "loadFile", path });
        }}
        onSave={() => {
          const path = window.prompt("Save session to:");
          if (path) bridge.send({ kind: "saveSession", path });
        }}
        upstreamStatus={upstreamDetail ? `${upstreamStatus} (${upstreamDetail})` : upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 overflow-y-auto border-r border-neutral-800"><Timeline /></aside>
        <section className="flex flex-1 flex-col overflow-hidden">
          <MainPaneTabs />
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto">
              {mainTab === "preview" && <Preview />}
              {mainTab === "tree" && <ComponentTree />}
              {mainTab === "diff" && <Diff />}
            </div>
            <aside className="w-80 overflow-auto border-l border-neutral-800"><DataModel /></aside>
          </div>
          <ActionInjector onInject={(action) => bridge.send({ kind: "injectAction", action })} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, build, full test, e2e**

```bash
pnpm --filter @a2ui-inspector/ui typecheck
pnpm --filter @a2ui-inspector/ui build
pnpm test
pnpm e2e
```

Expected: typecheck clean, build clean, all unit tests green (Phase 1+2a's 63 plus Phase 2b's new shared/sidecar/ui tests), e2e green.

The e2e (`tests/e2e/happy-path.spec.ts`) is unchanged; it must still pass — the new `ActionInjector` footer and `Proxy` button must not break the timeline/preview flow. If the e2e fails because a selector now matches the injector's inputs, scope the failing assertion more tightly (e.g. via the existing `data-testid="preview-pane"`); do NOT weaken what it verifies.

- [ ] **Step 4: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): transport-aware Connect, Proxy affordance, wire ActionInjector"
```

---

## Phase 2b acceptance checklist

```bash
pnpm install
pnpm build       # topological — shared, sidecar, ui all clean
pnpm typecheck   # clean
pnpm test        # Phase 1+2a (63) + Phase 2b new tests, all green
pnpm e2e         # happy-path green
```

Manual smoke (SSE not covered by the WS mock agent — exercise WS + injection + proxy):

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1 — ws://127.0.0.1:8000
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

In the UI: Connect to `ws://127.0.0.1:8000`, watch the timeline fill; use the Inject action footer (surface `main`, component `root`, kind `tap`) and confirm an `action` row (amber `←`) appears in the timeline. Use Proxy to listen on `9100` targeting `ws://127.0.0.1:8000`, point a separate A2UI renderer at `ws://127.0.0.1:9100`, and confirm frames are recorded.

---

## Deferred to Phase 2c

Command palette (`Cmd/Ctrl+K`), full keyboard-shortcut set, light-mode toggle, device-frame toggle in Preview, Docker image, additional fixtures (malformed, multi-surface, action-roundtrip), capturing actions directly from Preview interaction events, and action write-back over SSE (needs the companion HTTP-POST channel).
