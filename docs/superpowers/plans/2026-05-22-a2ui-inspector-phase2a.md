# A2UI Inspector — Phase 2a: Make the Inspector Inspect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken live Preview, then add the three inspection panels (Component Tree, Data Model, Diff) and multi-surface tabs so the tool becomes a real debugger rather than a timeline viewer.

**Architecture:** Build on the Phase 1 monorepo. Introduce one new pure module — `replay/surfaceView.ts` — that converts an opaque `@a2ui/web_core` `SurfaceModel` into a stable, inspector-owned `SurfaceView` shape. Every new panel consumes `SurfaceView`, never `@a2ui/web_core` internals directly, so the panels are testable without the renderer and insulated from upstream churn. A new `selection` Zustand store tracks the active surface + component.

**Tech Stack:** Existing — TypeScript 5, React 18, Zustand 4, Vite 5, Vitest, Tailwind, `@a2ui/web_core`, `@a2ui/react`.

---

## Phase 2a scope

**In scope:**
- Fix the production-bundle `<A2uiSurface>` render failure (React #130)
- `replay/surfaceView.ts` — typed `SurfaceView` accessor over `@a2ui/web_core` `SurfaceModel`
- `store/selection.ts` — active surface + component selection
- Component Tree panel (tree view + prop inspector)
- Data Model drawer (collapsible JSON tree at the scrubbed tick)
- Diff panel (changed components + data-model paths between adjacent ticks)
- Multi-surface tabs + main-pane tab bar (Preview | Tree | Diff)

**Deferred to Phase 2b:** SSE adapter, HTTP proxy adapter, action injection.
**Deferred to Phase 2c:** command palette, extra keyboard shortcuts, light-mode toggle, device-frame toggle, Docker image, extra fixtures.

## Starting state

- Branch off `main` after PR #1 (Phase 1) is merged. If PR #1 is not yet merged, branch off `phase1-impl`.
- Working directory: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`
- Phase 1 gives you: `packages/{shared,sidecar,ui}`, a working sidecar, a UI with `Timeline` + `Preview` panels, `replay/processor.ts` exposing `stateAtTick(entries, tick) → { surfaces: Map<string, unknown>, processor }`.
- Known bug: in the production Vite bundle, `<A2uiSurface>` throws React error #130; a `SurfaceErrorBoundary` in `panels/Preview.tsx` currently catches it.

## File structure after Phase 2a

```
packages/ui/src/
├── replay/
│   ├── processor.ts            (existing — unchanged)
│   ├── surfaceView.ts          NEW — SurfaceModel → SurfaceView adapter
│   └── diff.ts                 NEW — diffSurfaceViews()
├── store/
│   ├── session.ts              (existing)
│   ├── timeline.ts             (existing)
│   └── selection.ts            NEW — active surface + component
├── panels/
│   ├── Timeline.tsx            (existing)
│   ├── Preview.tsx             (modified — multi-surface tab aware)
│   ├── ComponentTree.tsx       NEW
│   ├── DataModel.tsx           NEW
│   └── Diff.tsx                NEW
├── components/
│   ├── Toolbar.tsx             (existing)
│   ├── MainPaneTabs.tsx        NEW — Preview | Tree | Diff switcher
│   └── JsonTree.tsx            NEW — shared collapsible JSON renderer
├── store/mainPane.ts           NEW — which main-pane tab is active
└── App.tsx                     (modified)
```

## Pre-flight notes

1. The exact shape of `@a2ui/web_core`'s `SurfaceModel` is not known at plan-writing time. **Task 2 is an inspect-and-adapt task** — it reads the installed package's types and produces the stable `SurfaceView`. Every later task depends only on `SurfaceView`, defined precisely below.
2. Run `pnpm test` after each task — Phase 1's 42 tests must stay green.
3. Commit after every task.

---

## Task 1: Fix the production-bundle `<A2uiSurface>` render bug

**Files:**
- Investigate: `packages/ui/package.json`, `packages/ui/vite.config.ts`, `node_modules/@a2ui/*`
- Modify: likely `packages/ui/package.json` and/or `packages/ui/vite.config.ts`
- Modify: `tests/e2e/happy-path.spec.ts`

This is a debugging task — follow the procedure, do not guess.

- [ ] **Step 1: Reproduce**

```bash
pnpm --filter @a2ui-inspector/ui build
pnpm --filter a2ui-inspector build
node packages/sidecar/dist/bin.js &
```

Open `http://127.0.0.1:8765`, load `examples/recordings/restaurant-finder-happy-path.jsonl` via the toolbar. Open browser devtools console. Confirm React error #130 ("Element type is invalid… got: undefined"). Kill the server.

- [ ] **Step 2: Diagnose the import**

```bash
cat node_modules/@a2ui/react/package.json
cat node_modules/@a2ui/web_core/package.json
ls node_modules/@a2ui/markdown-it 2>/dev/null && cat node_modules/@a2ui/markdown-it/package.json
```

Inspect each package's `exports` map. Determine: (a) is `@a2ui/react`'s `./v0_9` subpath ESM or CJS, (b) does `@a2ui/react` import `@a2ui/web_core` or `@a2ui/markdown-it` in a way that breaks when Vite pre-bundles it, (c) is the `@a2ui/markdown-it` peer-dep on `@a2ui/web_core@^0.9.2` (vs installed `0.10.0`) causing a dual-instance or missing-export problem.

- [ ] **Step 3: Apply the most likely fix, in this priority order**

Try fixes in order; stop at the first that makes Step 5 pass.

**Fix A — align versions.** If `@a2ui/markdown-it` requires `@a2ui/web_core@^0.9.2`, find a trio of `@a2ui/react` + `@a2ui/web_core` + `@a2ui/markdown-it` versions that mutually satisfy peers (`npm view @a2ui/react versions`, `npm view @a2ui/web_core versions`). Pin exact compatible versions in `packages/ui/package.json`, re-run `pnpm install`.

**Fix B — Vite optimizeDeps.** Add to `packages/ui/vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["@a2ui/react", "@a2ui/web_core", "@a2ui/react/v0_9", "@a2ui/web_core/v0_9"] },
  build: { outDir: "dist", emptyOutDir: true, commonjsOptions: { transformMixedEsModules: true } },
  server: { port: 5173 },
  test: { environment: "jsdom", globals: false, setupFiles: ["./src/__tests__/setup.ts"] },
});
```

**Fix C — pnpm dedupe.** If two copies of `@a2ui/web_core` are installed (`pnpm why @a2ui/web_core` shows multiple), add a `pnpm.overrides` block to the **root** `package.json` forcing a single version:

```json
"pnpm": { "overrides": { "@a2ui/web_core": "0.10.0" } }
```

Re-run `pnpm install`.

- [ ] **Step 4: Rebuild**

```bash
pnpm --filter @a2ui-inspector/ui build
pnpm --filter a2ui-inspector build
```

- [ ] **Step 5: Verify the render works**

```bash
node packages/sidecar/dist/bin.js &
```

Open `http://127.0.0.1:8765`, load the fixture, confirm the Preview pane shows rendered text (the fixture's `updateDataModel` sets `title: "Hello world"` — that string should appear). No React #130 in console. Kill the server.

- [ ] **Step 6: Restore the e2e to assert DOM, not WS frames**

Phase 1's `tests/e2e/happy-path.spec.ts` was weakened to assert WebSocket frames because the render was broken. Restore it to assert the rendered DOM:

```typescript
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("loads a recorded session and renders the timeline + preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();

  // Timeline populates.
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/updateDataModel/)).toBeVisible();

  // Preview renders the data-model-bound text.
  await expect(page.getByText("Hello world")).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 7: Run the e2e**

Run: `pnpm e2e`
Expected: 1 spec PASSED, including the new "Hello world" assertion.

- [ ] **Step 8: Commit**

```bash
git add packages/ui tests/e2e
git commit -m "fix(ui): resolve @a2ui/react production render failure; restore DOM-level e2e"
```

If after all three fixes the render still fails, STOP and report BLOCKED with the diagnosis from Step 2 — do not ship a fake fix.

---

## Task 2: `SurfaceView` accessor

**Files:**
- Create: `packages/ui/src/replay/surfaceView.ts`
- Create: `packages/ui/src/__tests__/surfaceView.test.ts`

This task converts the opaque `@a2ui/web_core` `SurfaceModel` into a stable inspector-owned shape. Every later panel depends on it.

**The stable output type (all later tasks reference exactly this):**

```typescript
export interface ComponentNode {
  id: string;
  type: string;                       // component type name, e.g. "Column", "Text"
  childIds: string[];                 // ordered child component ids
  props: Record<string, unknown>;     // component props EXCLUDING children
}

export interface SurfaceView {
  surfaceId: string;
  rootId: string | undefined;
  components: Map<string, ComponentNode>;
  dataModel: unknown;                 // the surface's data model as a plain JSON value
}
```

- [ ] **Step 1: Inspect the actual `SurfaceModel` shape**

```bash
cat packages/ui/node_modules/@a2ui/web_core/v0_9/*.d.ts 2>/dev/null | grep -A30 "SurfaceModel" | head -60
ls packages/ui/node_modules/@a2ui/web_core/v0_9/
```

Find how to read, from a `SurfaceModel` instance: the root component id, the component map (id → component with type/children/props), and the data model object. The Phase 1 `replay/processor.ts` already reaches `processor.model.surfacesMap` whose values are `SurfaceModel`. Note the real property names — you will need them in Step 3.

- [ ] **Step 2: Write the failing test**

`packages/ui/src/__tests__/surfaceView.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";

const e = (i: number, msg: unknown): SessionEntry => ({
  tick: i, ts: i, direction: "agent->client", message: msg as never,
});

const buildEntries = (): SessionEntry[] => [
  e(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } }),
  e(1, { version: "v0.9", updateComponents: { surfaceId: "main", components: [
    { id: "root", component: "Column", children: ["title"] },
    { id: "title", component: "Text" },
  ] } }),
  e(2, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello" } } }),
];

describe("toSurfaceView", () => {
  it("exposes rootId, components map, and dataModel", () => {
    const { surfaces } = stateAtTick(buildEntries(), 2);
    const model = surfaces.get("main");
    expect(model).toBeDefined();
    const view = toSurfaceView("main", model);
    expect(view.surfaceId).toBe("main");
    expect(view.components.size).toBeGreaterThanOrEqual(2);
    expect(view.components.has("root")).toBe(true);
    expect(view.components.get("root")?.type).toBe("Column");
    expect(view.components.get("root")?.childIds).toContain("title");
    expect(view.dataModel).toEqual({ title: "Hello" });
  });

  it("returns an empty view for an undefined model", () => {
    const view = toSurfaceView("ghost", undefined);
    expect(view.surfaceId).toBe("ghost");
    expect(view.components.size).toBe(0);
    expect(view.rootId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../replay/surfaceView.js` not found.

- [ ] **Step 4: Implement `packages/ui/src/replay/surfaceView.ts`**

Implement using the real property names found in Step 1. The skeleton below shows the structure; replace the `/* from Step 1 */` accesses with the actual ones. The component `type` in A2UI v0.9 may be a string OR an object keyed by type name (`{ Column: {...} }`) — handle both, exactly as `panels/Timeline.tsx`'s `kindOf` does for messages.

```typescript
import type { ComponentNode, SurfaceView } from "./surfaceViewTypes.js";
export type { ComponentNode, SurfaceView } from "./surfaceViewTypes.js";

function componentType(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const keys = Object.keys(raw as object);
    if (keys.length === 1) return keys[0]!;
  }
  return "unknown";
}

