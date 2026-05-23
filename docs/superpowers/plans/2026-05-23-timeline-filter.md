# Timeline Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direction + message-kind + free-text filter to the Timeline panel with localStorage persistence, a `/` keyboard shortcut, and a scrub-snap so the active tick is always visible.

**Architecture:** A pure matcher (`panels/timelineFilter.ts`) decides whether each session entry is visible. Two tiny Zustand stores: `useTimelineFilterStore` (the filter state + localStorage round-trip) and `useFilterFocusStore` (a counter the search input listens to). `Timeline.tsx` renders only visible entries; an effect snaps `scrubTick` to the nearest visible tick whenever the filter hides the current one. `useGlobalShortcuts` gains `/` to focus the search input via the focus store.

**Tech Stack:** Existing — TypeScript 5, React 18, Zustand 4, Vitest + React Testing Library. No new dependencies.

---

## Scope

One coherent feature, 6 tasks. Implements the approved spec `docs/superpowers/specs/2026-05-23-timeline-filter-design.md`.

## Starting state

- Branch off `main`: `timeline-filter-impl` (already exists with the spec committed).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`.
- Existing relevant code:
  - `packages/ui/src/store/session.ts` — `useSessionStore` with `entries: SessionEntry[]`.
  - `packages/ui/src/store/timeline.ts` — `useTimelineStore` with `scrubTick: number | "head"` and `setScrubTick`.
  - `packages/ui/src/panels/Timeline.tsx` — current row list with click-to-scrub and Arrow/Home/End keyboard nav (full content reproduced in Task 4).
  - `packages/ui/src/hooks/useGlobalShortcuts.ts` — `useGlobalShortcuts(handlers: ShortcutHandlers)`; `ShortcutHandlers = { onSave, onOpenFile, onTogglePalette, onTab }`; an `isTypingTarget()` guard already exists (full content reproduced in Task 5).
  - `packages/ui/src/App.tsx` — calls `useThemeStore.getState().applyTheme()` in a mount effect; constructs `shortcutHandlers` via `useMemo`.
  - `packages/ui/src/__tests__/setup.ts` includes a guarded `localStorage` polyfill.
  - UI tokens: `bg-app`, `bg-surface`, `bg-raised`, `border-edge`, `text-ink`, `text-ink-muted`, `text-ink-faint`. Accent colors: `emerald-*`, `amber-*`, `sky-*`, `red-*`.

## File summary

```
packages/ui/src/
├── panels/
│   ├── timelineFilter.ts                       NEW — pure matcher + helpers
│   ├── __tests__/timelineFilter.test.ts        NEW
│   └── Timeline.tsx                            MODIFIED — filter panel, visibleEntries, scrub-snap, empty-state
├── store/
│   ├── timelineFilter.ts                       NEW — useTimelineFilterStore (persisted)
│   └── filterFocus.ts                          NEW — useFilterFocusStore
├── hooks/useGlobalShortcuts.ts                 MODIFIED — `/` shortcut
├── __tests__/
│   ├── timelineFilterStore.test.ts             NEW
│   ├── filterFocusStore.test.ts                NEW
│   ├── Timeline.test.tsx                       MODIFIED — filter + snap cases
│   └── useGlobalShortcuts.test.tsx             MODIFIED — `/` case
└── App.tsx                                     MODIFIED — hydrate + onFocusFilter wiring
```

## Pre-flight

1. Run `pnpm test` after each task — the existing 140 UI tests must stay green.
2. Commit after every task.

---

## Task 1: Pure matcher

**Files:**
- Create: `packages/ui/src/panels/timelineFilter.ts`
- Create: `packages/ui/src/panels/__tests__/timelineFilter.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/panels/__tests__/timelineFilter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import {
  entryKind,
  entrySurfaceId,
  matchesFilter,
  DEFAULT_FILTER,
  ALL_DIRECTIONS,
  ALL_KINDS,
  type Direction,
  type Kind,
  type TimelineFilter,
} from "../timelineFilter.js";

