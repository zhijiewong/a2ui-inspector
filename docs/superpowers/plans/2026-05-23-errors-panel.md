# Errors & Diagnostics Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every failure mode of an A2UI session (schema, protocol, transport, render) in one filterable Errors panel with red dots on affected timeline ticks, persisted by the sidecar and re-derived on `#share=` replay.

**Architecture:** New `DiagnosticSchema` in shared; existing minimal `{ kind: "diagnostic", level, message }` event variant is **replaced** with `{ kind: "diagnostic", diagnostic: Diagnostic }`. Sidecar emits diagnostics from its adapters and bridge, persists them to a sibling `.diagnostics.jsonl`, and forwards them. UI replaces the existing `useSessionStore.diagnostics` array with a dedicated `useDiagnosticsStore` (Map keyed by stable id), derives `protocol` diagnostics client-side via a pure walker, catches `render` ones via a `<PreviewErrorBoundary>`, and shows them in an `ErrorsPanel` tab with filter chips + jump-to-tick. Timeline rows render a red dot when `byTick(tick).length > 0`.

**Tech Stack:** TypeScript 5, Zod, React 18, Zustand 4, Tailwind, Vitest + React Testing Library, Playwright, pnpm workspaces.

---

## Background: existing diagnostic plumbing this plan migrates

The codebase already has a minimal `diagnostic` event variant — discovered during planning, not in the original spec. Affected sites that this plan migrates to the richer shape:

- **Shared:** `packages/shared/src/bridge.ts:45-49` defines `{ kind: "diagnostic", level: "warn"|"error", message: string }`.
- **Sidecar (7 emit sites):** `packages/sidecar/src/bridge.ts` lines 42, 47, 63, 74, 83, 89, 94 each call `send({ kind: "diagnostic", level, message })`.
- **UI emit sites (2):** `packages/ui/src/transport/bridgeClient.ts` lines 18 (HTTP fetch fail) and 31 (bad event over bridge).
- **UI consumer:** `packages/ui/src/store/session.ts:35-36` routes `case "diagnostic"` into a `diagnostics: Array<{ level, message, ts }>` field on `useSessionStore`. **This array is removed** in Task 7 — `useDiagnosticsStore` becomes the single home.
- **Test:** `packages/sidecar/src/__tests__/bridge.test.ts:57` asserts `events.some((e) => e.kind === "diagnostic")`.

**Migration shape:** every existing diagnostic — bridge command errors, transport fetch failures, malformed bridge events — gets `category: "transport"` (these are all wire/command-path issues). Schema and protocol diagnostics are new emissions added by this plan.

**Continuous-execution note for the executor:** Task 1 (shared schema) intentionally leaves sidecar + UI typecheck red. Tasks 2–3 resolve the breakage. During Task 1, run shared's tests only; do not attempt repo-wide typecheck until Task 3 is done.

---

## File structure

```
packages/shared/src/
├── bridge.ts                                    MODIFIED — replace diagnostic variant + import DiagnosticSchema
├── diagnostic.ts                                NEW — DiagnosticSchema
├── index.ts                                     MODIFIED — export ./diagnostic.js
└── __tests__/diagnostic.test.ts                 NEW

packages/sidecar/src/
├── bridge.ts                                    MODIFIED — migrate 7 emit sites; replay diagnostics; forward on append
├── session/store.ts                             MODIFIED — appendDiagnostic, diagnostics(), onDiagnosticAppend, onDiagnosticReplace
├── session/persistence.ts                       MODIFIED — saveSessionDiagnostics, loadSessionDiagnostics
├── adapters/websocket.ts                        MODIFIED — emit schema + transport diagnostics
├── adapters/sse.ts                              MODIFIED — emit schema + transport diagnostics
└── __tests__/{bridge,websocket,sse,persistence}.test.ts MODIFIED

packages/ui/src/
├── diagnostics/
│   ├── deriveProtocolDiagnostics.ts             NEW
│   └── __tests__/deriveProtocolDiagnostics.test.ts NEW
├── store/
│   ├── diagnostics.ts                           NEW — useDiagnosticsStore
│   ├── session.ts                               MODIFIED — drop local diagnostics; route diagnostic event to store; clear on session replace
│   └── __tests__/diagnosticsStore.test.ts       NEW
├── transport/
│   └── bridgeClient.ts                          MODIFIED — migrate 2 emit sites
├── components/
│   └── PreviewErrorBoundary.tsx                 NEW
├── panels/
│   ├── ErrorsPanel.tsx                          NEW
│   ├── Timeline.tsx                             MODIFIED — red dot per row with diagnostics
│   └── __tests__/ErrorsPanel.test.tsx           NEW
├── __tests__/
│   ├── PreviewErrorBoundary.test.tsx            NEW
│   ├── Timeline.test.tsx                        MODIFIED — red-dot cases
│   └── sessionLoadEntries.test.ts               MODIFIED — diagnostics cleared
└── App.tsx                                      MODIFIED — derive protocol diagnostics on share boot; mount ErrorsPanel; wrap preview

tests/e2e/errors.spec.ts                         NEW
```

---

## Task 1: Shared — DiagnosticSchema + event variant migration

**Files:**
- Create: `packages/shared/src/diagnostic.ts`
- Create: `packages/shared/src/__tests__/diagnostic.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/bridge.ts:45-49`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/diagnostic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DiagnosticSchema } from "../diagnostic.js";
import { EventSchema } from "../bridge.js";

describe("DiagnosticSchema", () => {
  it("round-trips a full diagnostic", () => {
    const d = {
      ts: 1_700_000_000_000,
      tick: 5,
      category: "schema" as const,
      severity: "error" as const,
      code: "parse-failed",
      message: "Expected string",
      detail: { raw: "bad" },
    };
    expect(DiagnosticSchema.parse(d)).toEqual(d);
  });

  it("accepts a diagnostic with no tick or detail", () => {
    const d = {
      ts: 1,
      category: "transport" as const,
      severity: "warn" as const,
      code: "connect-error",
      message: "ECONNREFUSED",
    };
    expect(DiagnosticSchema.parse(d)).toEqual(d);
  });

  it("rejects unknown category", () => {
    expect(() =>
      DiagnosticSchema.parse({
        ts: 1, category: "weird", severity: "error", code: "x", message: "y",
      }),
    ).toThrow();
  });

  it("rejects unknown severity", () => {
    expect(() =>
      DiagnosticSchema.parse({
        ts: 1, category: "render", severity: "info", code: "x", message: "y",
      }),
    ).toThrow();
  });
});

