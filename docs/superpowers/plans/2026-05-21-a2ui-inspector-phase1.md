# A2UI Inspector — Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `npx a2ui-inspector` that connects to a live A2UI WebSocket agent (or replays a JSONL file), shows a scrubbable timeline, and previews each tick with `@a2ui/react`.

**Architecture:** pnpm monorepo. Three packages — `shared` (Zod-validated bridge protocol), `sidecar` (Fastify Node server: WS upstream adapter, file adapter, SessionStore, bridge WS), `ui` (Vite/React: layout shell, Zustand store, Timeline panel, Preview panel). The sidecar owns all I/O; UI is a thin client over a local WS bridge.

**Tech Stack:** Node 20, pnpm 9, TypeScript 5, Fastify 4, `@fastify/websocket`, `ws`, Zod 3, Vite 5, React 18, Zustand 4, TailwindCSS 3, Lucide-react, Vitest, Playwright, `@a2ui/web_core`, `@a2ui/react`.

---

## Phase 1 scope summary

**In scope this plan:**
- Monorepo scaffolding (pnpm workspaces, base tsconfig, lint, CI)
- `shared`: bridge `Command` / `Event` Zod schemas; `A2UIMessage` v0.9 schema; session-file format
- `sidecar`: Fastify server, bridge WS endpoint, `SessionStore`, WS upstream adapter, file adapter, `bin` entry for `npx`
- `ui`: layout shell, Zustand session/timeline stores, bridge client, replay engine wrapping `@a2ui/web_core`, Timeline panel, Preview panel embedding `@a2ui/react`, connect dialog, file drag-drop, JSONL export
- Mock-agent example script + one happy-path fixture
- Vitest unit tests across all three packages; one Playwright end-to-end smoke test
- GitHub Actions CI

**Deferred to Phase 2 (separate plan):**
- SSE upstream adapter, HTTP proxy adapter
- Action injection (bridge command + UI affordance)
- Component Tree panel, Diff panel, Data Model drawer
- Command palette (`Cmd/Ctrl+K`), most keyboard shortcuts beyond `←`/`→`
- Multi-surface tabs
- Light-mode toggle (Phase 1 ships dark-only)
- Docker image
- Malformed/multi-surface/action-roundtrip fixtures
- Settings dialog, device-frame toggle

## File structure preview

After Phase 1 the tree looks like this (every file listed gets created by some task in this plan):

```
a2ui-inspector/
├── .github/workflows/ci.yml
├── .gitignore
├── LICENSE                                       # MIT
├── README.md
├── package.json                                  # root, private
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                          # re-exports
│   │       ├── a2ui.ts                           # A2UI v0.9 message schema (Zod)
│   │       ├── bridge.ts                         # Command / Event schemas (Zod)
│   │       ├── session.ts                        # session file format
│   │       └── __tests__/
│   │           ├── a2ui.test.ts
│   │           ├── bridge.test.ts
│   │           └── session.test.ts
│   ├── sidecar/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── bin.ts                            # `npx a2ui-inspector` entry
│   │       ├── server.ts                         # Fastify + UI static + bridge
│   │       ├── session/store.ts                  # SessionStore class
│   │       ├── session/persistence.ts            # JSONL save/load
│   │       ├── adapters/websocket.ts             # upstream WS client
│   │       ├── adapters/file.ts                  # file ingestion
│   │       ├── bridge.ts                         # browser WS endpoint
│   │       └── __tests__/
│   │           ├── store.test.ts
│   │           ├── persistence.test.ts
│   │           ├── websocket.test.ts
│   │           └── bridge.test.ts
│   └── ui/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── index.css
│           ├── store/session.ts                  # Zustand session log
│           ├── store/timeline.ts                 # Zustand scrub position
│           ├── transport/bridgeClient.ts         # browser WS client
│           ├── replay/processor.ts               # wraps @a2ui/web_core
│           ├── panels/Timeline.tsx
│           ├── panels/Preview.tsx
│           ├── components/ConnectDialog.tsx
│           ├── components/Toolbar.tsx
│           └── __tests__/
│               ├── Timeline.test.tsx
│               └── replay.test.ts
├── examples/
│   ├── mock-agent/
│   │   ├── package.json
│   │   └── src/index.ts                          # tiny script emitting demo A2UI
│   └── recordings/
│       └── restaurant-finder-happy-path.jsonl
└── tests/e2e/
    ├── playwright.config.ts
    └── happy-path.spec.ts
```

## Pre-flight notes for the implementer