const msg = (variant: "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface", surfaceId: string): SessionEntry => ({
  tick: 0, ts: 0, direction: "agent->client",
  message: { version: "v0.9", [variant]: { surfaceId } } as never,
});
const act = (componentId: string): SessionEntry => ({
  tick: 0, ts: 0, direction: "client->agent",
  action: { surfaceId: "main", componentId, kind: "tap" },
});

const filter = (override: Partial<TimelineFilter> = {}): TimelineFilter => ({
  directions: new Set<Direction>(ALL_DIRECTIONS),
  kinds: new Set<Kind>(ALL_KINDS),
  query: "",
  ...override,
});

describe("entryKind", () => {
  it("returns createSurface for createSurface messages", () => {
    expect(entryKind(msg("createSurface", "s"))).toBe("createSurface");
  });
  it("returns updateComponents for updateComponents messages", () => {
    expect(entryKind(msg("updateComponents", "s"))).toBe("updateComponents");
  });
  it("returns updateDataModel for updateDataModel messages", () => {
    expect(entryKind(msg("updateDataModel", "s"))).toBe("updateDataModel");
  });
  it("returns deleteSurface for deleteSurface messages", () => {
    expect(entryKind(msg("deleteSurface", "s"))).toBe("deleteSurface");
  });
  it("returns action for client actions", () => {
    expect(entryKind(act("btn"))).toBe("action");
  });
});

describe("entrySurfaceId", () => {
  it("extracts surfaceId from createSurface", () => {
    expect(entrySurfaceId(msg("createSurface", "main"))).toBe("main");
  });
  it("extracts surfaceId from updateComponents", () => {
    expect(entrySurfaceId(msg("updateComponents", "sidebar"))).toBe("sidebar");
  });
  it("extracts surfaceId from an action", () => {
    expect(entrySurfaceId(act("btn"))).toBe("main");
  });
});

describe("matchesFilter — direction", () => {
  it("includes the entry when its direction is in the set", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter())).toBe(true);
  });
  it("excludes the entry when its direction is filtered out", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter({ directions: new Set(["client->agent"]) }))).toBe(false);
  });
});

describe("matchesFilter — kind", () => {
  it("excludes the entry when its kind is filtered out", () => {
    expect(matchesFilter(msg("createSurface", "s"), filter({ kinds: new Set(["updateDataModel"]) }))).toBe(false);
  });
});

describe("matchesFilter — query", () => {
  it("empty query passes everything", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "" }))).toBe(true);
  });
  it("matches the kind label (case-insensitive)", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "CREATE" }))).toBe(true);
  });
  it("matches the surfaceId substring", () => {
    expect(matchesFilter(msg("createSurface", "sidebar"), filter({ query: "side" }))).toBe(true);
  });
  it("matches the componentId substring for actions", () => {
    expect(matchesFilter(act("submit-btn"), filter({ query: "btn" }))).toBe(true);
  });
  it("excludes entries that match no facet", () => {
    expect(matchesFilter(msg("createSurface", "main"), filter({ query: "nope" }))).toBe(false);
  });
});

describe("matchesFilter — combination", () => {
  it("requires direction AND kind AND query to all match", () => {
    const e = msg("createSurface", "main");
    expect(matchesFilter(e, filter({ directions: new Set(["agent->client"]), kinds: new Set(["createSurface"]), query: "main" }))).toBe(true);
    expect(matchesFilter(e, filter({ directions: new Set(["client->agent"]), kinds: new Set(["createSurface"]), query: "main" }))).toBe(false);
  });
});