export function toSurfaceView(surfaceId: string, model: unknown): SurfaceView {
  const empty: SurfaceView = { surfaceId, rootId: undefined, components: new Map(), dataModel: undefined };
  if (!model || typeof model !== "object") return empty;

  const m = model as Record<string, unknown>;
  const components = new Map<string, ComponentNode>();

  // Replace the next lines with the real SurfaceModel accessors from Step 1.
  const rawComponents = /* from Step 1: the id→component map */ (m["components"] ?? m["componentsMap"]) as
    | Map<string, unknown>
    | Record<string, unknown>
    | undefined;
  const rootId = /* from Step 1 */ (m["root"] ?? m["rootId"]) as string | undefined;
  const dataModel = /* from Step 1 */ m["dataModel"] ?? m["data"];

  const iterable: Array<[string, unknown]> = rawComponents instanceof Map
    ? Array.from(rawComponents.entries())
    : rawComponents
      ? Object.entries(rawComponents)
      : [];

  for (const [id, rawComp] of iterable) {
    const comp = (rawComp ?? {}) as Record<string, unknown>;
    const innerType = componentType(comp["component"] ?? comp["type"] ?? comp);
    const childIds = Array.isArray(comp["children"])
      ? (comp["children"] as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(comp)) {
      if (k === "children" || k === "id") continue;
      props[k] = v;
    }
    components.set(id, { id, type: innerType, childIds, props });
  }

  return { surfaceId, rootId, components, dataModel };
}
```

Also create `packages/ui/src/replay/surfaceViewTypes.ts` holding the two interfaces (so `diff.ts` can import the types without importing the adapter):

```typescript
export interface ComponentNode {
  id: string;
  type: string;
  childIds: string[];
  props: Record<string, unknown>;
}