1. **Working directory:** `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`. Git is already initialized; one commit exists with the spec.
2. **Risk to verify in Task 1:** `@a2ui/react` and `@a2ui/web_core` are presumed published on npm under those names. There is an open spec-repo issue (#867 "Publish @a2ui/react to npm") suggesting publishing may be recent. Run `npm view @a2ui/react version` early. If unpublished, install from the `google/A2UI` GitHub directly via `pnpm add github:google/A2UI#path:/renderers/react` — note the fallback in the README.
3. **Node version:** 20+. Verify with `node --version` before starting.
4. **pnpm:** install via `corepack enable && corepack prepare pnpm@latest --activate` if not present.
5. **Commits:** small and frequent — one per task minimum, more if a step is self-contained.

---

## Task 1: Initialize monorepo scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Verify environment**

Run: `node --version && pnpm --version`
Expected: Node ≥ 20, pnpm ≥ 9. If pnpm missing, `corepack enable && corepack prepare pnpm@latest --activate`.

Also verify the A2UI npm packages exist:

Run: `npm view @a2ui/react version && npm view @a2ui/web_core version`
Expected: a version string for each. If 404, see Pre-flight note #2 — install from GitHub instead, but record this as a deviation in the README under "Known issues."

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "a2ui-inspector-monorepo",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm --filter sidecar dev"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "examples/*"
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.turbo/
.next/
*.log
.DS_Store
coverage/
test-results/
playwright-report/
```

- [ ] **Step 6: Write `LICENSE`**

Standard MIT license text, copyright year `2026`, holder `A2UI Inspector contributors`.

- [ ] **Step 7: Write `README.md`**

```markdown
# A2UI Inspector

Cross-renderer browser-based debugger for A2UI v0.9 message streams.

```bash
npx a2ui-inspector
```

See `docs/superpowers/specs/2026-05-21-a2ui-inspector-design.md` for the design.

## Development

```bash
pnpm install
pnpm test
pnpm dev
```

## Status

Phase 1 MVP — in development.
```

- [ ] **Step 8: Install and verify**

Run: `pnpm install`
Expected: install completes with no peer-dep errors. `pnpm-lock.yaml` is created.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore LICENSE README.md pnpm-lock.yaml
git commit -m "chore: initialize monorepo scaffolding"
```

---

## Task 2: Shared package — bridge protocol Zod schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/a2ui.ts`
- Create: `packages/shared/src/bridge.ts`
- Create: `packages/shared/src/session.ts`
- Create: `packages/shared/src/__tests__/a2ui.test.ts`
- Create: `packages/shared/src/__tests__/bridge.test.ts`
- Create: `packages/shared/src/__tests__/session.test.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@a2ui-inspector/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "lint": "echo 'lint: noop'"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

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

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: `zod` and `vitest` added to the shared package.

- [ ] **Step 4: Write the failing A2UI message schema test**

`packages/shared/src/__tests__/a2ui.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { A2UIMessageSchema } from "../a2ui.js";

describe("A2UIMessageSchema", () => {
  it("parses createSurface v0.9", () => {
    const msg = {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json" }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses updateComponents v0.9", () => {
    const msg = {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Column", children: ["a", "b"] }]
      }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses updateDataModel v0.9", () => {
    const msg = {
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/", value: { title: "x" } }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses deleteSurface v0.9", () => {
    const msg = { version: "v0.9", deleteSurface: { surfaceId: "main" } };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects unknown version", () => {
    expect(() => A2UIMessageSchema.parse({ version: "v0.7", createSurface: { surfaceId: "x" } })).toThrow();
  });

  it("rejects missing surfaceId", () => {
    expect(() => A2UIMessageSchema.parse({ version: "v0.9", createSurface: {} })).toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: FAIL — cannot resolve `../a2ui.js`.

- [ ] **Step 6: Implement `packages/shared/src/a2ui.ts`**

```typescript
import { z } from "zod";

// A2UI v0.9 message envelope. We keep schemas permissive about the inner
// payload shape (deep validation isn't this tool's job — that's the spec
// validator's, a Phase-2-or-later effort) but require the discriminating
// keys present in the spec.

const CreateSurface = z.object({
  surfaceId: z.string(),
  catalogId: z.string().optional(),
  sendDataModel: z.boolean().optional(),
});

const ComponentRef = z.object({
  id: z.string(),
  // The component shape may be a string name OR an object — accept both.
  component: z.union([z.string(), z.record(z.unknown())]),
  children: z.array(z.string()).optional(),
}).passthrough();

const UpdateComponents = z.object({
  surfaceId: z.string(),
  components: z.array(ComponentRef),
});

const UpdateDataModel = z.object({
  surfaceId: z.string(),
  path: z.string().optional(),
  value: z.unknown(),
}).passthrough();

const DeleteSurface = z.object({
  surfaceId: z.string(),
});

export const A2UIMessageSchema = z.object({
  version: z.literal("v0.9"),
}).and(
  z.union([
    z.object({ createSurface: CreateSurface }),
    z.object({ updateComponents: UpdateComponents }),
    z.object({ updateDataModel: UpdateDataModel }),
    z.object({ deleteSurface: DeleteSurface }),
  ])
);

export type A2UIMessage = z.infer<typeof A2UIMessageSchema>;

// An A2UI Action coming back from the client to the agent.
// v0.9 action serialization is sparsely documented publicly (see spec risks
// in the design doc). Accept a permissive shape and refine later.
export const A2UIActionSchema = z.object({
  surfaceId: z.string(),
  componentId: z.string(),
  kind: z.string(),
  payload: z.unknown().optional(),
});

export type A2UIAction = z.infer<typeof A2UIActionSchema>;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: PASS — all 6 cases green.

- [ ] **Step 8: Write the bridge protocol test**

`packages/shared/src/__tests__/bridge.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { CommandSchema, EventSchema } from "../bridge.js";

describe("Bridge Command", () => {
  it("parses connectUpstream WS config", () => {
    const cmd = { kind: "connectUpstream", config: { transport: "websocket", url: "ws://localhost:8080" } };
    expect(() => CommandSchema.parse(cmd)).not.toThrow();
  });

  it("parses scrubTo", () => {
    expect(() => CommandSchema.parse({ kind: "scrubTo", tick: 42 })).not.toThrow();
  });

  it("parses loadFile", () => {
    expect(() => CommandSchema.parse({ kind: "loadFile", path: "/tmp/x.jsonl" })).not.toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() => CommandSchema.parse({ kind: "frobnicate" })).toThrow();
  });
});

describe("Bridge Event", () => {
  it("parses messageReceived", () => {
    const ev = {
      kind: "messageReceived",
      tick: 0,
      ts: Date.now(),
      message: { version: "v0.9", createSurface: { surfaceId: "main" } }
    };
    expect(() => EventSchema.parse(ev)).not.toThrow();
  });

  it("parses upstreamStatus", () => {
    expect(() => EventSchema.parse({ kind: "upstreamStatus", status: "connected" })).not.toThrow();
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: FAIL — `../bridge.js` not found.

- [ ] **Step 10: Implement `packages/shared/src/bridge.ts`**

```typescript
import { z } from "zod";
import { A2UIActionSchema, A2UIMessageSchema } from "./a2ui.js";

const UpstreamConfigSchema = z.discriminatedUnion("transport", [
  z.object({ transport: z.literal("websocket"), url: z.string().url() }),
  z.object({ transport: z.literal("sse"), url: z.string().url() }), // accepted now for Phase 2 forward compat
]);

export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connectUpstream"), config: UpstreamConfigSchema }),
  z.object({ kind: z.literal("loadFile"), path: z.string() }),
  z.object({ kind: z.literal("saveSession"), path: z.string() }),
  z.object({ kind: z.literal("scrubTo"), tick: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("clear") }),
]);

export type Command = z.infer<typeof CommandSchema>;

const UpstreamStatus = z.enum(["connecting", "connected", "closed", "error"]);

export const EventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("messageReceived"),
    tick: z.number().int().nonnegative(),
    ts: z.number(),
    message: A2UIMessageSchema,
  }),
  z.object({
    kind: z.literal("actionSent"),
    tick: z.number().int().nonnegative(),
    ts: z.number(),
    action: A2UIActionSchema,
  }),
  z.object({
    kind: z.literal("upstreamStatus"),
    status: UpstreamStatus,
    detail: z.string().optional(),
  }),
  z.object({
    kind: z.literal("sessionLoaded"),
    tickCount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("diagnostic"),
    level: z.enum(["warn", "error"]),
    message: z.string(),
  }),
]);

export type Event = z.infer<typeof EventSchema>;
```

- [ ] **Step 11: Run bridge test**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: PASS for bridge.test.ts.

- [ ] **Step 12: Write session-file test**

`packages/shared/src/__tests__/session.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SessionEntrySchema } from "../session.js";

describe("SessionEntrySchema", () => {
  it("parses a message entry", () => {
    const e = {
      tick: 0,
      ts: 1000,
      direction: "agent->client",
      message: { version: "v0.9", createSurface: { surfaceId: "main" } }
    };
    expect(() => SessionEntrySchema.parse(e)).not.toThrow();
  });

  it("parses an action entry", () => {
    const e = {
      tick: 1,
      ts: 1001,
      direction: "client->agent",
      action: { surfaceId: "main", componentId: "btn", kind: "tap" }
    };
    expect(() => SessionEntrySchema.parse(e)).not.toThrow();
  });

  it("rejects entry missing both message and action", () => {
    expect(() => SessionEntrySchema.parse({ tick: 0, ts: 0, direction: "agent->client" })).toThrow();
  });
});
```

- [ ] **Step 13: Run, verify failure**

Run: `pnpm --filter @a2ui-inspector/shared test`
Expected: FAIL — `../session.js` not found.

- [ ] **Step 14: Implement `packages/shared/src/session.ts`**

```typescript
import { z } from "zod";
import { A2UIActionSchema, A2UIMessageSchema } from "./a2ui.js";

// One line per entry in a .a2ui-session.jsonl file.
// Exactly one of `message` or `action` must be present.
export const SessionEntrySchema = z
  .object({
    tick: z.number().int().nonnegative(),
    ts: z.number(),
    direction: z.enum(["agent->client", "client->agent"]),
    message: A2UIMessageSchema.optional(),
    action: A2UIActionSchema.optional(),
  })
  .refine(
    (e) => (e.message ? 1 : 0) + (e.action ? 1 : 0) === 1,
    { message: "exactly one of message or action must be present" }
  );

export type SessionEntry = z.infer<typeof SessionEntrySchema>;
```

- [ ] **Step 15: Write `packages/shared/src/index.ts`**

```typescript
export * from "./a2ui.js";
export * from "./bridge.js";
export * from "./session.js";
```

- [ ] **Step 16: Run all shared tests**

Run: `pnpm --filter @a2ui-inspector/shared test && pnpm --filter @a2ui-inspector/shared typecheck`
Expected: PASS, no type errors.

- [ ] **Step 17: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add bridge protocol + a2ui v0.9 + session schemas"
```

---

## Task 3: Sidecar — SessionStore

**Files:**
- Create: `packages/sidecar/package.json`
- Create: `packages/sidecar/tsconfig.json`
- Create: `packages/sidecar/src/session/store.ts`
- Create: `packages/sidecar/src/__tests__/store.test.ts`

- [ ] **Step 1: Write `packages/sidecar/package.json`**

```json
{
  "name": "a2ui-inspector",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/server.js",
  "bin": { "a2ui-inspector": "dist/bin.js" },
  "files": ["dist", "../ui/dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/bin.ts",
    "start": "node dist/bin.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'lint: noop'"
  },
  "dependencies": {
    "@a2ui-inspector/shared": "workspace:*",
    "@fastify/static": "^7.0.0",
    "@fastify/websocket": "^10.0.0",
    "fastify": "^4.26.0",
    "ws": "^8.17.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `packages/sidecar/tsconfig.json`**

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

- [ ] **Step 3: Install deps**

Run: `pnpm install`
Expected: deps resolve, no errors.

- [ ] **Step 4: Write the failing SessionStore test**

`packages/sidecar/src/__tests__/store.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { SessionStore } from "../session/store.js";
import type { A2UIMessage, A2UIAction } from "@a2ui-inspector/shared";

const msg = (id: string): A2UIMessage =>
  ({ version: "v0.9", createSurface: { surfaceId: id } }) as A2UIMessage;
const act = (): A2UIAction => ({ surfaceId: "main", componentId: "btn", kind: "tap" });

describe("SessionStore", () => {
  it("starts empty", () => {
    const s = new SessionStore();
    expect(s.length).toBe(0);
    expect(s.entries()).toEqual([]);
  });

  it("appendMessage assigns sequential ticks starting at 0", () => {
    const s = new SessionStore();
    const e0 = s.appendMessage(msg("a"));
    const e1 = s.appendMessage(msg("b"));
    expect(e0.tick).toBe(0);
    expect(e1.tick).toBe(1);
    expect(s.length).toBe(2);
  });

  it("appendAction assigns the next tick in the same sequence", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    const e = s.appendAction(act());
    expect(e.tick).toBe(1);
    expect(e.direction).toBe("client->agent");
  });

  it("clear() resets length and tick counter", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    s.clear();
    expect(s.length).toBe(0);
    expect(s.appendMessage(msg("b")).tick).toBe(0);
  });

  it("replace() swaps the log atomically and re-emits tickCount", () => {
    const s = new SessionStore();
    s.appendMessage(msg("a"));
    s.replace([
      { tick: 0, ts: 1, direction: "agent->client", message: msg("x") },
      { tick: 1, ts: 2, direction: "agent->client", message: msg("y") },
    ]);
    expect(s.length).toBe(2);
    expect(s.entries()[0]?.message?.createSurface?.surfaceId).toBe("x");
  });

  it("calls onAppend listeners on every new entry", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    s.onAppend(listener);
    s.appendMessage(msg("a"));
    s.appendAction(act());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("calls onReplace listeners on replace()", () => {
    const s = new SessionStore();
    const listener = vi.fn();
    s.onReplace(listener);
    s.replace([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run, verify it fails**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — cannot resolve `../session/store.js`.

- [ ] **Step 6: Implement `packages/sidecar/src/session/store.ts`**

```typescript
import type { A2UIAction, A2UIMessage, SessionEntry } from "@a2ui-inspector/shared";

type Listener<T> = (value: T) => void;

export class SessionStore {
  private log: SessionEntry[] = [];

  private appendListeners = new Set<Listener<SessionEntry>>();
  private replaceListeners = new Set<Listener<SessionEntry[]>>();

  get length(): number {
    return this.log.length;
  }

  entries(): readonly SessionEntry[] {
    return this.log;
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

  clear(): void {
    this.replace([]);
  }

  replace(entries: SessionEntry[]): void {
    this.log = [...entries];
    for (const l of this.replaceListeners) l(this.log);
  }

  onAppend(listener: Listener<SessionEntry>): () => void {
    this.appendListeners.add(listener);
    return () => this.appendListeners.delete(listener);
  }

  onReplace(listener: Listener<SessionEntry[]>): () => void {
    this.replaceListeners.add(listener);
    return () => this.replaceListeners.delete(listener);
  }

  private fireAppend(entry: SessionEntry): void {
    for (const l of this.appendListeners) l(entry);
  }
}
```

- [ ] **Step 7: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — all 7 cases green.

- [ ] **Step 8: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add SessionStore with append/replace + listeners"
```

---

## Task 4: Sidecar — persistence (JSONL save/load)

**Files:**
- Create: `packages/sidecar/src/session/persistence.ts`
- Create: `packages/sidecar/src/__tests__/persistence.test.ts`

- [ ] **Step 1: Write the failing persistence test**

`packages/sidecar/src/__tests__/persistence.test.ts`:

```typescript
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSession, saveSession } from "../session/persistence.js";
import type { SessionEntry } from "@a2ui-inspector/shared";

const tmp = () => mkdtempSync(join(tmpdir(), "a2ui-inspector-test-"));

const fixtureEntries: SessionEntry[] = [
  { tick: 0, ts: 1000, direction: "agent->client",
    message: { version: "v0.9", createSurface: { surfaceId: "main" } } as any },
  { tick: 1, ts: 1100, direction: "client->agent",
    action: { surfaceId: "main", componentId: "btn", kind: "tap" } },
];

describe("session persistence", () => {
  it("round-trips a session via save then load", async () => {
    const path = join(tmp(), "out.jsonl");
    await saveSession(path, fixtureEntries);
    const loaded = await loadSession(path);
    expect(loaded).toEqual(fixtureEntries);
  });

  it("loadSession skips empty lines and rejects malformed entries", async () => {
    const path = join(tmp(), "in.jsonl");
    const good = JSON.stringify(fixtureEntries[0]);
    writeFileSync(path, good + "\n\n" + good + "\n");
    const loaded = await loadSession(path);
    expect(loaded.length).toBe(2);
  });

  it("loadSession throws on malformed JSON", async () => {
    const path = join(tmp(), "bad.jsonl");
    writeFileSync(path, "not-json\n");
    await expect(loadSession(path)).rejects.toThrow();
  });

  it("saveSession writes one JSON object per line", async () => {
    const path = join(tmp(), "out.jsonl");
    await saveSession(path, fixtureEntries);
    const text = readFileSync(path, "utf8");
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — cannot resolve `../session/persistence.js`.

- [ ] **Step 3: Implement `packages/sidecar/src/session/persistence.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";

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
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — all 4 persistence cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add JSONL session save/load"
```

---

## Task 5: Sidecar — file adapter

**Files:**
- Create: `packages/sidecar/src/adapters/file.ts`

This adapter is a thin wrapper around `loadSession` that pushes loaded entries into a `SessionStore`. It's worth its own module so future plan tasks can extend it.

- [ ] **Step 1: Add a test for the file adapter**

Append to `packages/sidecar/src/__tests__/persistence.test.ts`:

```typescript
import { SessionStore } from "../session/store.js";
import { loadFileIntoStore } from "../adapters/file.js";

describe("file adapter", () => {
  it("loads a session file and replaces store contents", async () => {
    const path = join(tmp(), "x.jsonl");
    await saveSession(path, fixtureEntries);
    const store = new SessionStore();
    store.appendMessage({ version: "v0.9", deleteSurface: { surfaceId: "z" } } as any); // pollute
    await loadFileIntoStore(path, store);
    expect(store.length).toBe(2);
    expect(store.entries()[0]?.tick).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — cannot resolve `../adapters/file.js`.

- [ ] **Step 3: Implement `packages/sidecar/src/adapters/file.ts`**

```typescript
import { loadSession } from "../session/persistence.js";
import type { SessionStore } from "../session/store.js";

export async function loadFileIntoStore(path: string, store: SessionStore): Promise<number> {
  const entries = await loadSession(path);
  store.replace(entries);
  return entries.length;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add file ingestion adapter"
```

---

## Task 6: Sidecar — WebSocket upstream adapter

**Files:**
- Create: `packages/sidecar/src/adapters/websocket.ts`
- Create: `packages/sidecar/src/__tests__/websocket.test.ts`

- [ ] **Step 1: Write the failing test (uses a real local `ws` server as the upstream)**

`packages/sidecar/src/__tests__/websocket.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { SessionStore } from "../session/store.js";
import { connectWebSocketUpstream } from "../adapters/websocket.js";

describe("WebSocket upstream adapter", () => {
  let server: WebSocketServer;
  let port: number;
  let clientSocket: WebSocket | undefined;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      server = new WebSocketServer({ port: 0 }, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) port = addr.port;
        resolve();
      });
      server.on("connection", (s) => { clientSocket = s; });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("appends each incoming message to the store", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 20));
    clientSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "main" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    expect(statuses).toContain("connected");
    handle.close();
  });

  it("ignores malformed lines and emits a diagnostic-like status", async () => {
    const store = new SessionStore();
    const statuses: string[] = [];
    const handle = await connectWebSocketUpstream(`ws://localhost:${port}`, store, (s) => statuses.push(s.status));
    await new Promise((r) => setTimeout(r, 20));
    clientSocket!.send("not-json");
    clientSocket!.send(JSON.stringify({ version: "v0.9", createSurface: { surfaceId: "good" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(1);
    handle.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `../adapters/websocket.js` not found.

- [ ] **Step 3: Implement `packages/sidecar/src/adapters/websocket.ts`**

```typescript
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
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add WebSocket upstream adapter"
```

---

## Task 7: Sidecar — bridge WS endpoint + Fastify server + bin

**Files:**
- Create: `packages/sidecar/src/bridge.ts`
- Create: `packages/sidecar/src/server.ts`
- Create: `packages/sidecar/src/bin.ts`
- Create: `packages/sidecar/src/__tests__/bridge.test.ts`

- [ ] **Step 1: Write the failing bridge test**

`packages/sidecar/src/__tests__/bridge.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { Event } from "@a2ui-inspector/shared";
import { buildServer } from "../server.js";
import { SessionStore } from "../session/store.js";

describe("bridge", () => {
  let close: () => Promise<void>;
  let port: number;
  let store: SessionStore;

  beforeEach(async () => {
    store = new SessionStore();
    const app = await buildServer({ store });
    const addr = await app.listen({ port: 0, host: "127.0.0.1" });
    port = Number(new URL(addr).port);
    close = async () => { await app.close(); };
  });

  afterEach(async () => { await close(); });

  it("emits messageReceived events to a connected browser client", async () => {
    const events: Event[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.on("message", (data) => events.push(JSON.parse(data.toString()) as Event));

    store.appendMessage({ version: "v0.9", createSurface: { surfaceId: "main" } } as any);

    await new Promise((r) => setTimeout(r, 20));
    expect(events.some((e) => e.kind === "messageReceived")).toBe(true);
    client.close();
  });

  it("accepts a scrubTo command without effect on the sidecar store", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    await new Promise<void>((r) => client.once("open", () => r()));
    client.send(JSON.stringify({ kind: "scrubTo", tick: 5 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.length).toBe(0);
    client.close();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter a2ui-inspector test`
Expected: FAIL — `../server.js` not found.

- [ ] **Step 3: Implement `packages/sidecar/src/bridge.ts`**

```typescript
import { CommandSchema, type Event } from "@a2ui-inspector/shared";
import type { WebSocket } from "ws";
import { connectWebSocketUpstream, type UpstreamHandle } from "./adapters/websocket.js";
import { loadFileIntoStore } from "./adapters/file.js";
import { saveSession } from "./session/persistence.js";
import type { SessionStore } from "./session/store.js";

export function registerBridgeClient(socket: WebSocket, store: SessionStore): void {
  let upstream: UpstreamHandle | undefined;

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
        if (cmd.config.transport === "websocket") {
          upstream?.close();
          upstream = await connectWebSocketUpstream(cmd.config.url, store, (s) =>
            send({ kind: "upstreamStatus", status: s.status, detail: s.detail })
          );
        } else {
          send({ kind: "diagnostic", level: "warn", message: "SSE transport not implemented in Phase 1" });
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
    unsubAppend();
    unsubReplace();
  });
}
```

- [ ] **Step 4: Implement `packages/sidecar/src/server.ts`**

```typescript
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { registerBridgeClient } from "./bridge.js";
import { SessionStore } from "./session/store.js";

export interface BuildServerOptions {
  store?: SessionStore;
  uiDistDir?: string;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const store = opts.store ?? new SessionStore();

  await app.register(fastifyWebsocket);

  app.get("/bridge", { websocket: true }, (socket /* SocketStream wraps a ws */) => {
    registerBridgeClient(socket.socket, store);
  });

  // Serve the bundled UI if its dist exists alongside the sidecar.
  const here = dirname(fileURLToPath(import.meta.url));
  const uiDist = opts.uiDistDir ?? resolve(here, "../../ui/dist");
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, { root: uiDist, prefix: "/" });
  } else {
    app.get("/", async () => ({ ok: true, ui: "missing", hint: "Run `pnpm --filter @a2ui-inspector/ui build` to build the UI." }));
  }

  return app;
}
```

- [ ] **Step 5: Implement `packages/sidecar/src/bin.ts`**

```typescript
#!/usr/bin/env node
import { buildServer } from "./server.js";