describe("DEFAULT_FILTER", () => {
  it("includes both directions and all five kinds and an empty query", () => {
    expect(DEFAULT_FILTER.directions.size).toBe(2);
    expect(DEFAULT_FILTER.kinds.size).toBe(5);
    expect(DEFAULT_FILTER.query).toBe("");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../timelineFilter.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/panels/timelineFilter.ts`**

```typescript
import type { SessionEntry } from "@a2ui-inspector/shared";

export type Direction = "agent->client" | "client->agent";
export type Kind = "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface" | "action";

export const ALL_DIRECTIONS: readonly Direction[] = ["agent->client", "client->agent"];
export const ALL_KINDS: readonly Kind[] = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
  "action",
];

export interface TimelineFilter {
  directions: Set<Direction>;
  kinds: Set<Kind>;
  query: string;
}

export const DEFAULT_FILTER: TimelineFilter = {
  directions: new Set<Direction>(ALL_DIRECTIONS),
  kinds: new Set<Kind>(ALL_KINDS),
  query: "",
};

interface MessageShape {
  createSurface?: { surfaceId?: string };
  updateComponents?: { surfaceId?: string };
  updateDataModel?: { surfaceId?: string };
  deleteSurface?: { surfaceId?: string };
}

export function entryKind(entry: SessionEntry): Kind | "unknown" {
  if (entry.action) return "action";
  const m = entry.message as MessageShape | undefined;
  if (!m) return "unknown";
  if (m.createSurface) return "createSurface";
  if (m.updateComponents) return "updateComponents";
  if (m.updateDataModel) return "updateDataModel";
  if (m.deleteSurface) return "deleteSurface";
  return "unknown";
}

export function entrySurfaceId(entry: SessionEntry): string | undefined {
  if (entry.action) return entry.action.surfaceId;
  const m = entry.message as MessageShape | undefined;
  return (
    m?.createSurface?.surfaceId ??
    m?.updateComponents?.surfaceId ??
    m?.updateDataModel?.surfaceId ??
    m?.deleteSurface?.surfaceId
  );
}

export function matchesFilter(entry: SessionEntry, filter: TimelineFilter): boolean {
  if (!filter.directions.has(entry.direction)) return false;
  const k = entryKind(entry);
  if (k === "unknown") return false;
  if (!filter.kinds.has(k)) return false;

  const q = filter.query.trim().toLowerCase();
  if (!q) return true;

  if (k.toLowerCase().includes(q)) return true;
  const sid = entrySurfaceId(entry);
  if (sid && sid.toLowerCase().includes(q)) return true;
  if (entry.action && entry.action.componentId.toLowerCase().includes(q)) return true;

  return false;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — all timelineFilter tests green.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/panels/timelineFilter.ts packages/ui/src/panels/__tests__/timelineFilter.test.ts
git commit -m "feat(ui): add pure timeline-filter matcher"
```

---

## Task 2: Filter store with persistence

**Files:**
- Create: `packages/ui/src/store/timelineFilter.ts`
- Create: `packages/ui/src/__tests__/timelineFilterStore.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/timelineFilterStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useTimelineFilterStore, STORAGE_KEY } from "../store/timelineFilter.js";
import { ALL_DIRECTIONS, ALL_KINDS } from "../panels/timelineFilter.js";

beforeEach(() => {
  localStorage.clear();
  // Reset store to defaults manually (no top-level reset action — call reset()).
  useTimelineFilterStore.getState().reset();
});

describe("useTimelineFilterStore", () => {
  it("defaults to both directions, all kinds, empty query", () => {
    const s = useTimelineFilterStore.getState();
    expect(s.directions.size).toBe(ALL_DIRECTIONS.length);
    expect(s.kinds.size).toBe(ALL_KINDS.length);
    expect(s.query).toBe("");
  });

  it("isDefault() is true at defaults and false after a change", () => {
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
    useTimelineFilterStore.getState().setQuery("x");
    expect(useTimelineFilterStore.getState().isDefault()).toBe(false);
  });

  it("toggleDirection removes then re-adds a direction", () => {
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    expect(useTimelineFilterStore.getState().directions.has("agent->client")).toBe(false);
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    expect(useTimelineFilterStore.getState().directions.has("agent->client")).toBe(true);
  });

  it("toggleKind removes then re-adds a kind", () => {
    useTimelineFilterStore.getState().toggleKind("action");
    expect(useTimelineFilterStore.getState().kinds.has("action")).toBe(false);
    useTimelineFilterStore.getState().toggleKind("action");
    expect(useTimelineFilterStore.getState().kinds.has("action")).toBe(true);
  });

  it("setQuery updates the query", () => {
    useTimelineFilterStore.getState().setQuery("hello");
    expect(useTimelineFilterStore.getState().query).toBe("hello");
  });

  it("reset restores defaults", () => {
    useTimelineFilterStore.getState().toggleDirection("agent->client");
    useTimelineFilterStore.getState().setQuery("x");
    useTimelineFilterStore.getState().reset();
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });

  it("persists to localStorage after every change", () => {
    useTimelineFilterStore.getState().toggleKind("action");
    useTimelineFilterStore.getState().setQuery("foo");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.kinds).not.toContain("action");
    expect(parsed.query).toBe("foo");
  });

  it("hydrate reads a stored value", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ directions: ["agent->client"], kinds: ["createSurface"], query: "abc" })
    );
    useTimelineFilterStore.getState().hydrate();
    const s = useTimelineFilterStore.getState();
    expect(Array.from(s.directions)).toEqual(["agent->client"]);
    expect(Array.from(s.kinds)).toEqual(["createSurface"]);
    expect(s.query).toBe("abc");
  });

  it("hydrate falls back to defaults on malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    useTimelineFilterStore.getState().hydrate();
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/timelineFilter.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/store/timelineFilter.ts`**

```typescript
import { create } from "zustand";
import {
  ALL_DIRECTIONS,
  ALL_KINDS,
  DEFAULT_FILTER,
  type Direction,
  type Kind,
  type TimelineFilter,
} from "../panels/timelineFilter.js";

export const STORAGE_KEY = "a2ui-inspector-timeline-filter";

interface TimelineFilterState extends TimelineFilter {
  toggleDirection: (d: Direction) => void;
  toggleKind: (k: Kind) => void;
  setQuery: (q: string) => void;
  reset: () => void;
  hydrate: () => void;
  isDefault: () => boolean;
}

function persist(state: TimelineFilter): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      directions: Array.from(state.directions),
      kinds: Array.from(state.kinds),
      query: state.query,
    })
  );
}

