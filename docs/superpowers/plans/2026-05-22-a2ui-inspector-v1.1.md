# A2UI Inspector — v1.1: Validator CLI, Bridge Auth, Pluggable Preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three infra-free v1.1 features — a standalone spec-validator CLI, token auth on the sidecar bridge, and a pluggable Preview renderer (React + a structural JSON renderer).

**Architecture:** New `packages/validator` workspace package wrapping the existing `@a2ui-inspector/shared` Zod schemas. Bridge auth: the sidecar mints a token, gates `/bridge` on a `?token=` query param, and exposes it via a same-origin `/bridge-token` route the UI fetches. Pluggable preview: a `PreviewRenderer` interface + registry; the Preview pane dispatches to the selected renderer.

**Tech Stack:** Existing — TypeScript 5, Node 20, Fastify 4, `@fastify/websocket`, Zod 3, React 18, Zustand 4, Vitest. No new dependencies.

---

## v1.1 scope

**In scope:**
- **Feature A — Spec validator CLI:** `packages/validator`, `a2ui-validate <session.jsonl>` — validates every line against the v0.9 session schema, reports all per-line errors, exits 0/1.
- **Feature B — Bridge auth:** sidecar mints a token (overridable via `A2UI_INSPECTOR_TOKEN`), `/bridge` requires `?token=`, `/bridge-token` serves it same-origin, UI fetches + uses it.
- **Feature C — Pluggable preview:** `PreviewRenderer` interface + registry; ships a React renderer (existing `@a2ui/react`) and a JSON structural renderer; Preview gets a renderer selector.