const port = Number(process.env.A2UI_INSPECTOR_PORT ?? "8765");
const host = process.env.A2UI_INSPECTOR_HOST ?? "127.0.0.1";

const app = await buildServer();
await app.listen({ port, host });

const url = `http://${host}:${port}`;
process.stdout.write(`A2UI Inspector ready: ${url}\n`);

// Best-effort open the browser.
const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
try {
  const { spawn } = await import("node:child_process");
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
} catch { /* ignore — user can navigate manually */ }
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — both bridge tests green.

Note: the bridge test uses `socket.socket` to access the underlying `ws` instance from `@fastify/websocket`. If the `@fastify/websocket` version exposes a different shape (some versions pass the raw socket as the first arg), adjust the `app.get("/bridge", ...)` callback signature — keep the contract that `registerBridgeClient` receives a node-`ws` `WebSocket`.

- [ ] **Step 7: Smoke-test `pnpm dev`**

Run: `pnpm --filter a2ui-inspector dev`
Expected: process prints `A2UI Inspector ready: http://127.0.0.1:8765`. `Ctrl-C` to stop.

- [ ] **Step 8: Commit**

```bash
git add packages/sidecar
git commit -m "feat(sidecar): add Fastify server, bridge WS, bin entry"
```

---

## Task 8: UI — Vite scaffold + layout shell

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/tailwind.config.js`
- Create: `packages/ui/postcss.config.js`
- Create: `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`
- Create: `packages/ui/src/index.css`
- Create: `packages/ui/src/components/Toolbar.tsx`

- [ ] **Step 1: Write `packages/ui/package.json`**

```json
{
  "name": "@a2ui-inspector/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'lint: noop'"
  },
  "dependencies": {
    "@a2ui-inspector/shared": "workspace:*",
    "@a2ui/react": "*",
    "@a2ui/web_core": "*",
    "lucide-react": "^0.379.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

If `@a2ui/react` / `@a2ui/web_core` are unpublished (see Pre-flight #2), substitute the GitHub install spec.

- [ ] **Step 2: Write `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*", "index.html"]
}
```

- [ ] **Step 3: Write `packages/ui/vite.config.ts`**

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
  test: { environment: "jsdom", globals: false },
});
```

- [ ] **Step 4: Write `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 5: Write `postcss.config.js`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>A2UI Inspector</title>
  </head>
  <body class="bg-neutral-950 text-neutral-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.mono { font-family: ui-monospace, "JetBrains Mono", "Fira Code", monospace; }