describe("EventSchema diagnostic variant", () => {
  it("accepts the new diagnostic event shape", () => {
    const e = {
      kind: "diagnostic" as const,
      diagnostic: {
        ts: 1, category: "transport" as const, severity: "warn" as const,
        code: "bridge-bad-event", message: "x",
      },
    };
    expect(EventSchema.parse(e)).toEqual(e);
  });

  it("rejects the old diagnostic event shape", () => {
    expect(() =>
      EventSchema.parse({ kind: "diagnostic", level: "warn", message: "x" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: FAIL — `Cannot find module '../diagnostic.js'` and the "new diagnostic event shape" assertion fails.

- [ ] **Step 3: Create DiagnosticSchema**

Create `packages/shared/src/diagnostic.ts`:

```ts
import { z } from "zod";

export const DiagnosticSchema = z.object({
  tick: z.number().int().nonnegative().optional(),
  ts: z.number().finite().nonnegative(),
  category: z.enum(["schema", "protocol", "transport", "render"]),
  severity: z.enum(["error", "warn"]),
  code: z.string(),
  message: z.string(),
  detail: z.unknown().optional(),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;
```

- [ ] **Step 4: Export from package barrel**

Modify `packages/shared/src/index.ts` to add the export. Replace the file with:

```ts
export * from "./a2ui.js";
export * from "./bridge.js";
export * from "./session.js";
export * from "./diagnostic.js";
```

- [ ] **Step 5: Migrate the diagnostic event variant**

Modify `packages/shared/src/bridge.ts`. Add the import at the top:

```ts
import { DiagnosticSchema } from "./diagnostic.js";
```

Replace lines 45–49 (the current `diagnostic` variant) with:

```ts
  z.object({
    kind: z.literal("diagnostic"),
    diagnostic: DiagnosticSchema,
  }),
```

- [ ] **Step 6: Build shared and run its tests**

Run: `pnpm --filter @a2ui-inspector/shared build && pnpm --filter @a2ui-inspector/shared test`
Expected: PASS — all DiagnosticSchema + EventSchema tests green.

**Note:** Sidecar and UI typecheck/tests are now broken (existing diagnostic emit sites use the old shape). Tasks 2 and 3 resolve this. Do not run repo-wide typecheck yet.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): DiagnosticSchema + replace diagnostic event variant

Adds rich Diagnostic type (category/severity/code/message/detail/tick/ts)
and replaces the minimal { level, message } diagnostic event variant.
Sidecar + UI emit sites migrate in the next two tasks."
```

---

## Task 2: Sidecar — migrate `bridge.ts` diagnostic emit sites

**Files:**
- Modify: `packages/sidecar/src/bridge.ts:42,47,63,74,83,89,94`
- Modify: `packages/sidecar/src/__tests__/bridge.test.ts:57`

- [ ] **Step 1: Update the bridge test for the new shape**

In `packages/sidecar/src/__tests__/bridge.test.ts`, find the line (currently around line 57):

```ts
expect(events.some((e) => e.kind === "diagnostic")).toBe(true);
```

Replace with a stricter assertion:

```ts
const diag = events.find((e) => e.kind === "diagnostic");
expect(diag).toBeDefined();
expect(diag!.diagnostic.category).toBe("transport");
expect(diag!.diagnostic.severity).toBe("warn");
expect(diag!.diagnostic.code).toBe("bad-command");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- bridge.test.ts`
Expected: FAIL — emit site still uses old shape, plus typecheck errors on the 7 `send({ kind: "diagnostic", level, ... })` calls.

- [ ] **Step 3: Migrate emit sites**

In `packages/sidecar/src/bridge.ts`, add a small helper near the top (after the imports, before `registerBridgeClient`):

```ts
function makeDiagnostic(
  severity: "warn" | "error",
  code: string,
  message: string,
): { kind: "diagnostic"; diagnostic: import("@a2ui-inspector/shared").Diagnostic } {
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
```

Then replace each existing `send({ kind: "diagnostic", ... })` call:

| Line (approx) | Old | New |
|---|---|---|
| 42 | `send({ kind: "diagnostic", level: "warn", message: "bridge: malformed JSON command" });` | `send(makeDiagnostic("warn", "bad-command", "bridge: malformed JSON command"));` |
| 47 | `send({ kind: "diagnostic", level: "warn", message: \`bridge: invalid command — ${result.error.message}\` });` | `send(makeDiagnostic("warn", "bad-command", \`bridge: invalid command — ${result.error.message}\`));` |
| 63 | `send({ kind: "diagnostic", level: "error", message: \`connectUpstream failed: ${String((err as Error).message)}\` });` | `send(makeDiagnostic("error", "connect-upstream-failed", \`connectUpstream failed: ${String((err as Error).message)}\`));` |
| 74 | `send({ kind: "diagnostic", level: "error", message: \`startProxy failed: ${String((err as Error).message)}\` });` | `send(makeDiagnostic("error", "start-proxy-failed", \`startProxy failed: ${String((err as Error).message)}\`));` |
| 83 | `send({ kind: "diagnostic", level: "warn", message: "injectAction: no sendable upstream connected (connect a WebSocket agent first)" });` | `send(makeDiagnostic("warn", "inject-no-upstream", "injectAction: no sendable upstream connected (connect a WebSocket agent first)"));` |
| 89 | `send({ kind: "diagnostic", level: "error", message: String((err as Error).message) });` | `send(makeDiagnostic("error", "load-file-failed", String((err as Error).message)));` |
| 94 | `send({ kind: "diagnostic", level: "error", message: String((err as Error).message) });` | `send(makeDiagnostic("error", "save-session-failed", String((err as Error).message)));` |

- [ ] **Step 4: Run sidecar tests**

Run: `pnpm --filter @a2ui-inspector/shared build && pnpm --filter @a2ui-inspector/sidecar test`
Expected: PASS — bridge test green, all other sidecar tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar/src/bridge.ts packages/sidecar/src/__tests__/bridge.test.ts
git commit -m "refactor(sidecar): migrate bridge.ts diagnostic emits to rich Diagnostic shape"
```

---

## Task 3: UI — migrate `transport/bridgeClient.ts` + `store/session.ts` consumer

**Files:**
- Modify: `packages/ui/src/transport/bridgeClient.ts:18,31`
- Modify: `packages/ui/src/store/session.ts:35-36`
- Test: rely on existing UI test suite (no new test file; this is a refactor — Task 7 introduces the dedicated diagnostics-store tests).

- [ ] **Step 1: Update the bridgeClient emit sites**

In `packages/ui/src/transport/bridgeClient.ts`, find the existing `applyEvent({ kind: "diagnostic", level: "error", ... })` call near line 18 (the HTTP fetch failure path):

```ts
useSessionStore.getState().applyEvent({
  kind: "diagnostic", level: "error",
  message: `bridge: HTTP ${res.status}`,
});
```

Replace with:

```ts
useSessionStore.getState().applyEvent({
  kind: "diagnostic",
  diagnostic: {
    ts: Date.now(), category: "transport", severity: "error",
    code: "bridge-http-error", message: `bridge: HTTP ${res.status}`,
  },
});
```

And the line ~31 (bad event over bridge):

```ts
useSessionStore.getState().applyEvent({
  kind: "diagnostic", level: "warn",
  message: `bridge: bad event — ${result.error.message}`,
});
```

becomes:

```ts
useSessionStore.getState().applyEvent({
  kind: "diagnostic",
  diagnostic: {
    ts: Date.now(), category: "transport", severity: "warn",
    code: "bridge-bad-event", message: `bridge: bad event — ${result.error.message}`,
  },
});
```

- [ ] **Step 2: Update the session.ts consumer**

In `packages/ui/src/store/session.ts:35-36`, replace:

```ts
case "diagnostic":
  return { diagnostics: [...s.diagnostics, { level: e.level, message: e.message, ts: Date.now() }] };
```

with:

```ts
case "diagnostic":
  return { diagnostics: [...s.diagnostics, { level: e.diagnostic.severity, message: e.diagnostic.message, ts: e.diagnostic.ts }] };
```

(Task 7 removes the `diagnostics` field entirely once `useDiagnosticsStore` exists. This minimal change keeps the typecheck green right now.)

- [ ] **Step 3: Build and run full repo tests**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: PASS — all packages green.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/transport/bridgeClient.ts packages/ui/src/store/session.ts
git commit -m "refactor(ui): migrate bridge diagnostic emit + consumer to rich shape"
```

---

## Task 4: Sidecar — `SessionStore` diagnostic storage + listeners

**Files:**
- Modify: `packages/sidecar/src/session/store.ts`
- Test: `packages/sidecar/src/__tests__/store.test.ts` (existing — extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/sidecar/src/__tests__/store.test.ts`:

```ts
import type { Diagnostic } from "@a2ui-inspector/shared";

describe("SessionStore diagnostics", () => {
  it("appendDiagnostic stores the diagnostic and notifies listeners", () => {
    const store = new SessionStore();
    const seen: Diagnostic[] = [];
    store.onDiagnosticAppend((d) => seen.push(d));

    const d: Diagnostic = {
      ts: 1, category: "schema", severity: "error",
      code: "parse-failed", message: "bad",
    };
    store.appendDiagnostic(d);

    expect(store.diagnostics()).toEqual([d]);
    expect(seen).toEqual([d]);
  });

  it("clear() empties diagnostics and fires the replace listener with []", () => {
    const store = new SessionStore();
    const replaceCalls: Diagnostic[][] = [];
    store.onDiagnosticReplace((ds) => replaceCalls.push(ds));

    store.appendDiagnostic({
      ts: 1, category: "transport", severity: "warn",
      code: "x", message: "y",
    });
    store.clear();

    expect(store.diagnostics()).toEqual([]);
    expect(replaceCalls.at(-1)).toEqual([]);
  });

  it("replaceDiagnostics swaps the array and fires the replace listener", () => {
    const store = new SessionStore();
    const replaceCalls: Diagnostic[][] = [];
    store.onDiagnosticReplace((ds) => replaceCalls.push(ds));

    const ds: Diagnostic[] = [{
      ts: 2, category: "render", severity: "error",
      code: "preview-threw", message: "boom",
    }];
    store.replaceDiagnostics(ds);

    expect(store.diagnostics()).toEqual(ds);
    expect(replaceCalls.at(-1)).toEqual(ds);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- store.test.ts`
Expected: FAIL — `appendDiagnostic is not a function`.

- [ ] **Step 3: Add diagnostic plumbing to SessionStore**

Replace `packages/sidecar/src/session/store.ts` with:

```ts
import type { A2UIAction, A2UIMessage, Diagnostic, SessionEntry } from "@a2ui-inspector/shared";

type Listener<T> = (value: T) => void;

export class SessionStore {
  private log: SessionEntry[] = [];
  private diagnosticLog: Diagnostic[] = [];

  private appendListeners = new Set<Listener<SessionEntry>>();
  private replaceListeners = new Set<Listener<SessionEntry[]>>();
  private diagnosticAppendListeners = new Set<Listener<Diagnostic>>();
  private diagnosticReplaceListeners = new Set<Listener<Diagnostic[]>>();

  get length(): number {
    return this.log.length;
  }

  /** Returns the live backing array typed as readonly. Do not mutate. */
  entries(): readonly SessionEntry[] {
    return this.log;
  }

  diagnostics(): readonly Diagnostic[] {
    return this.diagnosticLog;
  }

  appendMessage(message: A2UIMessage): SessionEntry {
    const entry: SessionEntry = {
      tick: this.log.length,
      ts: Date.now(),
      direction: "agent->client",
      message,
    };
    this.log.push(entry);
    this.fireAppend(entry);
    return entry;
  }

  appendAction(action: A2UIAction): SessionEntry {
    const entry: SessionEntry = {
      tick: this.log.length,
      ts: Date.now(),
      direction: "client->agent",
      action,
    };
    this.log.push(entry);
    this.fireAppend(entry);
    return entry;
  }

  appendDiagnostic(d: Diagnostic): void {
    this.diagnosticLog.push(d);
    for (const l of this.diagnosticAppendListeners) l(d);
  }

  clear(): void {
    this.replace([]);
    this.replaceDiagnostics([]);
  }

  replace(entries: SessionEntry[]): void {
    this.log = [...entries];
    for (const l of this.replaceListeners) l(this.log);
  }

  replaceDiagnostics(ds: Diagnostic[]): void {
    this.diagnosticLog = [...ds];
    for (const l of this.diagnosticReplaceListeners) l(this.diagnosticLog);
  }

  onAppend(listener: Listener<SessionEntry>): () => void {
    this.appendListeners.add(listener);
    return () => this.appendListeners.delete(listener);
  }

  onReplace(listener: Listener<SessionEntry[]>): () => void {
    this.replaceListeners.add(listener);
    return () => this.replaceListeners.delete(listener);
  }

  onDiagnosticAppend(listener: Listener<Diagnostic>): () => void {
    this.diagnosticAppendListeners.add(listener);
    return () => this.diagnosticAppendListeners.delete(listener);
  }

  onDiagnosticReplace(listener: Listener<Diagnostic[]>): () => void {
    this.diagnosticReplaceListeners.add(listener);
    return () => this.diagnosticReplaceListeners.delete(listener);
  }

  private fireAppend(entry: SessionEntry): void {
    for (const l of this.appendListeners) l(entry);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @a2ui-inspector/sidecar test`
Expected: PASS — all sidecar tests including the new diagnostic ones.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar/src/session/store.ts packages/sidecar/src/__tests__/store.test.ts
git commit -m "feat(sidecar): SessionStore diagnostic storage + append/replace listeners"
```

---

## Task 5: Sidecar — bridge forwards diagnostics on append + replays them on connect

**Files:**
- Modify: `packages/sidecar/src/bridge.ts`
- Test: `packages/sidecar/src/__tests__/bridge.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append a new test case in `packages/sidecar/src/__tests__/bridge.test.ts` inside the existing `describe` (use the same fixtures and `events` array pattern as the existing tests):

```ts
it("replays existing diagnostics to a new client on connect", async () => {
  const store = new SessionStore();
  store.appendDiagnostic({
    ts: 5, category: "schema", severity: "error",
    code: "parse-failed", message: "bad",
  });
  const { events } = await connectClient(store); // existing helper
  const diag = events.find((e) => e.kind === "diagnostic");
  expect(diag).toBeDefined();
  expect(diag!.diagnostic.code).toBe("parse-failed");
});

it("forwards newly-appended diagnostics live", async () => {
  const store = new SessionStore();
  const { events, waitForCount } = await connectClient(store); // existing helper
  store.appendDiagnostic({
    ts: 6, category: "render", severity: "error",
    code: "preview-threw", message: "boom",
  });
  await waitForCount("diagnostic", 1);
  const diag = events.find((e) => e.kind === "diagnostic" && e.diagnostic.code === "preview-threw");
  expect(diag).toBeDefined();
});
```

If `connectClient` / `waitForCount` helpers don't exist in this file with these exact names, mirror whatever the existing tests use to spin up a bridge client and collect events; the contract under test is "events array eventually contains a `diagnostic` event with that diagnostic".

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- bridge.test.ts`
Expected: FAIL — bridge doesn't replay or forward diagnostics yet.

- [ ] **Step 3: Add replay + forward to `registerBridgeClient`**

In `packages/sidecar/src/bridge.ts`, inside `registerBridgeClient`, locate the existing "Replay full session to a new client on connect" block (around line 18) and add immediately after it:

```ts
// Replay diagnostics to the new client.
for (const d of store.diagnostics()) {
  send({ kind: "diagnostic", diagnostic: d });
}
```

Then locate the existing `const unsubAppend = store.onAppend(...)` and `const unsubReplace = store.onReplace(...)` block (around lines 26–37) and add immediately after:

```ts
const unsubDiagAppend = store.onDiagnosticAppend((d) => {
  send({ kind: "diagnostic", diagnostic: d });
});

const unsubDiagReplace = store.onDiagnosticReplace((ds) => {
  // No dedicated "diagnostics cleared" event — clients re-derive on sessionLoaded.
  // Re-emit each remaining diagnostic so a connecting client during clear stays consistent.
  for (const d of ds) send({ kind: "diagnostic", diagnostic: d });
});
```

Finally, in the `socket.on("close", ...)` handler at the bottom of the function (around line 105), add the two new unsubscribes:

```ts
socket.on("close", () => {
  upstream?.close();
  proxy?.close();
  unsubAppend();
  unsubReplace();
  unsubDiagAppend();
  unsubDiagReplace();
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @a2ui-inspector/sidecar test`
Expected: PASS — new replay/forward tests green, all others still green.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar/src/bridge.ts packages/sidecar/src/__tests__/bridge.test.ts
git commit -m "feat(sidecar): bridge replays + forwards diagnostics"
```

---

## Task 6: Sidecar — adapters emit `schema` + `transport` diagnostics

**Files:**
- Modify: `packages/sidecar/src/adapters/websocket.ts`
- Modify: `packages/sidecar/src/adapters/sse.ts`
- Test: `packages/sidecar/src/__tests__/websocket.test.ts` (extend)
- Test: `packages/sidecar/src/__tests__/sse.test.ts` (extend)

- [ ] **Step 1: Write the failing test (websocket)**

In `packages/sidecar/src/__tests__/websocket.test.ts`, add inside the existing `describe`:

```ts
it("appends a schema diagnostic when an inbound message fails parsing", async () => {
  const store = new SessionStore();
  const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, () => {});
  const clientSocket = await nextSocket;
  clientSocket.send(JSON.stringify({ not: "a-valid-a2ui-message" }));
  await vi.waitFor(() => {
    expect(store.diagnostics().length).toBeGreaterThan(0);
  });
  const d = store.diagnostics().find((x) => x.category === "schema");
  expect(d).toBeDefined();
  expect(d!.code).toBe("parse-failed");
  handle.close();
});

it("mirrors upstream status changes as transport diagnostics", async () => {
  const store = new SessionStore();
  const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, () => {});
  await vi.waitFor(() => {
    expect(store.diagnostics().some((d) =>
      d.category === "transport" && d.code === "connected"
    )).toBe(true);
  });
  handle.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- websocket.test.ts`
Expected: FAIL — `store.diagnostics()` returns empty.

- [ ] **Step 3: Emit diagnostics from `websocket.ts`**

Replace `packages/sidecar/src/adapters/websocket.ts` with:

```ts
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
  const emitStatus = (s: UpstreamStatus): void => {
    onStatus(s);
    store.appendDiagnostic({
      ts: Date.now(),
      category: "transport",
      severity: s.status === "error" ? "error" : "warn",
      code: s.status,
      message: s.detail ? `${s.status}: ${s.detail}` : s.status,
    });
  };

  emitStatus({ status: "connecting" });
  const ws = new WebSocket(url);

  ws.on("open", () => emitStatus({ status: "connected" }));
  ws.on("close", () => emitStatus({ status: "closed" }));
  ws.on("error", (err) => emitStatus({ status: "error", detail: String(err) }));

  ws.on("message", (data) => {
    const raw = data.toString();
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch (err) {
      store.appendDiagnostic({
        ts: Date.now(),
        category: "schema",
        severity: "error",
        code: "parse-failed",
        message: `JSON parse failed: ${(err as Error).message}`,
        detail: { raw: raw.slice(0, 1024) },
      });
      return;
    }
    const result = A2UIMessageSchema.safeParse(parsed);
    if (result.success) {
      store.appendMessage(result.data);
    } else {
      store.appendDiagnostic({
        ts: Date.now(),
        category: "schema",
        severity: "error",
        code: "parse-failed",
        message: result.error.issues[0]?.message ?? "schema validation failed",
        detail: { raw: raw.slice(0, 1024) },
      });
    }
  });

  return {
    close: () => ws.close(),
    send: (action: A2UIAction) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(action));
    },
  };
}
```

- [ ] **Step 4: Run websocket tests**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- websocket.test.ts`
Expected: PASS — all websocket tests including the two new ones.

- [ ] **Step 5: Write the failing test (SSE)**

In `packages/sidecar/src/__tests__/sse.test.ts`, add inside the existing `describe` (mirror the websocket cases against whichever fixture pattern that file already uses):

```ts
it("appends a schema diagnostic when an inbound SSE event fails parsing", async () => {
  // Use the existing SSE test scaffolding to push a malformed payload through the decoder.
  // Replace `pushSseEvent` and `createSseConnection` with whatever helpers this file uses today.
  const store = new SessionStore();
  const handle = await createSseConnection(store);
  await pushSseEvent(`data: {"not":"valid"}\n\n`);
  await vi.waitFor(() => {
    expect(store.diagnostics().some((d) => d.category === "schema" && d.code === "parse-failed")).toBe(true);
  });
  handle.close();
});

it("mirrors upstream status changes as transport diagnostics on SSE", async () => {
  const store = new SessionStore();
  const handle = await createSseConnection(store);
  await vi.waitFor(() => {
    expect(store.diagnostics().some((d) => d.category === "transport" && d.code === "connected")).toBe(true);
  });
  handle.close();
});
```

(If the existing test file uses different helper names, keep its style — the contract is "feed a bad payload, observe a schema diagnostic in the store; observe a transport diagnostic for connect".)

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- sse.test.ts`
Expected: FAIL — no diagnostics emitted.

- [ ] **Step 7: Emit diagnostics from `sse.ts`**

Edit `packages/sidecar/src/adapters/sse.ts`. Replace the inner contents of `connectSseUpstream` so the body becomes:

```ts
export async function connectSseUpstream(
  url: string,
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void
): Promise<UpstreamHandle> {
  const emitStatus = (s: UpstreamStatus): void => {
    onStatus(s);
    store.appendDiagnostic({
      ts: Date.now(),
      category: "transport",
      severity: s.status === "error" ? "error" : "warn",
      code: s.status,
      message: s.detail ? `${s.status}: ${s.detail}` : s.status,
    });
  };

  emitStatus({ status: "connecting" });
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        emitStatus({ status: "error", detail: `HTTP ${res.status}` });
        return;
      }
      emitStatus({ status: "connected" });
      const decoder = new SseDecoder();
      const reader = res.body.getReader();
      const text = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const payload of decoder.push(text.decode(value, { stream: true }))) {
          let parsed: unknown;
          try { parsed = JSON.parse(payload); }
          catch (err) {
            store.appendDiagnostic({
              ts: Date.now(),
              category: "schema",
              severity: "error",
              code: "parse-failed",
              message: `JSON parse failed: ${(err as Error).message}`,
              detail: { raw: payload.slice(0, 1024) },
            });
            continue;
          }
          const result = A2UIMessageSchema.safeParse(parsed);
          if (result.success) {
            store.appendMessage(result.data);
          } else {
            store.appendDiagnostic({
              ts: Date.now(),
              category: "schema",
              severity: "error",
              code: "parse-failed",
              message: result.error.issues[0]?.message ?? "schema validation failed",
              detail: { raw: payload.slice(0, 1024) },
            });
          }
        }
      }
      emitStatus({ status: "closed" });
    } catch (err) {
      if (controller.signal.aborted) emitStatus({ status: "closed" });
      else emitStatus({ status: "error", detail: String(err) });
    }
  })();

  return { close: () => controller.abort() };
}
```

- [ ] **Step 8: Run all sidecar tests**

Run: `pnpm --filter @a2ui-inspector/sidecar test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/sidecar/src/adapters/ packages/sidecar/src/__tests__/websocket.test.ts packages/sidecar/src/__tests__/sse.test.ts
git commit -m "feat(sidecar): adapters emit schema + transport diagnostics"
```

---

## Task 7: Sidecar — persist `.a2ui-session.diagnostics.jsonl`

**Files:**
- Modify: `packages/sidecar/src/session/persistence.ts`
- Modify: `packages/sidecar/src/bridge.ts` (wire load/save in command handlers)
- Test: `packages/sidecar/src/__tests__/persistence.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/sidecar/src/__tests__/persistence.test.ts`:

```ts
import { saveSessionDiagnostics, loadSessionDiagnostics, diagnosticsPathFor } from "../session/persistence.js";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("persistence: diagnostics sibling file", () => {
  it("diagnosticsPathFor swaps .jsonl for .diagnostics.jsonl", () => {
    expect(diagnosticsPathFor("/tmp/foo.jsonl")).toBe("/tmp/foo.diagnostics.jsonl");
    expect(diagnosticsPathFor("/tmp/foo")).toBe("/tmp/foo.diagnostics.jsonl");
  });

  it("save then load round-trips diagnostics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diag-"));
    try {
      const file = join(dir, "s.jsonl");
      const ds = [
        { ts: 1, category: "schema" as const, severity: "error" as const, code: "x", message: "y" },
        { ts: 2, category: "render" as const, severity: "warn" as const, code: "a", message: "b", tick: 3 },
      ];
      await saveSessionDiagnostics(file, ds);
      const round = await loadSessionDiagnostics(file);
      expect(round).toEqual(ds);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadSessionDiagnostics returns [] when the sibling file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "diag-"));
    try {
      const file = join(dir, "no-diags.jsonl");
      writeFileSync(file, "");
      const round = await loadSessionDiagnostics(file);
      expect(round).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/sidecar test -- persistence.test.ts`
Expected: FAIL — `saveSessionDiagnostics is not a function`.

- [ ] **Step 3: Add persistence functions**

Replace `packages/sidecar/src/session/persistence.ts` with:

```ts
import { readFile, writeFile } from "node:fs/promises";
import {
  DiagnosticSchema,
  SessionEntrySchema,
  type Diagnostic,
  type SessionEntry,
} from "@a2ui-inspector/shared";

export async function saveSession(path: string, entries: SessionEntry[]): Promise<void> {
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(path, body, "utf8");
}

export async function loadSession(path: string): Promise<SessionEntry[]> {
  const text = await readFile(path, "utf8");
  const out: SessionEntry[] = [];
  let lineNo = 0;
  for (const raw of text.split("\n")) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`${path}:${lineNo}: malformed JSON — ${(err as Error).message}`);
    }
    out.push(SessionEntrySchema.parse(parsed));
  }
  return out;
}

/** Sibling-file path: foo.jsonl → foo.diagnostics.jsonl (and foo → foo.diagnostics.jsonl). */
export function diagnosticsPathFor(sessionPath: string): string {
  if (sessionPath.endsWith(".jsonl")) {
    return sessionPath.slice(0, -".jsonl".length) + ".diagnostics.jsonl";
  }
  return sessionPath + ".diagnostics.jsonl";
}

export async function saveSessionDiagnostics(sessionPath: string, diagnostics: Diagnostic[]): Promise<void> {
  const body = diagnostics.map((d) => JSON.stringify(d)).join("\n") + (diagnostics.length ? "\n" : "");
  await writeFile(diagnosticsPathFor(sessionPath), body, "utf8");
}

export async function loadSessionDiagnostics(sessionPath: string): Promise<Diagnostic[]> {
  let text: string;
  try {
    text = await readFile(diagnosticsPathFor(sessionPath), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Diagnostic[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = JSON.parse(line);
    out.push(DiagnosticSchema.parse(parsed));
  }
  return out;
}
```

- [ ] **Step 4: Wire load/save into the bridge command handlers**

In `packages/sidecar/src/bridge.ts`, add `loadSessionDiagnostics, saveSessionDiagnostics, loadSession` to the existing persistence import:

```ts
import { loadSession, loadSessionDiagnostics, saveSession, saveSessionDiagnostics } from "./session/persistence.js";
```

In the `saveSession` command case (around line 92), replace:

```ts
case "saveSession": {
  try { await saveSession(cmd.path, [...store.entries()]); }
  catch (err) { send(makeDiagnostic("error", "save-session-failed", String((err as Error).message))); }
  return;
}
```

with:

```ts
case "saveSession": {
  try {
    await saveSession(cmd.path, [...store.entries()]);
    await saveSessionDiagnostics(cmd.path, [...store.diagnostics()]);
  }
  catch (err) { send(makeDiagnostic("error", "save-session-failed", String((err as Error).message))); }
  return;
}
```

The `loadFile` case delegates to `loadFileIntoStore` in `adapters/file.ts`. Open `packages/sidecar/src/adapters/file.ts` and locate the existing function (it currently reads + replaces entries). Update it to also load diagnostics:

```ts
import { loadSession, loadSessionDiagnostics } from "../session/persistence.js";
import type { SessionStore } from "../session/store.js";

export async function loadFileIntoStore(path: string, store: SessionStore): Promise<void> {
  const entries = await loadSession(path);
  const diagnostics = await loadSessionDiagnostics(path);
  store.replace(entries);
  store.replaceDiagnostics(diagnostics);
}
```

(Adjust to match the file's existing structure if it differs — the contract is "loading a session also loads its sibling diagnostics".)

- [ ] **Step 5: Run all sidecar tests**

Run: `pnpm --filter @a2ui-inspector/sidecar test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sidecar/src/session/persistence.ts packages/sidecar/src/bridge.ts packages/sidecar/src/adapters/file.ts packages/sidecar/src/__tests__/persistence.test.ts
git commit -m "feat(sidecar): persist diagnostics to sibling .diagnostics.jsonl"
```

---

## Task 8: UI — `useDiagnosticsStore` + replace `useSessionStore.diagnostics`

**Files:**
- Create: `packages/ui/src/store/diagnostics.ts`
- Create: `packages/ui/src/store/__tests__/diagnosticsStore.test.ts`
- Modify: `packages/ui/src/store/session.ts` (drop `diagnostics` field; route diagnostic events into new store; add `useDiagnosticsStore.getState().clear()` in the same three lifecycle sites as bookmarks)
- Modify: `packages/ui/src/__tests__/sessionLoadEntries.test.ts` (extend)

- [ ] **Step 1: Write the failing test for the store**

Create `packages/ui/src/store/__tests__/diagnosticsStore.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useDiagnosticsStore } from "../diagnostics.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const make = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  ts: 1, category: "schema", severity: "error",
  code: "parse-failed", message: "bad", ...over,
});

describe("useDiagnosticsStore", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("starts empty", () => {
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("add() inserts and groups by tick", () => {
    useDiagnosticsStore.getState().add(make({ tick: 3 }));
    useDiagnosticsStore.getState().add(make({ tick: 3, code: "dangling-ref" }));
    useDiagnosticsStore.getState().add(make({ tick: 5, code: "x" }));

    const state = useDiagnosticsStore.getState();
    expect(state.diagnostics.size).toBe(3);
    expect(state.byTick.get(3)?.length).toBe(2);
    expect(state.byTick.get(5)?.length).toBe(1);
  });

  it("addMany() bulk inserts", () => {
    useDiagnosticsStore.getState().addMany([make({ tick: 1 }), make({ tick: 2 })]);
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(2);
  });

  it("clear() empties both maps", () => {
    useDiagnosticsStore.getState().add(make({ tick: 1 }));
    useDiagnosticsStore.getState().clear();
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("diagnostics with no tick are stored but not in byTick", () => {
    useDiagnosticsStore.getState().add(make({ code: "connecting" }));
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(1);
    expect(useDiagnosticsStore.getState().byTick.size).toBe(0);
  });

  it("each add bumps map identity (Zustand selector contract)", () => {
    const before = useDiagnosticsStore.getState().diagnostics;
    useDiagnosticsStore.getState().add(make({ tick: 1 }));
    const after = useDiagnosticsStore.getState().diagnostics;
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test -- diagnosticsStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the store**

Create `packages/ui/src/store/diagnostics.ts`:

```ts
import { create } from "zustand";
import type { Diagnostic } from "@a2ui-inspector/shared";

interface DiagnosticsState {
  diagnostics: Map<string, Diagnostic>;   // id → Diagnostic
  byTick: Map<number, Diagnostic[]>;      // derived
  add: (d: Diagnostic) => void;
  addMany: (ds: Diagnostic[]) => void;
  clear: () => void;
}

let nextSerial = 0;
function makeId(d: Diagnostic): string {
  return `${d.ts}-${d.category}-${d.code}-${d.tick ?? "-"}-${nextSerial++}`;
}

function rebuildByTick(map: Map<string, Diagnostic>): Map<number, Diagnostic[]> {
  const out = new Map<number, Diagnostic[]>();
  for (const d of map.values()) {
    if (d.tick === undefined) continue;
    const arr = out.get(d.tick);
    if (arr) arr.push(d); else out.set(d.tick, [d]);
  }
  return out;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  diagnostics: new Map(),
  byTick: new Map(),
  add: (d) => {
    const next = new Map(get().diagnostics);
    next.set(makeId(d), d);
    set({ diagnostics: next, byTick: rebuildByTick(next) });
  },
  addMany: (ds) => {
    const next = new Map(get().diagnostics);
    for (const d of ds) next.set(makeId(d), d);
    set({ diagnostics: next, byTick: rebuildByTick(next) });
  },
  clear: () => set({ diagnostics: new Map(), byTick: new Map() }),
}));
```

- [ ] **Step 4: Run store tests**

Run: `pnpm --filter @a2ui-inspector/ui test -- diagnosticsStore`
Expected: PASS.

- [ ] **Step 5: Update `useSessionStore` to drop `diagnostics` field and route to new store**

Replace `packages/ui/src/store/session.ts` with:

```ts
import { create } from "zustand";
import type { Event, SessionEntry } from "@a2ui-inspector/shared";
import { useBookmarksStore } from "./bookmarks.js";
import { useDiagnosticsStore } from "./diagnostics.js";

interface SessionState {
  entries: SessionEntry[];
  upstreamStatus: "idle" | "connecting" | "connected" | "closed" | "error";
  upstreamDetail?: string;
  applyEvent: (e: Event) => void;
  loadEntries: (entries: SessionEntry[]) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  entries: [],
  upstreamStatus: "idle",
  applyEvent: (e) =>
    set((s) => {
      switch (e.kind) {
        case "messageReceived":
          return {
            entries: [...s.entries, { tick: e.tick, ts: e.ts, direction: "agent->client", message: e.message }],
          };
        case "actionSent":
          return {
            entries: [...s.entries, { tick: e.tick, ts: e.ts, direction: "client->agent", action: e.action }],
          };
        case "upstreamStatus":
          return { upstreamStatus: e.status, upstreamDetail: e.detail };
        case "sessionLoaded":
          useBookmarksStore.getState().clear();
          useDiagnosticsStore.getState().clear();
          return { entries: [] };
        case "diagnostic":
          useDiagnosticsStore.getState().add(e.diagnostic);
          return {};
      }
    }),
  loadEntries: (entries) => {
    useBookmarksStore.getState().clear();
    useDiagnosticsStore.getState().clear();
    set({ entries });
  },
  reset: () => {
    useBookmarksStore.getState().clear();
    useDiagnosticsStore.getState().clear();
    set({ entries: [], upstreamStatus: "idle", upstreamDetail: undefined });
  },
}));
```

- [ ] **Step 6: Extend `sessionLoadEntries.test.ts` to assert diagnostics cleared**

In `packages/ui/src/__tests__/sessionLoadEntries.test.ts`, the existing tests already check that `useBookmarksStore` is cleared on `reset`, `loadEntries`, and `sessionLoaded`. Mirror the same three assertions for `useDiagnosticsStore`. Pattern for each existing test:

```ts
// seed a diagnostic before the lifecycle event
useDiagnosticsStore.getState().add({
  ts: 1, category: "schema", severity: "error",
  code: "parse-failed", message: "bad",
});
// ... existing trigger (reset / loadEntries / applyEvent sessionLoaded) ...
expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
```

Import: add `import { useDiagnosticsStore } from "../store/diagnostics.js";` at the top.

- [ ] **Step 7: Search for any other `useSessionStore.*.diagnostics` consumers and remove**

Run: `grep -rn 'diagnostics' packages/ui/src --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v store/diagnostics.ts | grep -v store/session.ts`

If anything else reads `useSessionStore(...).diagnostics`, update it to `useDiagnosticsStore(s => Array.from(s.diagnostics.values()))` or similar. (At plan time the grep is expected to return nothing UI-side beyond the two files above, but the executor must verify.)

- [ ] **Step 8: Run full UI tests**

Run: `pnpm build && pnpm --filter @a2ui-inspector/ui test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/store/ packages/ui/src/__tests__/sessionLoadEntries.test.ts
git commit -m "feat(ui): useDiagnosticsStore replaces useSessionStore.diagnostics array"
```

---

## Task 9: UI — `deriveProtocolDiagnostics` pure walker

**Files:**
- Create: `packages/ui/src/diagnostics/deriveProtocolDiagnostics.ts`
- Create: `packages/ui/src/diagnostics/__tests__/deriveProtocolDiagnostics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/diagnostics/__tests__/deriveProtocolDiagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveProtocolDiagnostics } from "../deriveProtocolDiagnostics.js";
import type { SessionEntry } from "@a2ui-inspector/shared";

const msg = (tick: number, message: Partial<SessionEntry["message"]> | object): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", ...(message as object) } as SessionEntry["message"],
});

describe("deriveProtocolDiagnostics", () => {
  it("returns [] for empty input", () => {
    expect(deriveProtocolDiagnostics([])).toEqual([]);
  });

  it("emits unknown-surface when updateComponents targets a surface never created", () => {
    const entries: SessionEntry[] = [
      msg(0, { updateComponents: { surfaceId: "ghost", components: [] } }),
    ];
    const out = deriveProtocolDiagnostics(entries);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe("unknown-surface");
    expect(out[0]!.category).toBe("protocol");
    expect(out[0]!.tick).toBe(0);
  });

  it("does NOT emit unknown-surface when updateComponents targets a created surface", () => {
    const entries: SessionEntry[] = [
      msg(0, { createSurface: { surfaceId: "main" } }),
      msg(1, { updateComponents: { surfaceId: "main", components: [] } }),
    ];
    expect(deriveProtocolDiagnostics(entries)).toEqual([]);
  });

  it("emits version-mismatch for a non-v0.9 version field", () => {
    const entries: SessionEntry[] = [
      { tick: 0, ts: 0, direction: "agent->client",
        message: { version: "v1.0" } as SessionEntry["message"] },
    ];
    const out = deriveProtocolDiagnostics(entries);
    expect(out.some((d) => d.code === "version-mismatch")).toBe(true);
  });

  it("does not emit version-mismatch for v0.9", () => {
    const entries: SessionEntry[] = [msg(0, {})];
    expect(deriveProtocolDiagnostics(entries).some((d) => d.code === "version-mismatch")).toBe(false);
  });

  it("survives a malformed entry by emitting a single derive-crashed diagnostic", () => {
    // @ts-expect-error — deliberately bad entry shape to exercise try/catch
    const entries: SessionEntry[] = [{ tick: 0, ts: 0, direction: "agent->client", message: null }];
    const out = deriveProtocolDiagnostics(entries);
    expect(out.some((d) => d.code === "derive-crashed")).toBe(true);
  });
});
```

(`dangling-ref` detection is intentionally not exercised in the tests here because the A2UI message shapes vary; the executor adds a minimal check for it if the shared schemas expose a `componentRef` field, but keep the walker forgiving — emit only when a reference clearly resolves to nothing at end-of-stream.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test -- deriveProtocolDiagnostics`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the walker**

Create `packages/ui/src/diagnostics/deriveProtocolDiagnostics.ts`:

```ts
import type { Diagnostic, SessionEntry } from "@a2ui-inspector/shared";

const EXPECTED_VERSION = "v0.9";

/**
 * Pure function. Walks the entries and emits protocol-level diagnostics:
 *   - unknown-surface: updateComponents for a surface never createSurface'd
 *   - version-mismatch: any entry whose message.version !== "v0.9"
 *   - derive-crashed: meta — single diagnostic if the walk itself throws
 *
 * Out-of-order create/update is allowed: only diagnostics that are still
 * unresolved at end-of-stream are emitted.
 */
export function deriveProtocolDiagnostics(entries: SessionEntry[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  try {
    const createdSurfaces = new Set<string>();
    interface PendingSurfaceUse { tick: number; surfaceId: string }
    const pendingSurfaceUses: PendingSurfaceUse[] = [];

    for (const entry of entries) {
      if (!entry.message || typeof entry.message !== "object") continue;
      const m = entry.message as Record<string, unknown>;

      if (typeof m.version === "string" && m.version !== EXPECTED_VERSION) {
        out.push({
          ts: entry.ts,
          tick: entry.tick,
          category: "protocol",
          severity: "warn",
          code: "version-mismatch",
          message: `protocol version "${m.version}" (expected "${EXPECTED_VERSION}")`,
        });
      }

      const create = m.createSurface as { surfaceId?: unknown } | undefined;
      if (create && typeof create.surfaceId === "string") {
        createdSurfaces.add(create.surfaceId);
      }

      const update = m.updateComponents as { surfaceId?: unknown } | undefined;
      if (update && typeof update.surfaceId === "string") {
        pendingSurfaceUses.push({ tick: entry.tick, surfaceId: update.surfaceId });
      }
    }

    for (const use of pendingSurfaceUses) {
      if (!createdSurfaces.has(use.surfaceId)) {
        out.push({
          ts: 0,
          tick: use.tick,
          category: "protocol",
          severity: "error",
          code: "unknown-surface",
          message: `updateComponents references surface "${use.surfaceId}" which was never created`,
        });
      }
    }

    return out;
  } catch (err) {
    return [{
      ts: Date.now(),
      category: "protocol",
      severity: "error",
      code: "derive-crashed",
      message: `protocol-diagnostic walker crashed: ${(err as Error).message}`,
    }];
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm build && pnpm --filter @a2ui-inspector/ui test -- deriveProtocolDiagnostics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/diagnostics/
git commit -m "feat(ui): deriveProtocolDiagnostics pure walker"
```

---

## Task 10: UI — `<PreviewErrorBoundary>`

**Files:**
- Create: `packages/ui/src/components/PreviewErrorBoundary.tsx`
- Create: `packages/ui/src/__tests__/PreviewErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/PreviewErrorBoundary.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewErrorBoundary } from "../components/PreviewErrorBoundary.js";
import { useDiagnosticsStore } from "../store/diagnostics.js";

function Boom(): never { throw new Error("boom"); }

describe("PreviewErrorBoundary", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("renders children when nothing throws", () => {
    render(
      <PreviewErrorBoundary><div>ok</div></PreviewErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
  });

  it("catches a throw, shows fallback, adds a render diagnostic", () => {
    // Silence React's noisy error-boundary log for this test only.
    const original = console.error;
    console.error = () => {};
    try {
      render(
        <PreviewErrorBoundary><Boom /></PreviewErrorBoundary>
      );
      expect(screen.getByText(/Preview crashed/i)).toBeInTheDocument();
      const ds = Array.from(useDiagnosticsStore.getState().diagnostics.values());
      expect(ds).toHaveLength(1);
      expect(ds[0]!.category).toBe("render");
      expect(ds[0]!.code).toBe("preview-threw");
      expect(ds[0]!.message).toContain("boom");
    } finally {
      console.error = original;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test -- PreviewErrorBoundary`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the boundary**

Create `packages/ui/src/components/PreviewErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useDiagnosticsStore } from "../store/diagnostics.js";

interface Props { children: ReactNode }
interface State { error: Error | undefined }

export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    useDiagnosticsStore.getState().add({
      ts: Date.now(),
      category: "render",
      severity: "error",
      code: "preview-threw",
      message: error.message,
      detail: { stack: error.stack },
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="rounded border border-edge bg-surface p-3 text-sm text-ink-muted">
          Preview crashed — see Errors panel.
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @a2ui-inspector/ui test -- PreviewErrorBoundary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/PreviewErrorBoundary.tsx packages/ui/src/__tests__/PreviewErrorBoundary.test.tsx
git commit -m "feat(ui): PreviewErrorBoundary captures render diagnostics"
```

---

## Task 11: UI — `ErrorsPanel` with filter chips + jump-to-tick

**Files:**
- Create: `packages/ui/src/panels/ErrorsPanel.tsx`
- Create: `packages/ui/src/panels/__tests__/ErrorsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/panels/__tests__/ErrorsPanel.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorsPanel } from "../ErrorsPanel.js";
import { useDiagnosticsStore } from "../../store/diagnostics.js";
import { useFocusStore } from "../../store/filterFocus.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const make = (over: Partial<Diagnostic>): Diagnostic => ({
  ts: 1, category: "schema", severity: "error",
  code: "parse-failed", message: "bad", ...over,
});

describe("ErrorsPanel", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("shows empty state when no diagnostics", () => {
    render(<ErrorsPanel />);
    expect(screen.getByText(/No errors in this session/i)).toBeInTheDocument();
  });

  it("renders one row per diagnostic with code + message", () => {
    useDiagnosticsStore.getState().addMany([
      make({ tick: 1, code: "parse-failed", message: "first" }),
      make({ tick: 2, category: "render", code: "preview-threw", message: "second" }),
    ]);
    render(<ErrorsPanel />);
    expect(screen.getByText("parse-failed")).toBeInTheDocument();
    expect(screen.getByText("preview-threw")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("toggling a category chip hides matching rows", () => {
    useDiagnosticsStore.getState().addMany([
      make({ tick: 1, code: "parse-failed" }),
      make({ tick: 2, category: "render", code: "preview-threw" }),
    ]);
    render(<ErrorsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /schema/i }));
    expect(screen.queryByText("parse-failed")).not.toBeInTheDocument();
    expect(screen.getByText("preview-threw")).toBeInTheDocument();
  });

  it("clicking a row sets focus to that tick", () => {
    useDiagnosticsStore.getState().add(make({ tick: 7 }));
    render(<ErrorsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /tick #7/i }));
    expect(useFocusStore.getState().tick).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test -- ErrorsPanel`
Expected: FAIL — module not found. (If `useFocusStore` lives at a different path, adjust the import accordingly — verify by running `grep -rn 'useFocusStore' packages/ui/src/store/` before continuing.)

- [ ] **Step 3: Create the panel**

Create `packages/ui/src/panels/ErrorsPanel.tsx`:

```tsx
import { useState } from "react";
import { useDiagnosticsStore } from "../store/diagnostics.js";
import { useFocusStore } from "../store/filterFocus.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const ALL_CATEGORIES: Array<Diagnostic["category"]> = ["schema", "protocol", "transport", "render"];
const ALL_SEVERITIES: Array<Diagnostic["severity"]> = ["error", "warn"];

export function ErrorsPanel(): JSX.Element {
  const diagnostics = useDiagnosticsStore((s) => s.diagnostics);
  const [categoryFilter, setCategoryFilter] = useState<Set<Diagnostic["category"]>>(
    new Set(ALL_CATEGORIES),
  );
  const [severityFilter, setSeverityFilter] = useState<Set<Diagnostic["severity"]>>(
    new Set(ALL_SEVERITIES),
  );

  const visible = Array.from(diagnostics.values()).filter(
    (d) => categoryFilter.has(d.category) && severityFilter.has(d.severity),
  );

  const toggleCategory = (c: Diagnostic["category"]): void => {
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const toggleSeverity = (s: Diagnostic["severity"]): void => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const jumpTo = (tick: number | undefined): void => {
    if (tick !== undefined) useFocusStore.getState().setTick(tick);
  };

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <div className="border-b border-edge p-2">
        <div className="mb-1 flex flex-wrap gap-1">
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`rounded border border-edge px-2 py-0.5 text-xs ${categoryFilter.has(c) ? "bg-raised text-ink" : "text-ink-faint"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => toggleSeverity(s)}
              className={`rounded border border-edge px-2 py-0.5 text-xs ${severityFilter.has(s) ? "bg-raised text-ink" : "text-ink-faint"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="p-3 text-sm text-ink-muted">
          {diagnostics.size === 0 ? "No errors in this session." : "No errors match the current filter."}
        </div>
      ) : (
        <ul className="flex-1 overflow-auto">
          {visible.map((d, i) => (
            <li key={i} className="border-b border-edge px-2 py-1.5">
              <button
                onClick={() => jumpTo(d.tick)}
                className="block w-full text-left"
                aria-label={d.tick !== undefined ? `tick #${d.tick} ${d.code}` : `${d.code}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${d.severity === "error" ? "bg-red-500" : "bg-amber-400"}`} />
                  <span className="text-ink-muted">{d.tick !== undefined ? `tick #${d.tick}` : "—"}</span>
                  <span className="text-ink">{d.code}</span>
                  <span className="text-ink-faint">[{d.category}]</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">{d.message}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @a2ui-inspector/ui test -- ErrorsPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/panels/ErrorsPanel.tsx packages/ui/src/panels/__tests__/ErrorsPanel.test.tsx
git commit -m "feat(ui): ErrorsPanel with category/severity filters + jump-to-tick"
```

---

## Task 12: UI — Timeline red dot per row

**Files:**
- Modify: `packages/ui/src/panels/Timeline.tsx`
- Modify: `packages/ui/src/__tests__/Timeline.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/ui/src/__tests__/Timeline.test.tsx`:

```tsx
describe("Timeline diagnostic dots", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("renders a red dot on rows with a diagnostic", () => {
    // seed entries via existing helper; if there isn't one, use useSessionStore.getState().loadEntries
    useSessionStore.getState().loadEntries([
      { tick: 0, ts: 0, direction: "agent->client",
        message: { version: "v0.9" } as never },
      { tick: 1, ts: 1, direction: "agent->client",
        message: { version: "v0.9" } as never },
    ]);
    useDiagnosticsStore.getState().add({
      ts: 1, tick: 1, category: "schema", severity: "error",
      code: "parse-failed", message: "bad",
    });
    render(<Timeline />);
    expect(screen.getByTestId("timeline-row-1").querySelector('[data-testid="diagnostic-dot"]')).toBeInTheDocument();
    expect(screen.getByTestId("timeline-row-0").querySelector('[data-testid="diagnostic-dot"]')).toBeNull();
  });

  it("renders exactly one dot even when multiple diagnostics target the same tick", () => {
    useSessionStore.getState().loadEntries([
      { tick: 0, ts: 0, direction: "agent->client",
        message: { version: "v0.9" } as never },
    ]);
    useDiagnosticsStore.getState().addMany([
      { ts: 1, tick: 0, category: "schema", severity: "error", code: "a", message: "" },
      { ts: 1, tick: 0, category: "protocol", severity: "warn", code: "b", message: "" },
    ]);
    render(<Timeline />);
    expect(screen.getByTestId("timeline-row-0").querySelectorAll('[data-testid="diagnostic-dot"]').length).toBe(1);
  });
});
```

Add imports at the top of the test file if not already present: `useDiagnosticsStore` from `../store/diagnostics.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test -- Timeline`
Expected: FAIL — dot element not present.

- [ ] **Step 3: Add the dot to Timeline rows**

In `packages/ui/src/panels/Timeline.tsx`:

1. Add to the imports near the top: `import { useDiagnosticsStore } from "../store/diagnostics.js";`
2. Inside the component, add: `const byTick = useDiagnosticsStore((s) => s.byTick);`
3. Locate the existing `<li>` (or row element) inside the visible-entries loop. Find the place where the direction arrow/icon is rendered. Add `data-testid={\`timeline-row-${tick}\`}` to the row element if not already present (so the test selectors work). Then, immediately before the direction icon, render:

```tsx
{byTick.has(tick) && (
  <span
    data-testid="diagnostic-dot"
    aria-label={`${byTick.get(tick)!.length} diagnostic(s) at tick ${tick}`}
    className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
  />
)}
```

The exact insertion point depends on the current JSX. Keep the dot strictly to the left of the row's existing content; do not change row layout otherwise.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @a2ui-inspector/ui test -- Timeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/panels/Timeline.tsx packages/ui/src/__tests__/Timeline.test.tsx
git commit -m "feat(ui): Timeline red dot per row with diagnostics"
```

---

## Task 13: UI — `App.tsx` wires panel + boundary + protocol seeding

**Files:**
- Modify: `packages/ui/src/App.tsx`
- (No new test file — covered by `ErrorsPanel.test.tsx`, the boundary test, and the e2e in Task 14. The wiring is glue.)

- [ ] **Step 1: Mount `<ErrorsPanel />` as a tab in the right sidebar**

In `packages/ui/src/App.tsx`, locate where the existing right-sidebar tabs are defined (look for the array of tabs / `MainPaneTabs` usage). Add `Errors` next to the existing tabs. If the tabs are defined as an array:

```tsx
const tabs = [
  // ... existing entries ...
  { id: "errors", label: "Errors", render: () => <ErrorsPanel /> },
];
```

Import: `import { ErrorsPanel } from "./panels/ErrorsPanel.js";`

If the existing tab system reads a count for badges, add a count from `useDiagnosticsStore((s) => s.diagnostics.size)` and display it as `Errors (${n})`.

- [ ] **Step 2: Wrap the preview in `<PreviewErrorBoundary>`**

Locate where `<Preview />` is rendered in `App.tsx` (or wherever it lives). Wrap it:

```tsx
<PreviewErrorBoundary>
  <Preview />
</PreviewErrorBoundary>
```

Import: `import { PreviewErrorBoundary } from "./components/PreviewErrorBoundary.js";`

- [ ] **Step 3: Seed protocol diagnostics on `#share=` boot**

Locate the existing boot effect that calls `decodeSession(fragment)` and destructures `{ entries, bookmarks }`. After the existing `loadEntries(decoded.entries)` and `useBookmarksStore.getState().loadAll(decoded.bookmarks)` calls, add:

```tsx
useDiagnosticsStore.getState().addMany(
  deriveProtocolDiagnostics(decoded.entries),
);
```

Imports:
```tsx
import { useDiagnosticsStore } from "./store/diagnostics.js";
import { deriveProtocolDiagnostics } from "./diagnostics/deriveProtocolDiagnostics.js";
```

Order matters: `loadEntries` clears diagnostics (per Task 8), so the `addMany` MUST run after.

- [ ] **Step 4: Run all UI tests + typecheck + build**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat(ui): wire ErrorsPanel + PreviewErrorBoundary + protocol seeding on boot"
```

---

## Task 14: E2E — error round-trip

**Files:**
- Create: `tests/e2e/errors.spec.ts`
- Create: `examples/recordings/with-unknown-surface.jsonl` (or reuse an existing fixture if it already contains an unknown-surface error)

- [ ] **Step 1: Create the fixture**

Create `examples/recordings/with-unknown-surface.jsonl` (one JSON per line):

```json
{"tick":0,"ts":1000,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"ghost","components":[]}}}
```

(One entry is enough — it intentionally never `createSurface`'s `ghost`, so the `deriveProtocolDiagnostics` walker will emit an `unknown-surface` diagnostic at tick 0.)

- [ ] **Step 2: Write the failing e2e**

Create `tests/e2e/errors.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("unknown-surface fixture shows red dot, panel entry, and jump-to-tick works", async ({ page }) => {
  // Build a #share= fragment from the fixture so this test does not need the sidecar.
  const jsonl = readFileSync(
    join(process.cwd(), "examples/recordings/with-unknown-surface.jsonl"),
    "utf8",
  );

  // Use the page's own codec to build the fragment (matches the App's decode path).
  await page.goto("about:blank");
  await page.goto("/");
  const fragment = await page.evaluate(async (text) => {
    const { encodeSession } = await import("/src/share/codec.ts");
    const entries = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const result = await encodeSession(entries);
    if (!result.ok) throw new Error("encode failed");
    return result.fragment;
  }, jsonl);

  await page.goto("about:blank");
  await page.goto(`/#share=${fragment}`);

  // Red dot appears on the row for tick 0.
  await expect(
    page.getByTestId("timeline-row-0").locator('[data-testid="diagnostic-dot"]'),
  ).toBeVisible();

  // Errors tab opens.
  await page.getByRole("tab", { name: /errors/i }).click();
  await expect(page.getByText("unknown-surface")).toBeVisible();

  // Click the row → scrubber jumps. We assert via the focused row class or aria-current.
  await page.getByRole("button", { name: /tick #0 unknown-surface/i }).click();
  await expect(page.getByTestId("timeline-row-0")).toHaveAttribute("data-focused", "true");
});
```

(If the existing Timeline uses a different focused-indicator attribute, replace the last assertion's selector to match what's already in the codebase. The contract is: clicking the panel row moves focus to tick 0.)

- [ ] **Step 3: Run e2e to verify it fails**

Run: `pnpm e2e -- errors.spec.ts`
Expected: FAIL — until the wiring from Tasks 8–13 is in place this can't pass; if previous tasks are done, this run should reveal any remaining gaps (most commonly selector mismatches).

- [ ] **Step 4: Fix any selector mismatches**

If the assertions fail because of selector wording (e.g., the tab is labelled `Errors` vs. `errors (1)`), update either the test selector or the panel label so they match. Make minimal changes; the contract is what's being tested, not the exact strings.

- [ ] **Step 5: Run all tests + typecheck + build**

Run: `pnpm build && pnpm typecheck && pnpm test && pnpm e2e`
Expected: PASS — full suite green.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/errors.spec.ts examples/recordings/with-unknown-surface.jsonl
git commit -m "test(e2e): unknown-surface diagnostic round-trip"
```

---

## Self-review

**Spec coverage:**
- Four categories (`schema`/`protocol`/`transport`/`render`) — covered by Tasks 1, 6, 9, 10.
- `DiagnosticSchema` + event variant — Task 1.
- Sidecar `appendDiagnostic` + persistence + bridge forwarding — Tasks 4, 5, 7.
- UI `useDiagnosticsStore` with `byTick` selector — Task 8.
- `deriveProtocolDiagnostics` (unknown-surface, version-mismatch, derive-crashed; dangling-ref is noted as opportunistic per shared schemas) — Task 9.
- `<PreviewErrorBoundary>` — Task 10.
- `ErrorsPanel` with filter chips + jump-to-tick + empty state — Task 11.
- Red dot on Timeline rows — Task 12.
- App wiring (panel mount, boundary wrap, share-boot seed) — Task 13.
- E2E covering load → red dot → panel entry → jump — Task 14.
- Diagnostics cleared on session replace — Task 8 (`session.ts` lifecycle).
- No share-fragment change — preserved (Task 13 seeds via derive; no codec change).
- Pre-existing diagnostic plumbing migrated — Tasks 1, 2, 3.

**Placeholder scan:** No TBD/TODO. Two soft spots:
- Task 6 SSE test helpers ("`createSseConnection`/`pushSseEvent` … keep its style"): leaves naming to the executor because the existing test file's helpers vary. Contract is explicit.
- Task 9 (`dangling-ref`) intentionally deferred to "opportunistic": the A2UI schema's component-ref shape isn't pinned here, and a naïve walker risks false positives. Acceptable trade — the spec lists it as a category, not a hard requirement, and the test suite asserts the other two codes plus `derive-crashed`.

**Type consistency:** `Diagnostic` shape used identically across all tasks (`ts`, optional `tick`, `category`, `severity`, `code`, `message`, optional `detail`). Store method names match across Tasks 4 (`appendDiagnostic`, `replaceDiagnostics`, `onDiagnosticAppend`, `onDiagnosticReplace`), 5, 7. UI store methods (`add`, `addMany`, `clear`, `diagnostics`, `byTick`) match across Tasks 8, 10, 11, 12, 13. Bridge event variant `{ kind: "diagnostic", diagnostic }` consistent in Tasks 1, 2, 3, 5.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-23-errors-panel.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review between tasks, fast iteration. Matches the pattern that worked for bookmarks.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