**Explicitly NOT in this plan:** Share-via-URL (needs a hosted backend + privacy review — separate brainstormed project). Lit/Angular preview renderers (would need framework embedding — they can be registered against Feature C's interface later).

## Starting state

- Branch off `main` (v1 fully merged).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`
- Relevant existing code:
  - `packages/shared/src/` — `SessionEntrySchema`, `A2UIMessageSchema`, `A2UIActionSchema`, bridge `CommandSchema`/`EventSchema`. Package `@a2ui-inspector/shared`, builds to `dist/`.
  - `packages/sidecar/src/server.ts` — `buildServer(opts): Promise<FastifyInstance>`; registers `/bridge` WS and static UI serving. (Full current content is reproduced in Task 3.)
  - `packages/sidecar/src/bin.ts` — reads `A2UI_INSPECTOR_HOST`/`PORT`, `const app = await buildServer()`, listens, prints the URL, best-effort opens a browser.
  - `packages/sidecar/src/__tests__/bridge.test.ts` — `describe("bridge")`, `beforeEach` does `buildServer({ store })` + `app.listen`, tests connect to `ws://127.0.0.1:${port}/bridge`.
  - `packages/ui/src/transport/bridgeClient.ts` — `BridgeClient` with a synchronous `connect()`; `bridge` singleton; `App.tsx` calls `bridge.connect()` in a mount effect.
  - `packages/ui/src/panels/Preview.tsx` — renders the active surface inside a `SurfaceErrorBoundary` via `<A2uiSurface surface={... as never} />` from `@a2ui/react/v0_9`; has a device-frame selector row (`usePreviewStore`).
  - `packages/ui/src/replay/surfaceView.ts` — `toSurfaceView(surfaceId, model): SurfaceView`.
  - `packages/ui/src/components/JsonTree.tsx` — `<JsonTree value={...} />`.
  - The CI workflow runs `pnpm build` (topological) before `pnpm typecheck`/`pnpm test`, then `pnpm e2e`.

## File structure after v1.1

```
packages/validator/                   NEW package — a2ui-validate
├── package.json
├── tsconfig.json
└── src/
    ├── validate.ts                   validateSessionFile + formatReport
    ├── bin.ts                        CLI entry
    └── __tests__/validate.test.ts

packages/sidecar/src/
├── server.ts                         MODIFIED — token, /bridge-token, /bridge gate
├── bin.ts                            MODIFIED — print token
└── __tests__/bridge.test.ts          MODIFIED — pass token

packages/ui/src/
├── transport/bridgeClient.ts         MODIFIED — async connect, fetch token
├── renderers/                        NEW
│   ├── types.ts                      PreviewRenderer interface
│   ├── reactRenderer.tsx
│   ├── jsonRenderer.tsx
│   └── index.ts                      PREVIEW_RENDERERS registry
├── store/previewRenderer.ts          NEW — selected renderer id
└── panels/Preview.tsx                MODIFIED — renderer selector + dispatch

README.md                             MODIFIED — a2ui-validate + bridge-token notes
```

## Pre-flight notes

1. Run `pnpm test` after each task — the 110 existing tests must stay green (Feature B updates `bridge.test.ts` itself; that is expected).
2. Commit after every task.
3. Feature B changes the `buildServer` return type from `FastifyInstance` to `{ app, token }`. Every caller (`bin.ts`, `bridge.test.ts`) is updated in the same task.

---

## Task 1: Validator package + core `validateSessionFile`

**Files:**
- Create: `packages/validator/package.json`
- Create: `packages/validator/tsconfig.json`
- Create: `packages/validator/src/validate.ts`
- Create: `packages/validator/src/__tests__/validate.test.ts`

- [ ] **Step 1: Write `packages/validator/package.json`**

```json
{
  "name": "a2ui-validate",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/validate.js",
  "types": "dist/validate.d.ts",
  "bin": { "a2ui-validate": "dist/bin.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'lint: noop'"
  },
  "dependencies": {
    "@a2ui-inspector/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `packages/validator/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install**

Run: `pnpm install` (from repo root) — picks up the new workspace package.

- [ ] **Step 4 (TDD): Write the failing test**

`packages/validator/src/__tests__/validate.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSessionFile, formatReport } from "../validate.js";

const tmp = () => mkdtempSync(join(tmpdir(), "a2ui-validate-test-"));
const write = (body: string) => {
  const path = join(tmp(), "session.jsonl");
  writeFileSync(path, body);
  return path;
};

const validEntry = JSON.stringify({
  tick: 0, ts: 1000, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: "main" } },
});

describe("validateSessionFile", () => {
  it("reports ok for a fully valid session", async () => {
    const report = await validateSessionFile(write(validEntry + "\n"));
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.lineCount).toBe(1);
  });

  it("skips blank lines", async () => {
    const report = await validateSessionFile(write(validEntry + "\n\n" + validEntry + "\n"));
    expect(report.ok).toBe(true);
    expect(report.lineCount).toBe(2);
  });

  it("reports malformed JSON with the 1-based line number", async () => {
    const report = await validateSessionFile(write("not-json\n"));
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.line).toBe(1);
    expect(report.errors[0]?.message).toMatch(/malformed JSON/);
  });

  it("collects ALL errors, not just the first", async () => {
    const report = await validateSessionFile(write("not-json\n" + "{}\n"));
    expect(report.errors.length).toBe(2);
    expect(report.errors[0]?.line).toBe(1);
    expect(report.errors[1]?.line).toBe(2);
  });

  it("reports a schema-invalid entry (missing message/action)", async () => {
    const bad = JSON.stringify({ tick: 0, ts: 0, direction: "agent->client" });
    const report = await validateSessionFile(write(bad + "\n"));
    expect(report.ok).toBe(false);
    expect(report.errors[0]?.line).toBe(1);
  });
});

describe("formatReport", () => {
  it("renders a success line when ok", () => {
    const out = formatReport("s.jsonl", { ok: true, lineCount: 3, errors: [] });
    expect(out).toMatch(/s\.jsonl/);
    expect(out).toMatch(/3/);
    expect(out.toLowerCase()).toMatch(/valid|ok/);
  });

  it("renders each error with its line number when not ok", () => {
    const out = formatReport("s.jsonl", {
      ok: false, lineCount: 2,
      errors: [{ line: 1, message: "malformed JSON — x" }, { line: 2, message: "bad" }],
    });
    expect(out).toMatch(/1:/);
    expect(out).toMatch(/2:/);
    expect(out).toMatch(/bad/);
  });
});
```

- [ ] **Step 5: Run, verify fail**

Run: `pnpm --filter a2ui-validate test`
Expected: FAIL — `../validate.js` not found.

- [ ] **Step 6: Implement `packages/validator/src/validate.ts`**

```typescript
import { readFile } from "node:fs/promises";
import { SessionEntrySchema } from "@a2ui-inspector/shared";

export interface ValidationError {
  line: number;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  lineCount: number;
  errors: ValidationError[];
}

/** Validate every non-blank line of a .jsonl session file against the v0.9 spec. */
export async function validateSessionFile(path: string): Promise<ValidationReport> {
  const text = await readFile(path, "utf8");
  const errors: ValidationError[] = [];
  let lineNo = 0;
  let lineCount = 0;

  for (const raw of text.split("\n")) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    lineCount++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push({ line: lineNo, message: `malformed JSON — ${(err as Error).message}` });
      continue;
    }

    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join("/") || "(root)"}: ${i.message}`)
        .join("; ");
      errors.push({ line: lineNo, message: detail });
    }
  }

  return { ok: errors.length === 0, lineCount, errors };
}