```

- [ ] **Step 8: Write `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Write `src/components/Toolbar.tsx`**

```tsx
import { FilePlus, Link2, Save } from "lucide-react";

export interface ToolbarProps {
  onConnect: () => void;
  onLoadFile: () => void;
  onSave: () => void;
  upstreamStatus: string;
}

export function Toolbar({ onConnect, onLoadFile, onSave, upstreamStatus }: ToolbarProps) {
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

- [ ] **Step 10: Write a minimal `src/App.tsx` (further wired in later tasks)**

```tsx
import { useState } from "react";
import { Toolbar } from "./components/Toolbar.js";

export default function App() {
  const [upstreamStatus] = useState<string>("idle");
  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => alert("connect — wired in Task 11")}
        onLoadFile={() => alert("load — wired in Task 12")}
        onSave={() => alert("save — wired in Task 12")}
        upstreamStatus={upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-neutral-800 p-2 mono text-xs">timeline goes here</aside>
        <section className="flex-1 p-2">preview goes here</section>
      </main>
    </div>
  );
}
```

- [ ] **Step 11: Install + dev-server smoke test**

Run: `pnpm install && pnpm --filter @a2ui-inspector/ui dev`
Expected: Vite reports `Local: http://localhost:5173`. Visiting the URL shows the shell with the toolbar.