export interface SurfaceView {
  surfaceId: string;
  rootId: string | undefined;
  components: Map<string, ComponentNode>;
  dataModel: unknown;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: both `surfaceView` tests pass. If the first test fails because the real `SurfaceModel` property names differ from the guesses, fix the accessors in Step 4 — the test is the contract.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add SurfaceView accessor over @a2ui/web_core SurfaceModel"
```

---

## Task 3: Selection + main-pane stores

**Files:**
- Create: `packages/ui/src/store/selection.ts`
- Create: `packages/ui/src/store/mainPane.ts`
- Create: `packages/ui/src/__tests__/selectionStore.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/selectionStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useSelectionStore } from "../store/selection.js";
import { useMainPaneStore } from "../store/mainPane.js";

beforeEach(() => {
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  useMainPaneStore.setState({ tab: "preview" });
});

describe("selection store", () => {
  it("defaults to no selection", () => {
    expect(useSelectionStore.getState().surfaceId).toBeUndefined();
    expect(useSelectionStore.getState().componentId).toBeUndefined();
  });

  it("selectSurface sets surface and clears component", () => {
    useSelectionStore.getState().selectComponent("main", "btn");
    useSelectionStore.getState().selectSurface("other");
    expect(useSelectionStore.getState().surfaceId).toBe("other");
    expect(useSelectionStore.getState().componentId).toBeUndefined();
  });

  it("selectComponent sets both", () => {
    useSelectionStore.getState().selectComponent("main", "root");
    expect(useSelectionStore.getState().surfaceId).toBe("main");
    expect(useSelectionStore.getState().componentId).toBe("root");
  });
});