/** Render a human-readable report for the CLI. */
export function formatReport(path: string, report: ValidationReport): string {
  if (report.ok) {
    return `${path}: valid — ${report.lineCount} entr${report.lineCount === 1 ? "y" : "ies"} OK`;
  }
  const lines = report.errors.map((e) => `  line ${e.line}: ${e.message}`);
  return [
    `${path}: INVALID — ${report.errors.length} error${report.errors.length === 1 ? "" : "s"} in ${report.lineCount} entr${report.lineCount === 1 ? "y" : "ies"}`,
    ...lines,
  ].join("\n");
}
```

- [ ] **Step 7: Run, verify pass**

Run: `pnpm --filter a2ui-validate test`
Expected: PASS — 7 tests green.
Run: `pnpm --filter a2ui-validate build` — clean (produces `dist/`).

- [ ] **Step 8: Commit**

```bash
git add packages/validator pnpm-lock.yaml
git commit -m "feat(validator): add a2ui-validate package + validateSessionFile core"
```

---

## Task 2: Validator CLI entry

**Files:**
- Create: `packages/validator/src/bin.ts`
- Modify: `README.md`

- [ ] **Step 1: Implement `packages/validator/src/bin.ts`**

```typescript
#!/usr/bin/env node
import { validateSessionFile, formatReport } from "./validate.js";

const path = process.argv[2];

if (!path) {
  process.stderr.write("usage: a2ui-validate <session.jsonl>\n");
  process.exit(2);
}

try {
  const report = await validateSessionFile(path);
  process.stdout.write(formatReport(path, report) + "\n");
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  process.stderr.write(`a2ui-validate: ${String((err as Error).message)}\n`);
  process.exit(2);
}
```

- [ ] **Step 2: Build and smoke-test the CLI against the repo fixtures**

```bash
pnpm --filter a2ui-validate build
node packages/validator/dist/bin.js examples/recordings/restaurant-finder-happy-path.jsonl
```
Expected: prints `examples/recordings/restaurant-finder-happy-path.jsonl: valid — 3 entries OK`, exits 0.

```bash
node packages/validator/dist/bin.js examples/recordings/action-roundtrip.jsonl && echo "EXIT_OK"
```
Expected: prints a `valid` line, then `EXIT_OK`.

Test the failure path with a deliberately broken temp file:

```bash
printf 'not-json\n' > /tmp/bad-session.jsonl
node packages/validator/dist/bin.js /tmp/bad-session.jsonl; echo "exit=$?"
```
Expected: prints an `INVALID` report with `line 1`, then `exit=1`.

```bash
node packages/validator/dist/bin.js; echo "exit=$?"
```
Expected: prints the `usage:` line to stderr, then `exit=2`.

- [ ] **Step 3: Add a validator section to `README.md`**

Read `README.md`. After the existing `## Docker` section (and before `## Status`), insert:

```markdown
## Validating session files

`a2ui-validate` checks a `.a2ui-session.jsonl` recording against the A2UI v0.9
session schema, reporting every malformed or schema-invalid line:

```bash
npx a2ui-validate path/to/session.jsonl
```

Exit code `0` = valid, `1` = validation errors found, `2` = usage error or
unreadable file.
```

- [ ] **Step 4: Verify the whole package**

Run: `pnpm --filter a2ui-validate typecheck` — clean.
Run: `pnpm --filter a2ui-validate test` — 7 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/validator README.md
git commit -m "feat(validator): add a2ui-validate CLI entry + README"
```

---

## Task 3: Bridge auth — sidecar token

**Files:**
- Modify: `packages/sidecar/src/server.ts`
- Modify: `packages/sidecar/src/bin.ts`
- Modify: `packages/sidecar/src/__tests__/bridge.test.ts`

### Background

The `/bridge` WebSocket currently has no auth — any client that can reach the port can issue `loadFile`/`saveSession` (arbitrary host file read/write). A malicious web page you visit can open `ws://localhost:8765/bridge` cross-origin. The fix: the sidecar mints a token, `/bridge` requires it as a `?token=` query param, and `/bridge-token` (a same-origin GET) serves it to the legitimate UI. Cross-origin JS cannot read the `/bridge-token` response (no CORS headers), so it cannot obtain the token.

`buildServer` changes its return type from `FastifyInstance` to `{ app, token }`.

- [ ] **Step 1: Update `bridge.test.ts` to expect the new shape (failing)**

The current `describe("bridge")` block's `beforeEach` does `const app = await buildServer({ store })` and tests connect to `ws://127.0.0.1:${port}/bridge`. Update the `beforeEach` and every bridge-connection URL in this file.

In `beforeEach`, change the build + capture the token:

```typescript
    const built = await buildServer({ store });
    const app = built.app;
    bridgeToken = built.token;
```

Add `let bridgeToken: string;` alongside the other `let` declarations at the top of the `describe`.

Then change EVERY `new WebSocket(\`ws://127.0.0.1:${port}/bridge\`)` in this file to:

```typescript
    new WebSocket(`ws://127.0.0.1:${port}/bridge?token=${bridgeToken}`)
```

(There are several — update all of them, including inside the `injectAction` tests.)

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `buildServer(...)` returns a `FastifyInstance`, so `built.app` / `built.token` are wrong; TypeScript/runtime errors.

- [ ] **Step 3: Replace `packages/sidecar/src/server.ts` with**

```typescript
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { registerBridgeClient } from "./bridge.js";
import { SessionStore } from "./session/store.js";

export interface BuildServerOptions {
  store?: SessionStore;
  uiDistDir?: string;
  /** Bridge auth token. Defaults to A2UI_INSPECTOR_TOKEN or a random hex string. */
  token?: string;
}

export interface BuiltServer {
  app: FastifyInstance;
  token: string;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<BuiltServer> {
  const app = Fastify({ logger: false });
  const store = opts.store ?? new SessionStore();
  const token = opts.token ?? process.env.A2UI_INSPECTOR_TOKEN ?? randomBytes(16).toString("hex");

  await app.register(fastifyWebsocket);

  // Same-origin endpoint the UI fetches to learn the bridge token. Cross-origin
  // JS cannot read this response (no CORS headers), so it cannot reach /bridge.
  app.get("/bridge-token", async () => ({ token }));

  app.get("/bridge", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/bridge", "http://localhost");
    if (url.searchParams.get("token") !== token) {
      socket.close(4401, "unauthorized");
      return;
    }
    registerBridgeClient(socket as never, store);
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const uiDist = opts.uiDistDir
    ?? (existsSync(resolve(here, "../../ui/dist")) ? resolve(here, "../../ui/dist") : resolve(here, "../ui-dist"));
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, { root: uiDist, prefix: "/" });
  } else {
    app.get("/", async () => ({ ok: true, ui: "missing", hint: "Run `pnpm --filter @a2ui-inspector/ui build` to build the UI." }));
  }