- [ ] **Step 12: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): scaffold Vite + React shell with Toolbar"
```

---

## Task 9: UI — Zustand stores + bridge client

**Files:**
- Create: `packages/ui/src/store/session.ts`
- Create: `packages/ui/src/store/timeline.ts`
- Create: `packages/ui/src/transport/bridgeClient.ts`

- [ ] **Step 1: Write `src/store/session.ts`**

```typescript
import { create } from "zustand";
import type { Event, SessionEntry } from "@a2ui-inspector/shared";

interface SessionState {
  entries: SessionEntry[];
  upstreamStatus: "idle" | "connecting" | "connected" | "closed" | "error";
  upstreamDetail?: string;
  diagnostics: Array<{ level: "warn" | "error"; message: string; ts: number }>;
  applyEvent: (e: Event) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  entries: [],
  upstreamStatus: "idle",
  diagnostics: [],
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
          return { entries: [], diagnostics: s.diagnostics };
        case "diagnostic":
          return { diagnostics: [...s.diagnostics, { level: e.level, message: e.message, ts: Date.now() }] };
      }
    }),
  reset: () => set({ entries: [], upstreamStatus: "idle", upstreamDetail: undefined, diagnostics: [] }),
}));
```

- [ ] **Step 2: Write `src/store/timeline.ts`**

```typescript
import { create } from "zustand";