function freshDefaults(): TimelineFilter {
  return {
    directions: new Set<Direction>(DEFAULT_FILTER.directions),
    kinds: new Set<Kind>(DEFAULT_FILTER.kinds),
    query: DEFAULT_FILTER.query,
  };
}

export const useTimelineFilterStore = create<TimelineFilterState>((set, get) => ({
  ...freshDefaults(),

  toggleDirection: (d) => {
    const next = new Set(get().directions);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    set({ directions: next });
    persist(get());
  },

  toggleKind: (k) => {
    const next = new Set(get().kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    set({ kinds: next });
    persist(get());
  },

  setQuery: (query) => {
    set({ query });
    persist(get());
  },

  reset: () => {
    set(freshDefaults());
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  },

  hydrate: () => {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { directions?: unknown; kinds?: unknown; query?: unknown };
      const dirs = Array.isArray(parsed.directions)
        ? (parsed.directions.filter((d) => ALL_DIRECTIONS.includes(d as Direction)) as Direction[])
        : Array.from(DEFAULT_FILTER.directions);
      const kinds = Array.isArray(parsed.kinds)
        ? (parsed.kinds.filter((k) => ALL_KINDS.includes(k as Kind)) as Kind[])
        : Array.from(DEFAULT_FILTER.kinds);
      const query = typeof parsed.query === "string" ? parsed.query : "";
      set({ directions: new Set(dirs), kinds: new Set(kinds), query });
    } catch {
      set(freshDefaults());
    }
  },

  isDefault: () =>
    get().directions.size === ALL_DIRECTIONS.length &&
    get().kinds.size === ALL_KINDS.length &&
    get().query === "",
}));
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — all filter store tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/store/timelineFilter.ts packages/ui/src/__tests__/timelineFilterStore.test.ts
git commit -m "feat(ui): add persisted useTimelineFilterStore"
```

---

## Task 3: Filter focus store

**Files:**
- Create: `packages/ui/src/store/filterFocus.ts`
- Create: `packages/ui/src/__tests__/filterFocusStore.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/filterFocusStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useFilterFocusStore } from "../store/filterFocus.js";

beforeEach(() => useFilterFocusStore.setState({ focusTick: 0 }));