  return { app, token };
}
```

- [ ] **Step 4: Update `packages/sidecar/src/bin.ts`**

Read the current `bin.ts`. It does `const app = await buildServer();` then `await app.listen(...)` and prints a ready line. Change the destructuring and the print:

- Change `const app = await buildServer();` to `const { app, token } = await buildServer();`
- After the existing `process.stdout.write(\`A2UI Inspector ready: ${url}\n\`);` line, add:

```typescript
process.stdout.write(`Bridge token: ${token}\n`);
```

Leave everything else (host/port env reading, `app.listen`, the best-effort browser open) unchanged.

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — all sidecar tests, including the bridge tests now connecting with `?token=`.
Run: `pnpm --filter a2ui-inspector build` — clean.

- [ ] **Step 6: Add a `/bridge-token` test**

Append inside the `describe("bridge")` block in `bridge.test.ts`:

```typescript
  it("rejects a /bridge connection with no token", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    const closeCode = await new Promise<number>((resolve) => {
      client.once("close", (code) => resolve(code));
      client.once("open", () => client.close());
    });
    expect(closeCode).toBe(4401);
  });

  it("serves the bridge token over /bridge-token", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/bridge-token`);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(bridgeToken);
  });
```

- [ ] **Step 7: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — the 2 new tests plus all prior sidecar tests.

- [ ] **Step 8: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): token-auth the bridge WS; serve token via /bridge-token"
```

---

## Task 4: Bridge auth — UI fetches + uses the token

**Files:**
- Modify: `packages/ui/src/transport/bridgeClient.ts`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Replace `packages/ui/src/transport/bridgeClient.ts` with**

```typescript
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
        kind: "diagnostic", level: "error",
        message: "bridge: could not fetch auth token from the sidecar",
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
          kind: "diagnostic", level: "warn",
          message: `bridge: bad event — ${result.error.message}`,
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
```

- [ ] **Step 2: Update the `bridge.connect()` call in `App.tsx`**

`connect()` is now async. Read `App.tsx` and change the mount effect:

```tsx
  useEffect(() => { void bridge.connect(); }, []);
```

(`void` makes the floating promise explicit; no other change to the effect.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.
Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass (the bridge client has no direct unit test; it is exercised by the e2e).
Run: `pnpm build` — clean.
Run: `pnpm e2e` — the happy-path e2e MUST pass. The UI now fetches `/bridge-token` from the sidecar and connects with it; the sidecar's `bin.ts` minted the token. If the e2e fails because the WS never connects, confirm the `/bridge-token` fetch resolves against the sidecar origin (the e2e serves UI + sidecar on the same origin, so the prod-mode `""` origin + `/bridge-token` path applies).

- [ ] **Step 4: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): fetch + use the bridge auth token when connecting"
```

---

## Task 5: Pluggable preview — renderer registry + stores

**Files:**
- Create: `packages/ui/src/renderers/types.ts`
- Create: `packages/ui/src/renderers/reactRenderer.tsx`
- Create: `packages/ui/src/renderers/jsonRenderer.tsx`
- Create: `packages/ui/src/renderers/index.ts`
- Create: `packages/ui/src/store/previewRenderer.ts`
- Create: `packages/ui/src/__tests__/previewRenderer.test.ts`

- [ ] **Step 1: Write the failing store + registry test**

`packages/ui/src/__tests__/previewRenderer.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { usePreviewRendererStore } from "../store/previewRenderer.js";
import { PREVIEW_RENDERERS, getRenderer } from "../renderers/index.js";

beforeEach(() => usePreviewRendererStore.setState({ rendererId: "react" }));