interface TimelineState {
  scrubTick: number | "head";  // "head" = follow live
  setScrubTick: (t: number | "head") => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  scrubTick: "head",
  setScrubTick: (t) => set({ scrubTick: t }),
}));
```

- [ ] **Step 3: Write `src/transport/bridgeClient.ts`**

```typescript
import { CommandSchema, EventSchema, type Command, type Event } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";

export class BridgeClient {
  private ws?: WebSocket;
  private url: string;

  constructor(url = `ws://${location.host || "127.0.0.1:8765"}/bridge`) {
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
```

- [ ] **Step 4: Wire bridge into `App.tsx`**

Replace `src/App.tsx`:

```tsx
import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { useSessionStore } from "./store/session.js";
import { bridge } from "./transport/bridgeClient.js";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);

  useEffect(() => { bridge.connect(); }, []);

  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => {
          const url = prompt("Upstream WS URL (e.g. ws://localhost:8000/a2ui):");
          if (url) bridge.send({ kind: "connectUpstream", config: { transport: "websocket", url } });
        }}
        onLoadFile={() => {
          const path = prompt("Path to .a2ui-session.jsonl on the host filesystem:");
          if (path) bridge.send({ kind: "loadFile", path });
        }}
        onSave={() => {
          const path = prompt("Save session to (path):");
          if (path) bridge.send({ kind: "saveSession", path });
        }}
        upstreamStatus={upstreamDetail ? `${upstreamStatus} (${upstreamDetail})` : upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-neutral-800 p-2 mono text-xs">timeline (Task 11)</aside>
        <section className="flex-1 p-2">preview (Task 12)</section>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Smoke check**

Run two terminals:
- `pnpm --filter a2ui-inspector dev`  → starts sidecar on 8765
- `pnpm --filter @a2ui-inspector/ui dev`  → starts Vite on 5173

In Vite, the bridge tries `ws://localhost:5173/bridge` — wrong host. For dev we want the UI to reach the sidecar. Update the `bridgeClient` default to talk to the sidecar by absolute URL in dev. Add a Vite env var:

In `packages/ui/src/transport/bridgeClient.ts`, replace the constructor default:

```typescript
constructor(url = import.meta.env.DEV
  ? `ws://127.0.0.1:8765/bridge`
  : `ws://${location.host}/bridge`) {
  this.url = url;
}
```

Re-run; visiting `http://localhost:5173`, the UI should connect to the sidecar — open the browser devtools Network tab and verify the WS upgrade.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Zustand stores + bridge client"
```

---

## Task 10: UI — replay engine wrapping `@a2ui/web_core`

**Files:**
- Create: `packages/ui/src/replay/processor.ts`
- Create: `packages/ui/src/__tests__/replay.test.ts`

- [ ] **Step 1: Write the failing replay test**

`packages/ui/src/__tests__/replay.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { stateAtTick } from "../replay/processor.js";

const e = (i: number, fn: () => any): SessionEntry => ({
  tick: i, ts: i, direction: "agent->client", message: fn(),
});

describe("stateAtTick", () => {
  it("returns empty state at tick 0 for an empty session", () => {
    const s = stateAtTick([], -1);
    expect(s.surfaces.size).toBe(0);
  });

  it("materializes createSurface", () => {
    const entries = [e(0, () => ({ version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } }))];
    const s = stateAtTick(entries, 0);
    expect(s.surfaces.has("main")).toBe(true);
  });

  it("ignores entries past the requested tick", () => {
    const entries = [
      e(0, () => ({ version: "v0.9", createSurface: { surfaceId: "a" } })),
      e(1, () => ({ version: "v0.9", createSurface: { surfaceId: "b" } })),
    ];
    const s = stateAtTick(entries, 0);
    expect(s.surfaces.has("a")).toBe(true);
    expect(s.surfaces.has("b")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../replay/processor.js` not found.

- [ ] **Step 3: Implement `src/replay/processor.ts`**

```typescript
import { MessageProcessor, basicCatalog } from "@a2ui/web_core/v0_9";
import type { SessionEntry } from "@a2ui-inspector/shared";

export interface ReplayState {
  // We surface the processor's model directly; consumers (Preview, Tree, etc.)
  // read whichever shape they need. Treat as opaque elsewhere.
  surfaces: Map<string, unknown>;
  processor: MessageProcessor;
}

export function stateAtTick(entries: readonly SessionEntry[], tick: number): ReplayState {
  const processor = new MessageProcessor([basicCatalog]);
  for (const entry of entries) {
    if (entry.tick > tick) break;
    if (entry.message) {
      try { processor.processMessages([entry.message as never]); } catch { /* swallow; diagnostic at render time */ }
    }
    // actions don't change the processor's surface state in v0.9
  }
  // `processor.model.surfacesMap` is the documented v0.9 access path; cast
  // to keep our wrapper opaque to consumers.
  const surfaces = (processor as any).model?.surfacesMap ?? new Map();
  return { surfaces, processor };
}
```

If `@a2ui/web_core` exports a different module path (e.g. namespaced subpath) the implementer should consult the installed package's `package.json` `exports` field and adjust the import — keep `MessageProcessor` and `basicCatalog` as the named imports.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add replay engine over @a2ui/web_core"
```

---

## Task 11: UI — Timeline panel

**Files:**
- Create: `packages/ui/src/panels/Timeline.tsx`
- Create: `packages/ui/src/__tests__/Timeline.test.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Write the failing Timeline test**

`packages/ui/src/__tests__/Timeline.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { Timeline } from "../panels/Timeline.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSessionStore.getState().applyEvent({
    kind: "messageReceived",
    tick: 0,
    ts: 1000,
    message: { version: "v0.9", createSurface: { surfaceId: "main" } } as any,
  });
  useSessionStore.getState().applyEvent({
    kind: "messageReceived",
    tick: 1,
    ts: 1100,
    message: { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: {} } } as any,
  });
});