describe("main pane store", () => {
  it("defaults to preview", () => {
    expect(useMainPaneStore.getState().tab).toBe("preview");
  });

  it("setTab switches", () => {
    useMainPaneStore.getState().setTab("tree");
    expect(useMainPaneStore.getState().tab).toBe("tree");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — store modules not found.

- [ ] **Step 3: Implement `packages/ui/src/store/selection.ts`**

```typescript
import { create } from "zustand";

interface SelectionState {
  surfaceId: string | undefined;
  componentId: string | undefined;
  selectSurface: (surfaceId: string) => void;
  selectComponent: (surfaceId: string, componentId: string) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  surfaceId: undefined,
  componentId: undefined,
  selectSurface: (surfaceId) => set({ surfaceId, componentId: undefined }),
  selectComponent: (surfaceId, componentId) => set({ surfaceId, componentId }),
}));
```

- [ ] **Step 4: Implement `packages/ui/src/store/mainPane.ts`**

```typescript
import { create } from "zustand";

export type MainPaneTab = "preview" | "tree" | "diff";

interface MainPaneState {
  tab: MainPaneTab;
  setTab: (tab: MainPaneTab) => void;
}

export const useMainPaneStore = create<MainPaneState>((set) => ({
  tab: "preview",
  setTab: (tab) => set({ tab }),
}));
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 5 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add selection + main-pane Zustand stores"
```

---

## Task 4: Shared `JsonTree` component

**Files:**
- Create: `packages/ui/src/components/JsonTree.tsx`
- Create: `packages/ui/src/__tests__/JsonTree.test.tsx`

A collapsible JSON renderer reused by the Data Model drawer and the Component Tree prop inspector.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/JsonTree.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonTree } from "../components/JsonTree.js";

describe("JsonTree", () => {
  it("renders primitive values", () => {
    render(<JsonTree value={{ title: "Hello", count: 3, ok: true }} />);
    expect(screen.getByText(/"Hello"/)).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
    expect(screen.getByText(/true/)).toBeTruthy();
  });

  it("renders nested object keys", () => {
    render(<JsonTree value={{ user: { name: "Yvon" } }} />);
    expect(screen.getByText(/user/)).toBeTruthy();
    expect(screen.getByText(/name/)).toBeTruthy();
  });

  it("highlights changed paths passed via changedPaths", () => {
    render(<JsonTree value={{ a: 1, b: 2 }} changedPaths={new Set(["/b"])} />);
    const changed = screen.getByTestId("json-leaf-/b");
    expect(changed.className).toMatch(/emerald/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../components/JsonTree.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/components/JsonTree.tsx`**

```tsx
import { useState } from "react";

interface JsonTreeProps {
  value: unknown;
  /** JSON-Pointer paths whose leaves should be highlighted. */
  changedPaths?: Set<string>;
}

export function JsonTree({ value, changedPaths }: JsonTreeProps) {
  return <JsonNode value={value} path="" name={undefined} changedPaths={changedPaths} depth={0} />;
}

interface JsonNodeProps {
  value: unknown;
  path: string;
  name: string | undefined;
  changedPaths?: Set<string>;
  depth: number;
}

function JsonNode({ value, path, name, changedPaths, depth }: JsonNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const isObject = value !== null && typeof value === "object";
  const indent = { paddingLeft: `${depth * 12}px` };

  if (!isObject) {
    const changed = changedPaths?.has(path) ?? false;
    return (
      <div
        data-testid={`json-leaf-${path}`}
        style={indent}
        className={"mono text-xs " + (changed ? "text-emerald-300" : "text-neutral-300")}
      >
        {name !== undefined && <span className="text-sky-400">{name}: </span>}
        <span>{formatPrimitive(value)}</span>
      </div>
    );
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  return (
    <div>
      <div
        style={indent}
        className="mono text-xs cursor-pointer text-neutral-400 hover:text-neutral-200"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? "▾" : "▸"} </span>
        {name !== undefined ? <span className="text-sky-400">{name}</span> : <span>root</span>}
        <span className="text-neutral-600"> {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </div>
      {open &&
        entries.map(([k, v]) => (
          <JsonNode
            key={k}
            value={v}
            name={k}
            path={`${path}/${k}`}
            changedPaths={changedPaths}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function formatPrimitive(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  return String(v);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 3 JsonTree tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add reusable collapsible JsonTree component"
```

---

## Task 5: Component Tree panel

**Files:**
- Create: `packages/ui/src/panels/ComponentTree.tsx`
- Create: `packages/ui/src/__tests__/ComponentTree.test.tsx`

Renders the adjacency list at the scrubbed tick as a real tree from `rootId`, with a prop inspector for the selected node.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/ComponentTree.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ComponentTree } from "../panels/ComponentTree.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  const ev = (tick: number, message: unknown) =>
    useSessionStore.getState().applyEvent({ kind: "messageReceived", tick, ts: tick, message: message as never });
  ev(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } });
  ev(1, { version: "v0.9", updateComponents: { surfaceId: "main", components: [
    { id: "root", component: "Column", children: ["title"] },
    { id: "title", component: "Text" },
  ] } });
  ev(2, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hi" } } });
});

describe("ComponentTree", () => {
  it("renders component ids and types for the active surface", () => {
    render(<ComponentTree />);
    expect(screen.getByText(/root/)).toBeTruthy();
    expect(screen.getByText(/Column/)).toBeTruthy();
    expect(screen.getByText(/title/)).toBeTruthy();
    expect(screen.getByText(/Text/)).toBeTruthy();
  });

  it("clicking a node selects it", () => {
    render(<ComponentTree />);
    fireEvent.click(screen.getByText(/root/));
    expect(useSelectionStore.getState().componentId).toBe("root");
  });

  it("shows the prop inspector for the selected node", () => {
    useSelectionStore.getState().selectComponent("main", "title");
    render(<ComponentTree />);
    expect(screen.getByText(/component: Text/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../panels/ComponentTree.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/panels/ComponentTree.tsx`**

```tsx
import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView, type SurfaceView, type ComponentNode } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";

export function ComponentTree() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);
  const selectedComponent = useSelectionStore((s) => s.componentId);
  const selectComponent = useSelectionStore((s) => s.selectComponent);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const views = useMemo(() => {
    const { surfaces } = stateAtTick(entries, tick);
    return Array.from(surfaces.entries()).map(([id, model]) => toSurfaceView(id, model));
  }, [entries, tick]);

  if (views.length === 0) {
    return <div className="p-4 text-xs text-neutral-500">No surfaces at this tick.</div>;
  }

  const activeView: SurfaceView = views.find((v) => v.surfaceId === selectedSurface) ?? views[0]!;
  const selectedNode = selectedComponent ? activeView.components.get(selectedComponent) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-2">
        {activeView.rootId ? (
          <TreeNode
            view={activeView}
            id={activeView.rootId}
            depth={0}
            selectedId={selectedComponent}
            onSelect={(cid) => selectComponent(activeView.surfaceId, cid)}
          />
        ) : (
          <div className="text-xs text-neutral-500">Surface has no root component yet.</div>
        )}
      </div>
      {selectedNode && (
        <div className="border-t border-neutral-800 p-2">
          <div className="mono mb-1 text-xs text-neutral-400">
            component: {selectedNode.type} <span className="text-neutral-600">#{selectedNode.id}</span>
          </div>
          <JsonTree value={selectedNode.props} />
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  view: SurfaceView;
  id: string;
  depth: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

function TreeNode({ view, id, depth, selectedId, onSelect }: TreeNodeProps) {
  const node: ComponentNode | undefined = view.components.get(id);
  if (!node) {
    return (
      <div className="mono text-xs text-red-400" style={{ paddingLeft: `${depth * 12}px` }}>
        #{id} (missing)
      </div>
    );
  }
  const isSelected = id === selectedId;
  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={() => onSelect(id)}
        className={
          "mono cursor-pointer text-xs px-1 " +
          (isSelected ? "bg-neutral-800 text-emerald-300" : "hover:bg-neutral-900 text-neutral-300")
        }
      >
        <span className="text-neutral-500">#{id}</span> <span>{node.type}</span>
      </div>
      {node.childIds.map((childId) => (
        <TreeNode key={childId} view={view} id={childId} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 3 ComponentTree tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Component Tree panel with prop inspector"
```

---

## Task 6: Data Model drawer

**Files:**
- Create: `packages/ui/src/panels/DataModel.tsx`
- Create: `packages/ui/src/__tests__/DataModel.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/DataModel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { DataModel } from "../panels/DataModel.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  const ev = (tick: number, message: unknown) =>
    useSessionStore.getState().applyEvent({ kind: "messageReceived", tick, ts: tick, message: message as never });
  ev(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } });
  ev(1, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello", n: 7 } } });
});

describe("DataModel", () => {
  it("renders the data model of the active surface at the scrubbed tick", () => {
    render(<DataModel />);
    expect(screen.getByText(/title/)).toBeTruthy();
    expect(screen.getByText(/"Hello"/)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy();
  });

  it("shows an empty-state message when there are no surfaces", () => {
    useSessionStore.getState().reset();
    render(<DataModel />);
    expect(screen.getByText(/no data model/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../panels/DataModel.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/panels/DataModel.tsx`**

```tsx
import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";
import { JsonTree } from "../components/JsonTree.js";

export function DataModel() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const views = useMemo(() => {
    const { surfaces } = stateAtTick(entries, tick);
    return Array.from(surfaces.entries()).map(([id, model]) => toSurfaceView(id, model));
  }, [entries, tick]);

  if (views.length === 0) {
    return <div className="p-3 text-xs text-neutral-500">No data model at this tick.</div>;
  }

  const view = views.find((v) => v.surfaceId === selectedSurface) ?? views[0]!;

  return (
    <div className="overflow-auto p-2">
      <div className="mono mb-1 text-xs text-neutral-500">data model · surface: {view.surfaceId}</div>
      <JsonTree value={view.dataModel ?? {}} />
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 2 DataModel tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Data Model drawer"
```

---

## Task 7: Diff engine + Diff panel

**Files:**
- Create: `packages/ui/src/replay/diff.ts`
- Create: `packages/ui/src/panels/Diff.tsx`
- Create: `packages/ui/src/__tests__/diff.test.ts`

- [ ] **Step 1: Write the failing diff-engine test**

`packages/ui/src/__tests__/diff.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { diffSurfaceViews } from "../replay/diff.js";
import type { SurfaceView } from "../replay/surfaceView.js";

function view(components: Array<[string, string]>, dataModel: unknown): SurfaceView {
  const map = new Map(
    components.map(([id, type]) => [id, { id, type, childIds: [], props: {} }])
  );
  return { surfaceId: "main", rootId: components[0]?.[0], components: map, dataModel };
}

describe("diffSurfaceViews", () => {
  it("detects added and removed components", () => {
    const prev = view([["root", "Column"]], {});
    const curr = view([["root", "Column"], ["title", "Text"]], {});
    const d = diffSurfaceViews(prev, curr);
    expect(d.addedComponents).toContain("title");
    expect(d.removedComponents).toEqual([]);
  });

  it("detects changed component types", () => {
    const prev = view([["x", "Text"]], {});
    const curr = view([["x", "Button"]], {});
    const d = diffSurfaceViews(prev, curr);
    expect(d.changedComponents).toContain("x");
  });

  it("detects changed data-model paths", () => {
    const prev = view([], { title: "a", keep: 1 });
    const curr = view([], { title: "b", keep: 1 });
    const d = diffSurfaceViews(prev, curr);
    expect(d.changedPaths.has("/title")).toBe(true);
    expect(d.changedPaths.has("/keep")).toBe(false);
  });

  it("treats an undefined prev as everything added", () => {
    const curr = view([["root", "Column"]], { a: 1 });
    const d = diffSurfaceViews(undefined, curr);
    expect(d.addedComponents).toContain("root");
    expect(d.changedPaths.has("/a")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../replay/diff.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/replay/diff.ts`**

```typescript
import type { SurfaceView } from "./surfaceView.js";

export interface SurfaceDiff {
  addedComponents: string[];
  removedComponents: string[];
  changedComponents: string[];   // type or props changed
  changedPaths: Set<string>;     // JSON-Pointer paths whose data-model leaf changed
}

export function diffSurfaceViews(prev: SurfaceView | undefined, curr: SurfaceView): SurfaceDiff {
  const prevComps = prev?.components ?? new Map();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [id, node] of curr.components) {
    const before = prevComps.get(id);
    if (!before) { added.push(id); continue; }
    if (before.type !== node.type || JSON.stringify(before.props) !== JSON.stringify(node.props)) {
      changed.push(id);
    }
  }
  for (const id of prevComps.keys()) {
    if (!curr.components.has(id)) removed.push(id);
  }

  const changedPaths = new Set<string>();
  collectChangedPaths(prev?.dataModel, curr.dataModel, "", changedPaths);

  return { addedComponents: added, removedComponents: removed, changedComponents: changed, changedPaths };
}

function collectChangedPaths(before: unknown, after: unknown, path: string, out: Set<string>): void {
  if (before === after) return;
  const bothObjects =
    before !== null && after !== null && typeof before === "object" && typeof after === "object";
  if (!bothObjects) {
    if (JSON.stringify(before) !== JSON.stringify(after)) out.add(path === "" ? "/" : path);
    return;
  }
  const keys = new Set([
    ...Object.keys(before as object),
    ...Object.keys(after as object),
  ]);
  for (const k of keys) {
    collectChangedPaths(
      (before as Record<string, unknown>)[k],
      (after as Record<string, unknown>)[k],
      `${path}/${k}`,
      out
    );
  }
}
```

- [ ] **Step 4: Run, verify the diff-engine tests pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 4 diff tests pass.

- [ ] **Step 5: Implement `packages/ui/src/panels/Diff.tsx`**

```tsx
import { useMemo } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";
import { diffSurfaceViews } from "../replay/diff.js";
import { JsonTree } from "../components/JsonTree.js";

export function Diff() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);

  const tick = scrub === "head" ? entries.length - 1 : scrub;

  const { diff, currView } = useMemo(() => {
    const currState = stateAtTick(entries, tick);
    const prevState = stateAtTick(entries, tick - 1);
    const pickView = (surfaces: Map<string, unknown>) => {
      const list = Array.from(surfaces.entries()).map(([id, m]) => toSurfaceView(id, m));
      return list.find((v) => v.surfaceId === selectedSurface) ?? list[0];
    };
    const curr = pickView(currState.surfaces);
    const prev = pickView(prevState.surfaces);
    if (!curr) return { diff: undefined, currView: undefined };
    return { diff: diffSurfaceViews(prev, curr), currView: curr };
  }, [entries, tick, selectedSurface]);

  if (!diff || !currView) {
    return <div className="p-3 text-xs text-neutral-500">Nothing to diff at this tick.</div>;
  }

  return (
    <div className="overflow-auto p-3 mono text-xs">
      <div className="mb-2 text-neutral-500">diff · tick {tick - 1} → {tick} · surface: {currView.surfaceId}</div>
      <Section label="Added components" items={diff.addedComponents} className="text-emerald-300" />
      <Section label="Removed components" items={diff.removedComponents} className="text-red-300" />
      <Section label="Changed components" items={diff.changedComponents} className="text-amber-300" />
      <div className="mt-3 text-neutral-400">Data model (changed paths highlighted):</div>
      <JsonTree value={currView.dataModel ?? {}} changedPaths={diff.changedPaths} />
    </div>
  );
}

function Section({ label, items, className }: { label: string; items: string[]; className: string }) {
  return (
    <div className="mb-1">
      <span className="text-neutral-500">{label}: </span>
      {items.length === 0 ? (
        <span className="text-neutral-600">none</span>
      ) : (
        items.map((id) => (
          <span key={id} className={"mr-2 " + className}>
            #{id}
          </span>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: all diff tests still green; build/typecheck clean for the new panel.

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Diff engine + Diff panel"
```

---

## Task 8: Main-pane tabs + multi-surface tabs + App integration

**Files:**
- Create: `packages/ui/src/components/MainPaneTabs.tsx`
- Create: `packages/ui/src/__tests__/MainPaneTabs.test.tsx`
- Modify: `packages/ui/src/panels/Preview.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Write the failing MainPaneTabs test**

`packages/ui/src/__tests__/MainPaneTabs.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MainPaneTabs } from "../components/MainPaneTabs.js";
import { useMainPaneStore } from "../store/mainPane.js";

beforeEach(() => useMainPaneStore.setState({ tab: "preview" }));

describe("MainPaneTabs", () => {
  it("renders three tabs", () => {
    render(<MainPaneTabs />);
    expect(screen.getByRole("button", { name: /Preview/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tree/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Diff/ })).toBeTruthy();
  });

  it("clicking a tab updates the store", () => {
    render(<MainPaneTabs />);
    fireEvent.click(screen.getByRole("button", { name: /Tree/ }));
    expect(useMainPaneStore.getState().tab).toBe("tree");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../components/MainPaneTabs.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/components/MainPaneTabs.tsx`**

```tsx
import { useMainPaneStore, type MainPaneTab } from "../store/mainPane.js";

const TABS: Array<{ id: MainPaneTab; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "tree", label: "Tree" },
  { id: "diff", label: "Diff" },
];

export function MainPaneTabs() {
  const tab = useMainPaneStore((s) => s.tab);
  const setTab = useMainPaneStore((s) => s.setTab);
  return (
    <div className="flex border-b border-neutral-800">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={
            "px-3 py-1 text-xs border-b-2 " +
            (tab === t.id
              ? "border-emerald-400 text-emerald-300"
              : "border-transparent text-neutral-400 hover:text-neutral-200")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify the MainPaneTabs tests pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 2 MainPaneTabs tests pass.

- [ ] **Step 5: Add multi-surface tabs to `Preview.tsx`**

Replace `packages/ui/src/panels/Preview.tsx` entirely. This keeps the Phase-1 error boundary, adds a surface-tab row when more than one surface exists, and respects the selection store:

```tsx
import { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import { A2uiSurface } from "@a2ui/react/v0_9";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";
import { stateAtTick } from "../replay/processor.js";

class SurfaceErrorBoundary extends Component<{ surfaceId: string; children: ReactNode }, { error?: Error }> {
  override state = {} as { error?: Error };
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ error });
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="mono text-xs text-red-300">
          Failed to render surface "{this.props.surfaceId}": {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function Preview() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const selectedSurface = useSelectionStore((s) => s.surfaceId);
  const selectSurface = useSelectionStore((s) => s.selectSurface);

  const tick = scrub === "head" ? entries.length - 1 : scrub;
  const { surfaces } = useMemo(() => stateAtTick(entries, tick), [entries, tick]);
  const surfaceList = Array.from(surfaces.entries());

  if (surfaceList.length === 0) {
    return <div className="p-6 text-sm text-neutral-500">Waiting for messages. Connect to an upstream or load a .jsonl session.</div>;
  }

  const activeId = surfaceList.find(([id]) => id === selectedSurface)?.[0] ?? surfaceList[0]![0];
  const activeSurface = surfaces.get(activeId);

  return (
    <div className="flex h-full flex-col">
      {surfaceList.length > 1 && (
        <div className="flex border-b border-neutral-800">
          {surfaceList.map(([id]) => (
            <button
              key={id}
              onClick={() => selectSurface(id)}
              className={
                "px-3 py-1 mono text-xs border-b-2 " +
                (id === activeId
                  ? "border-sky-400 text-sky-300"
                  : "border-transparent text-neutral-400 hover:text-neutral-200")
              }
            >
              {id}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <div className="rounded border border-neutral-800 p-2">
          <div className="mb-1 mono text-xs text-neutral-500">surface: {activeId}</div>
          <div className="rounded bg-neutral-900 p-2">
            <SurfaceErrorBoundary surfaceId={activeId}>
              <A2uiSurface key={activeId} surface={activeSurface as never} />
            </SurfaceErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire everything into `App.tsx`**

Replace `packages/ui/src/App.tsx` entirely:

```tsx
import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { MainPaneTabs } from "./components/MainPaneTabs.js";
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
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Build, typecheck, full test, e2e**

```bash
pnpm --filter @a2ui-inspector/ui typecheck
pnpm --filter @a2ui-inspector/ui build
pnpm test
pnpm e2e
```

Expected: typecheck clean, build clean, all unit tests green (Phase 1's 42 + Phase 2a's new tests), e2e green.

- [ ] **Step 8: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add main-pane tabs, multi-surface tabs, wire Tree/Diff/DataModel into App"
```

---

## Phase 2a acceptance checklist

```bash
pnpm install
pnpm typecheck      # clean
pnpm test           # Phase 1 (42) + Phase 2a new tests, all green
pnpm build          # clean
pnpm e2e            # happy-path green, including the "Hello world" DOM assertion
```

Manual demo:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

Open the UI, Connect to `ws://127.0.0.1:8000`, then: scrub the timeline, switch Preview/Tree/Diff tabs, click a tree node to see its props, watch the Data Model drawer update per tick, confirm the Diff panel highlights changes.

---

## Deferred to later phases

**Phase 2b — Transports & interaction:** SSE upstream adapter, HTTP proxy adapter, action injection (bridge `injectAction` command + sidecar write path + UI affordance in the Preview).

**Phase 2c — Polish & packaging:** command palette (`Cmd/Ctrl+K`), full keyboard-shortcut set, light-mode toggle, device-frame toggle in Preview, Docker image, additional fixtures (malformed, multi-surface, action-roundtrip), README animated GIF.