describe("preview renderer store", () => {
  it("defaults to the react renderer", () => {
    expect(usePreviewRendererStore.getState().rendererId).toBe("react");
  });

  it("setRendererId changes the selection", () => {
    usePreviewRendererStore.getState().setRendererId("json");
    expect(usePreviewRendererStore.getState().rendererId).toBe("json");
  });
});

describe("renderer registry", () => {
  it("ships a react and a json renderer", () => {
    const ids = PREVIEW_RENDERERS.map((r) => r.id);
    expect(ids).toContain("react");
    expect(ids).toContain("json");
  });

  it("every renderer has an id, a label, and a Surface component", () => {
    for (const r of PREVIEW_RENDERERS) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.label).toBe("string");
      expect(typeof r.Surface).toBe("function");
    }
  });

  it("getRenderer returns the matching renderer, or the first as fallback", () => {
    expect(getRenderer("json").id).toBe("json");
    expect(getRenderer("does-not-exist").id).toBe(PREVIEW_RENDERERS[0]!.id);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — renderer modules + store not found.

- [ ] **Step 3: Implement `packages/ui/src/renderers/types.ts`**

```typescript
import type { FC } from "react";

/** A pluggable Preview renderer. `surface` is the opaque @a2ui/web_core surface model. */
export interface PreviewRenderer {
  id: string;
  label: string;
  Surface: FC<{ surfaceId: string; surface: unknown }>;
}
```

- [ ] **Step 4: Implement `packages/ui/src/renderers/reactRenderer.tsx`**

```tsx
import { A2uiSurface } from "@a2ui/react/v0_9";
import type { PreviewRenderer } from "./types.js";

export const reactRenderer: PreviewRenderer = {
  id: "react",
  label: "React renderer",
  Surface: ({ surface }) => <A2uiSurface surface={surface as never} />,
};
```

- [ ] **Step 5: Implement `packages/ui/src/renderers/jsonRenderer.tsx`**

```tsx
import { toSurfaceView } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";
import type { PreviewRenderer } from "./types.js";

export const jsonRenderer: PreviewRenderer = {
  id: "json",
  label: "JSON (structural)",
  Surface: ({ surfaceId, surface }) => {
    const view = toSurfaceView(surfaceId, surface);
    const components = Object.fromEntries(
      Array.from(view.components.entries()).map(([id, node]) => [
        id,
        { type: node.type, childIds: node.childIds, props: node.props },
      ])
    );
    return (
      <div className="mono text-xs">
        <div className="mb-1 text-ink-faint">components ({view.components.size})</div>
        <JsonTree value={components} />
        <div className="mb-1 mt-3 text-ink-faint">data model</div>
        <JsonTree value={view.dataModel ?? {}} />
      </div>
    );
  },
};
```

- [ ] **Step 6: Implement `packages/ui/src/renderers/index.ts`**

```typescript
import { reactRenderer } from "./reactRenderer.js";
import { jsonRenderer } from "./jsonRenderer.js";
import type { PreviewRenderer } from "./types.js";

export type { PreviewRenderer } from "./types.js";

export const PREVIEW_RENDERERS: PreviewRenderer[] = [reactRenderer, jsonRenderer];

/** Look up a renderer by id; falls back to the first registered renderer. */
export function getRenderer(id: string): PreviewRenderer {
  return PREVIEW_RENDERERS.find((r) => r.id === id) ?? PREVIEW_RENDERERS[0]!;
}
```

- [ ] **Step 7: Implement `packages/ui/src/store/previewRenderer.ts`**

```typescript
import { create } from "zustand";

interface PreviewRendererState {
  rendererId: string;
  setRendererId: (id: string) => void;
}

export const usePreviewRendererStore = create<PreviewRendererState>((set) => ({
  rendererId: "react",
  setRendererId: (rendererId) => set({ rendererId }),
}));
```

- [ ] **Step 8: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 7 new tests pass.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 9: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add pluggable preview renderer registry (react + json)"
```

---

## Task 6: Pluggable preview — wire the selector into Preview

**Files:**
- Modify: `packages/ui/src/panels/Preview.tsx`

- [ ] **Step 1: Wire the renderer selector + dispatch**

Read the current `packages/ui/src/panels/Preview.tsx`. It imports `A2uiSurface` from `@a2ui/react/v0_9`, has a `SurfaceErrorBoundary` class, a device-frame selector row, and renders the active surface as:

```tsx
<SurfaceErrorBoundary surfaceId={activeId}>
  <A2uiSurface key={activeId} surface={activeSurface as never} />
</SurfaceErrorBoundary>
```

Make these changes:

1. Remove the `import { A2uiSurface } from "@a2ui/react/v0_9";` line — the React renderer now lives in the registry.
2. Add imports:
```tsx
import { PREVIEW_RENDERERS, getRenderer } from "../renderers/index.js";
import { usePreviewRendererStore } from "../store/previewRenderer.js";
```
3. In the component body, add:
```tsx
  const rendererId = usePreviewRendererStore((s) => s.rendererId);
  const setRendererId = usePreviewRendererStore((s) => s.setRendererId);
  const renderer = getRenderer(rendererId);
```
4. Add a renderer `<select>` to the device-frame selector row. Find the row `<div className="flex items-center gap-1 border-b border-edge px-2 py-1">` that holds the mobile/tablet/desktop buttons, and add — as the last child inside that same row — a spacer + select:
```tsx
        <select
          aria-label="Preview renderer"
          value={rendererId}
          onChange={(e) => setRendererId(e.target.value)}
          className="mono ml-auto rounded border border-edge-strong bg-surface px-1 py-0.5 text-xs text-ink"
        >
          {PREVIEW_RENDERERS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
```
5. Replace the `<A2uiSurface .../>` usage with the selected renderer's `Surface`:
```tsx
            <SurfaceErrorBoundary surfaceId={activeId}>
              <renderer.Surface key={`${activeId}:${rendererId}`} surfaceId={activeId} surface={activeSurface} />
            </SurfaceErrorBoundary>
```
The `key` includes `rendererId` so switching renderers remounts (and resets the error boundary).

Preserve everything else: the `SurfaceErrorBoundary` class, `stateAtTick`, the surface-tab row, the device-frame buttons + `maxWidth` wrapper, the empty state.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.
Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass.
Run: `pnpm --filter @a2ui-inspector/ui build` — clean.
Run: `pnpm e2e` — the happy-path e2e MUST still pass. It asserts the Preview renders "Hello world"; the default renderer is still `react`, so the rendered output is unchanged. If the e2e's `getByText("Hello world")` now also matches the JSON renderer output, that is not possible — the JSON renderer is not selected by default — but if a selector collision arises, scope the assertion, do not weaken it.

- [ ] **Step 3: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add renderer selector to the Preview pane"
```

---

## v1.1 acceptance checklist

```bash
pnpm install
pnpm build       # topological — shared, validator, sidecar, ui all clean
pnpm typecheck   # clean
pnpm test        # 110 prior + v1.1 new tests (validator 7, bridge 2, previewRenderer 7), all green
pnpm e2e         # happy-path green (UI fetches the bridge token, connects, renders)
node packages/validator/dist/bin.js examples/recordings/restaurant-finder-happy-path.jsonl   # "valid — 3 entries OK", exit 0
```

Manual smoke:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2 — prints "Bridge token: …"
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

In the UI: it connects (having fetched the token); in the Preview tab, the renderer `<select>` switches between "React renderer" and "JSON (structural)" — the JSON renderer shows the component map + data model as collapsible trees. Run `a2ui-validate` on a fixture and on a hand-broken file to see the 0/1 exit codes.

## Deferred beyond v1.1

- **Share-via-URL** — needs a hosted backend, ongoing infra, and a privacy review (session recordings can contain agent data / tokens / PII). Should be its own brainstormed project.
- **Lit / Angular / SwiftUI preview renderers** — register against the `PreviewRenderer` interface from Feature C; each needs framework-embedding work (iframe or web component).