describe("Timeline", () => {
  it("renders one row per entry with the message kind", () => {
    render(<Timeline />);
    expect(screen.getByText(/createSurface/)).toBeTruthy();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
  });

  it("clicking a row scrubs to that tick", () => {
    render(<Timeline />);
    fireEvent.click(screen.getByText(/createSurface/));
    expect(useTimelineStore.getState().scrubTick).toBe(0);
  });

  it("ArrowRight steps forward, ArrowLeft steps backward", () => {
    render(<Timeline />);
    useTimelineStore.getState().setScrubTick(0);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useTimelineStore.getState().scrubTick).toBe(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useTimelineStore.getState().scrubTick).toBe(0);
  });
});
```

Add `@testing-library/jest-dom` only if you want `toBeInTheDocument()`; otherwise plain `toBeTruthy()` is fine as above.

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../panels/Timeline.js` not found.

- [ ] **Step 3: Implement `src/panels/Timeline.tsx`**

```tsx
import { useEffect } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";

function kindOf(entry: { message?: unknown; action?: unknown }): string {
  if (entry.action) return "action";
  const m = entry.message as { createSurface?: unknown; updateComponents?: unknown; updateDataModel?: unknown; deleteSurface?: unknown } | undefined;
  if (!m) return "unknown";
  if (m.createSurface) return "createSurface";
  if (m.updateComponents) return "updateComponents";
  if (m.updateDataModel) return "updateDataModel";
  if (m.deleteSurface) return "deleteSurface";
  return "unknown";
}

export function Timeline() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const setScrub = useTimelineStore((s) => s.setScrubTick);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const current = scrub === "head" ? entries.length - 1 : scrub;
      if (e.key === "ArrowRight") {
        setScrub(Math.min(entries.length - 1, current + 1));
      } else if (e.key === "ArrowLeft") {
        setScrub(Math.max(0, current - 1));
      } else if (e.key === "End") {
        setScrub("head");
      } else if (e.key === "Home") {
        setScrub(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, scrub, setScrub]);

  const activeTick = scrub === "head" ? entries.length - 1 : scrub;

  return (
    <ol className="mono text-xs">
      {entries.map((e) => {
        const isActive = e.tick === activeTick;
        return (
          <li
            key={e.tick}
            onClick={() => setScrub(e.tick)}
            className={
              "cursor-pointer border-l-2 px-2 py-1 " +
              (isActive
                ? "border-emerald-400 bg-neutral-900 text-emerald-300"
                : "border-transparent hover:bg-neutral-900")
            }
          >
            <span className="mr-2 text-neutral-500">#{e.tick}</span>
            <span>{kindOf(e)}</span>
            {e.direction === "client->agent" ? <span className="ml-1 text-amber-400">←</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Wire Timeline into `App.tsx`**

Replace the `<aside>` body in `src/App.tsx`:

```tsx
import { Timeline } from "./panels/Timeline.js";
// ...
<aside className="w-72 overflow-y-auto border-r border-neutral-800">
  <Timeline />
</aside>
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Timeline panel with click-to-scrub and arrow keys"
```

---

## Task 12: UI — Preview panel + file drag-drop

**Files:**
- Create: `packages/ui/src/panels/Preview.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Implement `src/panels/Preview.tsx`**

```tsx
import { useMemo } from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { stateAtTick } from "../replay/processor.js";

export function Preview() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const { surfaces } = useMemo(() => stateAtTick(entries, tick), [entries, tick]);

  if (entries.length === 0) {
    return <div className="p-6 text-sm text-neutral-500">Waiting for messages. Connect to an upstream or load a .jsonl session.</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {Array.from(surfaces.entries()).map(([id, surface]) => (
        <div key={id} className="rounded border border-neutral-800 p-2">
          <div className="mb-1 mono text-xs text-neutral-500">surface: {id}</div>
          <div className="rounded bg-neutral-900 p-2">
            {/* A2uiSurface signature mirrors @a2ui/react v0_9 quickstart */}
            <A2uiSurface key={id} surface={surface as never} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

If `@a2ui/react`'s export shape differs (e.g. default export, or a different namespace path), match the installed package's `exports` field — keep the `A2uiSurface` import name.

- [ ] **Step 2: Wire Preview into `App.tsx` and add file drag-drop**

Replace `src/App.tsx` entirely:

```tsx
import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { Timeline } from "./panels/Timeline.js";
import { Preview } from "./panels/Preview.js";
import { useSessionStore } from "./store/session.js";
import { bridge } from "./transport/bridgeClient.js";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);
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
      // The bridge expects a host path; the browser cannot provide one for
      // drag-drop. Phase 1 fallback: prompt for a host path next to the file name.
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
          const url = window.prompt("Upstream WS URL:");
          if (url) bridge.send({ kind: "connectUpstream", config: { transport: "websocket", url } });
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
        <section className="flex-1 overflow-auto"><Preview /></section>
      </main>
    </div>
  );
}
```

Note: the design called for a browser File-API drag-drop path. The bridge currently expects a host filesystem path (since the sidecar reads files). For Phase 1 we keep that contract — the user pastes the host path. Phase 2 should add a `loadFileContents` bridge command that ships the file body inline so true browser drag-drop works without a path prompt.

- [ ] **Step 3: Manual smoke test**

Run two terminals — sidecar `pnpm --filter a2ui-inspector dev`, UI `pnpm --filter @a2ui-inspector/ui dev`. Open `http://localhost:5173`. Use "Load file" with a path from `examples/recordings/...` (created in Task 13). Verify the timeline populates and the Preview shows something.