describe("useFilterFocusStore", () => {
  it("defaults focusTick to 0", () => {
    expect(useFilterFocusStore.getState().focusTick).toBe(0);
  });

  it("requestFocus increments focusTick", () => {
    useFilterFocusStore.getState().requestFocus();
    expect(useFilterFocusStore.getState().focusTick).toBe(1);
    useFilterFocusStore.getState().requestFocus();
    expect(useFilterFocusStore.getState().focusTick).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/filterFocus.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/store/filterFocus.ts`**

```typescript
import { create } from "zustand";

interface FilterFocusState {
  focusTick: number;
  requestFocus: () => void;
}

export const useFilterFocusStore = create<FilterFocusState>((set, get) => ({
  focusTick: 0,
  requestFocus: () => set({ focusTick: get().focusTick + 1 }),
}));
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/store/filterFocus.ts packages/ui/src/__tests__/filterFocusStore.test.ts
git commit -m "feat(ui): add filter-focus store"
```

---

## Task 4: Timeline UI — filter panel, visibleEntries, scrub-snap, empty-state

**Files:**
- Modify: `packages/ui/src/panels/Timeline.tsx` (full replace)
- Modify: `packages/ui/src/__tests__/Timeline.test.tsx` (add new cases)

### Current `Timeline.tsx`

The current file uses a local `kindOf(entry)` helper, reads `entries` + `scrubTick` + `setScrubTick`, wires Arrow/Home/End keyboard navigation, and renders one `<li>` per entry. It does not import a filter. The new version replaces `kindOf` with the imported `entryKind`, adds a sticky filter panel, computes `visibleEntries`, runs a scrub-snap effect, walks `visibleEntries` in the keyboard nav, and handles the empty-filtered state.

- [ ] **Step 1: Add the failing test cases**

Append the following inside the existing `describe("Timeline", () => { ... })` block in `packages/ui/src/__tests__/Timeline.test.tsx`:

```typescript
  it("hides rows whose kind is filtered out", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().toggleKind("createSurface");
    render(<Timeline />);
    expect(screen.queryByText(/createSurface/)).toBeNull();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("filters by search query (case-insensitive substring on kind)", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().setQuery("DATA");
    render(<Timeline />);
    expect(screen.queryByText(/createSurface/)).toBeNull();
    expect(screen.getByText(/updateDataModel/)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("shows the X of Y count and reset button only when filtered", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    const { unmount } = render(<Timeline />);
    expect(screen.queryByText(/shown/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /reset filter/i })).toBeNull();
    unmount();

    useTimelineFilterStore.getState().setQuery("createSurface");
    render(<Timeline />);
    expect(screen.getByText(/1 of 2 shown/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reset filter/i }));
    expect(useTimelineFilterStore.getState().isDefault()).toBe(true);
  });

  it("scrub-snaps to the nearest visible tick when the active tick is filtered out", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineStore.getState().setScrubTick(0); // active = createSurface at tick 0
    useTimelineFilterStore.getState().toggleKind("createSurface");
    render(<Timeline />);
    // tick 0 (createSurface) is hidden; next visible is tick 1 (updateDataModel).
    await waitFor(() => expect(useTimelineStore.getState().scrubTick).toBe(1));
    useTimelineFilterStore.getState().reset();
  });

  it("renders an empty-state message when no entries match", async () => {
    const { useTimelineFilterStore } = await import("../store/timelineFilter.js");
    useTimelineFilterStore.getState().reset();
    useTimelineFilterStore.getState().setQuery("xyz-no-match");
    render(<Timeline />);
    expect(screen.getByText(/no entries match/i)).toBeTruthy();
    useTimelineFilterStore.getState().reset();
  });

  it("focuses the search input when the filter-focus tick increments", async () => {
    const { useFilterFocusStore } = await import("../store/filterFocus.js");
    useFilterFocusStore.setState({ focusTick: 0 });
    render(<Timeline />);
    const input = screen.getByLabelText(/filter sessions/i) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    useFilterFocusStore.getState().requestFocus();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
```

At the top of the test file, ensure `waitFor` is imported from `@testing-library/react`. The existing imports are likely `import { render, screen, fireEvent } from "@testing-library/react"` — add `waitFor`.

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — the new cases fail (filter panel and visibleEntries logic don't exist yet).

- [ ] **Step 3: Replace `packages/ui/src/panels/Timeline.tsx` entirely with**

```tsx
import { useEffect, useMemo, useRef } from "react";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useTimelineFilterStore } from "../store/timelineFilter.js";
import { useFilterFocusStore } from "../store/filterFocus.js";
import {
  ALL_DIRECTIONS,
  ALL_KINDS,
  entryKind,
  matchesFilter,
  type Direction,
  type Kind,
} from "./timelineFilter.js";

const KIND_LABEL: Record<Kind, string> = {
  createSurface: "create",
  updateComponents: "upd",
  updateDataModel: "data",
  deleteSurface: "del",
  action: "act",
};

const DIRECTION_LABEL: Record<Direction, string> = {
  "agent->client": "agent→client",
  "client->agent": "client→agent",
};

export function Timeline() {
  const entries = useSessionStore((s) => s.entries);
  const scrub = useTimelineStore((s) => s.scrubTick);
  const setScrub = useTimelineStore((s) => s.setScrubTick);

  const directions = useTimelineFilterStore((s) => s.directions);
  const kinds = useTimelineFilterStore((s) => s.kinds);
  const query = useTimelineFilterStore((s) => s.query);
  const toggleDirection = useTimelineFilterStore((s) => s.toggleDirection);
  const toggleKind = useTimelineFilterStore((s) => s.toggleKind);
  const setQuery = useTimelineFilterStore((s) => s.setQuery);
  const resetFilter = useTimelineFilterStore((s) => s.reset);
  const isDefault = useTimelineFilterStore((s) => s.isDefault());

  const focusTick = useFilterFocusStore((s) => s.focusTick);
  const inputRef = useRef<HTMLInputElement>(null);

  // External focus request → focus the search input.
  useEffect(() => {
    if (focusTick > 0) inputRef.current?.focus();
  }, [focusTick]);

  const filter = useMemo(() => ({ directions, kinds, query }), [directions, kinds, query]);
  const visibleEntries = useMemo(
    () => entries.filter((e) => matchesFilter(e, filter)),
    [entries, filter]
  );

  // Scrub-snap: if the current scrubTick is filtered out, snap to nearest visible.
  useEffect(() => {
    if (scrub === "head") return;
    if (visibleEntries.length === 0) return;
    if (visibleEntries.some((e) => e.tick === scrub)) return;
    const forward = visibleEntries.find((e) => e.tick > scrub);
    const backward = [...visibleEntries].reverse().find((e) => e.tick < scrub);
    const next = forward ?? backward;
    if (next) setScrub(next.tick);
  }, [visibleEntries, scrub, setScrub]);

  // Arrow/Home/End nav — walks visible entries only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (visibleEntries.length === 0) return;
      const ticks = visibleEntries.map((v) => v.tick);
      const current = scrub === "head" ? ticks[ticks.length - 1]! : scrub;
      const idx = ticks.indexOf(current);
      if (e.key === "ArrowRight") {
        const i = idx < 0 ? 0 : Math.min(ticks.length - 1, idx + 1);
        setScrub(ticks[i]!);
      } else if (e.key === "ArrowLeft") {
        const i = idx < 0 ? 0 : Math.max(0, idx - 1);
        setScrub(ticks[i]!);
      } else if (e.key === "End") {
        setScrub("head");
      } else if (e.key === "Home") {
        setScrub(ticks[0]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleEntries, scrub, setScrub]);

  const activeTick = scrub === "head" ? visibleEntries[visibleEntries.length - 1]?.tick : scrub;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-edge bg-surface px-2 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Filter sessions"
          className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {ALL_DIRECTIONS.map((d) => {
            const on = directions.has(d);
            return (
              <button
                key={d}
                onClick={() => toggleDirection(d)}
                aria-pressed={on}
                className={
                  "mono rounded px-1.5 py-0.5 text-[10px] " +
                  (on ? "bg-raised text-ink" : "text-ink-muted hover:bg-surface")
                }
              >
                {DIRECTION_LABEL[d]}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {ALL_KINDS.map((k) => {
            const on = kinds.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                aria-pressed={on}
                className={
                  "mono rounded px-1.5 py-0.5 text-[10px] " +
                  (on ? "bg-raised text-ink" : "text-ink-muted hover:bg-surface")
                }
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        {!isDefault && (
          <div className="mt-2 flex items-center justify-between mono text-[10px] text-ink-muted">
            <span>{visibleEntries.length} of {entries.length} shown</span>
            <button
              onClick={resetFilter}
              className="rounded border border-edge px-1.5 py-0.5 hover:bg-raised"
            >
              Reset filter
            </button>
          </div>
        )}
      </div>

      <ol className="mono flex-1 overflow-auto text-xs">
        {visibleEntries.length === 0 ? (
          <li className="px-2 py-4 text-ink-muted">
            {entries.length === 0 ? "No entries yet." : "No entries match the current filter."}
          </li>
        ) : (
          visibleEntries.map((e) => {
            const isActive = e.tick === activeTick;
            return (
              <li
                key={e.tick}
                onClick={() => setScrub(e.tick)}
                className={
                  "cursor-pointer border-l-2 px-2 py-1 " +
                  (isActive
                    ? "border-emerald-400 bg-surface text-emerald-300"
                    : "border-transparent hover:bg-surface")
                }
              >
                <span className="mr-2 text-ink-muted">#{e.tick}</span>
                <span>{entryKind(e)}</span>
                {e.direction === "client->agent" ? <span className="ml-1 text-amber-400">←</span> : null}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — all Timeline tests including the new cases. Existing Timeline tests must still pass (the same scrub/click/keyboard contract is preserved).
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

If an existing test relies on the rendered top-level being an `<ol>` directly (`container.firstChild`), it may need to drill one level since the root is now a `<div>`. Inspect failures; do NOT weaken assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/panels/Timeline.tsx packages/ui/src/__tests__/Timeline.test.tsx
git commit -m "feat(ui): add Timeline filter panel + scrub-snap + empty-state"
```

---

## Task 5: `/` keyboard shortcut

**Files:**
- Modify: `packages/ui/src/hooks/useGlobalShortcuts.ts`
- Modify: `packages/ui/src/__tests__/useGlobalShortcuts.test.tsx`

### Current `useGlobalShortcuts.ts`

The current file exports `useGlobalShortcuts(handlers)` where `ShortcutHandlers = { onSave, onOpenFile, onTogglePalette, onTab }`, with `isTypingTarget()` guarding modifier shortcuts (Cmd+K/S/O) and plain T/R/D for tabs. This task adds one shortcut.

- [ ] **Step 1: Add a failing test case**

Append the following case inside the existing `describe("useGlobalShortcuts", () => { ... })` block in `packages/ui/src/__tests__/useGlobalShortcuts.test.tsx`. Also update `makeHandlers()` to include the new `onFocusFilter` (if not already present, add it). The existing pattern:

```typescript
function makeHandlers(): ShortcutHandlers & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const onSave = vi.fn();
  const onOpenFile = vi.fn();
  const onTogglePalette = vi.fn();
  const onTab = vi.fn();
  const onFocusFilter = vi.fn();
  return {
    onSave, onOpenFile, onTogglePalette, onTab, onFocusFilter,
    spies: { onSave, onOpenFile, onTogglePalette, onTab, onFocusFilter },
  };
}
```

Add the case:

```typescript
  it("`/` focuses the filter when not in a typing target", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(h.spies.onFocusFilter).toHaveBeenCalledTimes(1);
  });

  it("`/` inside an input is ignored", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "/" });
    expect(h.spies.onFocusFilter).not.toHaveBeenCalled();
    input.remove();
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `onFocusFilter` is not part of `ShortcutHandlers` yet, or the `/` key is not handled.

- [ ] **Step 3: Replace `packages/ui/src/hooks/useGlobalShortcuts.ts` with**

```typescript
import { useEffect } from "react";
import type { MainPaneTab } from "../store/mainPane.js";

export interface ShortcutHandlers {
  onSave: () => void;
  onOpenFile: () => void;
  onTogglePalette: () => void;
  onTab: (tab: MainPaneTab) => void;
  onFocusFilter: () => void;
}

const TAB_KEYS: Record<string, MainPaneTab> = {
  t: "preview",
  r: "tree",
  d: "diff",
};

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "k") {
        e.preventDefault();
        handlers.onTogglePalette();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        handlers.onSave();
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        handlers.onOpenFile();
        return;
      }
      if (!mod && key === "/") {
        e.preventDefault();
        handlers.onFocusFilter();
        return;
      }
      if (!mod && key in TAB_KEYS) {
        handlers.onTab(TAB_KEYS[key]!);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
```

- [ ] **Step 4: Verify

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: shortcut tests PASS, but `App.tsx` typecheck WILL FAIL — it doesn't yet pass `onFocusFilter`. That is the expected intermediate state; Task 6 resolves it.

Run: `pnpm --filter @a2ui-inspector/ui typecheck`
Expected: ONE error about `onFocusFilter` missing in App's `shortcutHandlers`. No other errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/hooks/useGlobalShortcuts.ts packages/ui/src/__tests__/useGlobalShortcuts.test.tsx
git commit -m "feat(ui): add `/` shortcut to focus the filter"
```

---

## Task 6: App wiring — hydrate + onFocusFilter

**Files:**
- Modify: `packages/ui/src/App.tsx`

### Existing pattern

`App.tsx` builds `shortcutHandlers` via `useMemo` and passes it to `useGlobalShortcuts`. It also has a mount effect that calls `useThemeStore.getState().applyTheme()`. The new wiring mirrors both: hydrate the filter store on mount, and add `onFocusFilter` into the shortcut handlers.

- [ ] **Step 1: Add the imports**

Add to `App.tsx`'s import block:

```tsx
import { useTimelineFilterStore } from "./store/timelineFilter.js";
import { useFilterFocusStore } from "./store/filterFocus.js";
```

- [ ] **Step 2: Hydrate on mount**

Add a new mount effect next to the existing `useThemeStore.getState().applyTheme()` effect:

```tsx
  useEffect(() => {
    useTimelineFilterStore.getState().hydrate();
  }, []);
```

- [ ] **Step 3: Wire `onFocusFilter` into shortcut handlers**

Find the existing `shortcutHandlers = useMemo(() => ({ onSave: handleSave, onOpenFile: handleLoadFile, onTogglePalette: togglePalette, onTab: setTab }), [...])`. Update it to:

```tsx
  const shortcutHandlers = useMemo(
    () => ({
      onSave: handleSave,
      onOpenFile: handleLoadFile,
      onTogglePalette: togglePalette,
      onTab: setTab,
      onFocusFilter: () => useFilterFocusStore.getState().requestFocus(),
    }),
    [handleSave, handleLoadFile, togglePalette, setTab]
  );
```

Leave everything else (the boot/share effect, theme, drag-drop, Toolbar wiring, panels, palette, ShareDialog) untouched.

- [ ] **Step 4: Verify

Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean (the Task 5 break is resolved).
Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass.
Run: `pnpm --filter @a2ui-inspector/ui build` — clean.
Run: `pnpm e2e` — the existing e2e specs (happy-path + share) MUST still pass. The new filter panel adds an input but it's labeled and not in any happy-path selector path; if a selector now matches it ambiguously, scope it more tightly — do not weaken.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat(ui): hydrate timeline filter on mount + wire `/` focus shortcut"
```

---

## Acceptance checklist

```bash
pnpm install
pnpm build       # clean
pnpm typecheck   # clean
pnpm test        # 140 prior + filter tests (matcher 14, store 9, focus 2, Timeline filter 6, shortcuts 2), all green
pnpm e2e         # happy-path + share both still green
```

Manual smoke:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

Connect to `ws://127.0.0.1:8000`, let the timeline fill. Toggle a kind chip — rows hide. Type in the search — substring filter applies. Press `/` from outside an input — search input focuses. Scrub to a tick, filter it out — active tick snaps to the nearest visible tick (Preview/Tree updates accordingly). Click **Reset filter** — state restored. Reload the page — filter state persists.

## Out of scope (per the spec)

Saved presets, boolean operators in search, server-side filtering, filtering the recording at save time.