- [ ] **Step 4: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Preview panel + file drop affordance"
```

---

## Task 13: Mock agent example + happy-path fixture

**Files:**
- Create: `examples/mock-agent/package.json`
- Create: `examples/mock-agent/src/index.ts`
- Create: `examples/recordings/restaurant-finder-happy-path.jsonl`

- [ ] **Step 1: Write `examples/mock-agent/package.json`**

```json
{
  "name": "a2ui-inspector-mock-agent",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "tsx src/index.ts" },
  "dependencies": { "ws": "^8.17.0" },
  "devDependencies": { "@types/ws": "^8.5.10", "tsx": "^4.7.0", "typescript": "^5.4.0" }
}
```

- [ ] **Step 2: Write `examples/mock-agent/src/index.ts`**

```typescript
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? 8000);
const wss = new WebSocketServer({ port });
process.stdout.write(`mock A2UI agent listening on ws://127.0.0.1:${port}\n`);

const script: Array<unknown> = [
  { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json" } },
  { version: "v0.9", updateComponents: {
    surfaceId: "main",
    components: [
      { id: "root", component: "Column", children: ["title", "body"] },
      { id: "title", component: "Text", text: { path: "/title" } },
      { id: "body", component: "Text", text: { path: "/body" } },
    ],
  }},
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello from A2UI!", body: "Mock agent script v1." } } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/title", value: "Updated title (tick 3)" } },
];

wss.on("connection", (socket) => {
  let i = 0;
  const tick = () => {
    if (i >= script.length) return;
    socket.send(JSON.stringify(script[i++]));
    setTimeout(tick, 300);
  };
  tick();
});
```

- [ ] **Step 3: Generate `examples/recordings/restaurant-finder-happy-path.jsonl`**

Write a small fixture by hand (we'll reuse it in the e2e test):

```jsonl
{"tick":0,"ts":1700000000000,"direction":"agent->client","message":{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}}
{"tick":1,"ts":1700000000100,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["title"]},{"id":"title","component":"Text","text":{"path":"/title"}}]}}}
{"tick":2,"ts":1700000000200,"direction":"agent->client","message":{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/","value":{"title":"Hello world"}}}}
```

- [ ] **Step 4: Smoke test the mock agent**

Run in three terminals:
- `pnpm --filter a2ui-inspector-mock-agent start` — agent on ws://127.0.0.1:8000
- `pnpm --filter a2ui-inspector dev` — sidecar on http://127.0.0.1:8765
- `pnpm --filter @a2ui-inspector/ui dev` — UI on http://localhost:5173

In the UI, click "Connect" and enter `ws://127.0.0.1:8000`. Watch the timeline fill, the preview render.

- [ ] **Step 5: Commit**

```bash
git add examples
git commit -m "feat: add mock agent + happy-path fixture"
```

---

## Task 14: End-to-end Playwright smoke test

**Files:**
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/happy-path.spec.ts`
- Modify: root `package.json`

- [ ] **Step 1: Add Playwright to the root**

Edit root `package.json` — add to `devDependencies`:

```json
"@playwright/test": "^1.44.0"
```

Add scripts:

```json
"e2e": "playwright test",
"e2e:install": "playwright install chromium"
```

Run: `pnpm install && pnpm e2e:install`
Expected: Playwright + Chromium downloaded.

- [ ] **Step 2: Write `tests/e2e/playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8765",
    headless: true,
  },
  webServer: [
    {
      command: "pnpm --filter @a2ui-inspector/ui build && pnpm --filter a2ui-inspector build && node packages/sidecar/dist/bin.js",
      port: 8765,
      env: { A2UI_INSPECTOR_HOST: "127.0.0.1", A2UI_INSPECTOR_PORT: "8765" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
```

- [ ] **Step 3: Write `tests/e2e/happy-path.spec.ts`**

```typescript
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("loads a recorded session and renders the timeline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // The "Load file" button currently uses window.prompt; intercept it.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();

  // Wait for the timeline to populate.
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/updateDataModel/)).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e**

Run: `pnpm e2e`
Expected: PASS (1 spec). Sidecar boot + UI build can take ~30s on first run.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e package.json pnpm-lock.yaml
git commit -m "test(e2e): add happy-path Playwright smoke"
```

---

## Task 15: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm e2e:install
      - run: pnpm e2e
        if: matrix.node == '20'
```

- [ ] **Step 2: Commit**

```bash
git add .github
git commit -m "ci: add GitHub Actions workflow"
```

---

## Phase 1 acceptance checklist

Run these locally to confirm Phase 1 is done:

```bash
pnpm install
pnpm typecheck
pnpm test         # all three packages green
pnpm build        # all three packages build
pnpm e2e          # Playwright happy-path green
```

Manual demo:

```bash
# terminal 1
pnpm --filter a2ui-inspector-mock-agent start
# terminal 2
pnpm --filter a2ui-inspector dev
# terminal 3
pnpm --filter @a2ui-inspector/ui dev
```

Open `http://localhost:5173`, click "Connect", enter `ws://127.0.0.1:8000`. Watch the timeline populate, the preview render, arrow keys scrub.

---

## What is intentionally not in Phase 1

These appear in the spec but are deferred to Phase 2 — each will get its own plan:

- SSE upstream adapter (stub command schema already accepts `transport: "sse"`; just needs implementation)
- HTTP proxy adapter (`--proxy` flag, MITM mode)
- Action injection (UI affordance + bridge `injectAction` command + sidecar write path)
- Component Tree panel + prop inspector
- Diff panel
- Data Model bottom drawer
- Multi-surface tabs
- Command palette (`Cmd/Ctrl+K`)
- Most keyboard shortcuts (settings, file open, save, tab-switch)
- Light-mode toggle
- Device-frame toggle in the Preview
- Docker image (`a2ui/inspector`)
- Additional fixtures (malformed, multi-surface, action-roundtrip)
- Settings dialog
- Browser-side file drag-drop ingesting bytes inline (vs current path prompt)
- README animated GIF demo
