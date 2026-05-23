# A2UI Inspector — Timeline Filter Design

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-23
**Depends on:** A2UI Inspector v1 + v1.1 + Share-via-URL (all merged to `main`)

## Context

The Timeline panel (`packages/ui/src/panels/Timeline.tsx`) shows every session entry in chronological order. Long sessions quickly become unreadable. The original design (`docs/superpowers/specs/2026-05-21-a2ui-inspector-design.md`, *Timeline* section) sketched a filter dropdown — `all / agent→client only / client→agent only / errors only` — and a `/` focus shortcut. Both were deferred from Phase 1 and never built. This spec replaces that sketch with a slightly richer filter, settled in brainstorming.

## Goals

1. Reduce the timeline to entries the user cares about in one or two clicks.
2. Coherent scrub: when a filter hides the currently-active tick, the rest of the UI stays consistent.
3. Pure, testable filter logic — no React coupling in the matcher.
4. Persistence across reloads (same UX as the theme toggle).
5. `/` keyboard shortcut to focus the filter search input.

## Non-goals

- Saved/named filter presets.
- Boolean operators in the search (no AND/OR/NOT — substring match only).
- Server-side filtering; the timeline is in-memory.
- Filtering the recording at save time — Save still writes the full session.

## Architecture

### `useTimelineFilterStore` — new Zustand store

```ts
type Direction = "agent->client" | "client->agent";
type Kind = "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface" | "action";

interface TimelineFilterState {
  directions: Set<Direction>;     // default: both
  kinds: Set<Kind>;                // default: all five
  query: string;                   // default: ""
  toggleDirection: (d: Direction) => void;
  toggleKind: (k: Kind) => void;
  setQuery: (q: string) => void;
  reset: () => void;
  hydrate: () => void;
}
```

Persisted to `localStorage["a2ui-inspector-timeline-filter"]`. `Set`s are serialized via `Array.from(...)` / `new Set(parsed)`. `hydrate()` reads the key once on startup; failure falls back to defaults silently.

### Pure matcher — `panels/timelineFilter.ts`

```ts
export function entryKind(entry: SessionEntry): Kind | "unknown";
export function entrySurfaceId(entry: SessionEntry): string | undefined;
export function matchesFilter(entry: SessionEntry, filter: TimelineFilterState): boolean;
```

`matchesFilter` returns `true` iff: direction in `filter.directions`, kind in `filter.kinds`, and (`filter.query` is empty OR the kind label / surfaceId / componentId case-insensitive-contains the query). Pure — no React, no store — so it tests in isolation.

### `useFilterFocusStore` — tiny new Zustand store

```ts
interface FilterFocusState {
  focusTick: number;
  requestFocus: () => void; // increments focusTick
}
```

The Timeline's search `<input>` runs `useEffect` keyed on `focusTick` that calls `.focus()`. The global keyboard shortcut increments `focusTick`. This decouples the shortcut hook from any specific DOM element.

### Scrub snap (when current tick is filtered out)

In `Timeline.tsx`, `useEffect` on `[visibleEntries, scrubTick]`:
- If `scrubTick === "head"` → no-op (head means "latest visible").
- If `scrubTick` matches some entry in `visibleEntries` → no-op.
- Else → call `setScrubTick(nearestVisibleTick)`, preferring the smallest `tick ≥ current` (forward), falling back to the largest `tick < current` (backward) when no forward match exists.

`scrubTick` always points at a visible tick → Preview/Tree/Diff/DataModel render the correct state with no per-panel awareness of the filter.

### Timeline rendering

`Timeline.tsx`:
- Renders a sticky filter panel at the top.
- Computes `visibleEntries = entries.filter((e) => matchesFilter(e, filter))` via `useMemo`.
- Renders only `visibleEntries`. Arrow-key step (existing) now walks visible entries only because the rendered list is filtered.
- Shows "**X of Y shown**" + a "reset" button under the filter panel when any filter is non-default.

## UI

Sticky at top of the Timeline left rail, above the row list. Approximate layout:

```
┌────────────────────────────────────┐
│ 🔍 [ search…                    ]  │  ← search input (focused by `/`)
│ Dir: [agent→client] [client→agent] │  ← direction toggles
│ Kind: [create][upd][data][del][act]│  ← kind chips
│ ─────────────────────────────────  │
│ 23 of 100 shown          [reset]   │  ← shown only when filtered
└────────────────────────────────────┘
```

- Direction toggles + kind chips: `bg-raised text-ink` selected / `text-ink-muted hover:bg-surface` deselected.
- Kind labels: `create`, `upd`, `data`, `del`, `act` (terse — the left rail is narrow).
- The "reset" button is hidden when the filter is at defaults.
- Search input uses the existing `bg-app text-ink` token style and an `aria-label="Filter sessions"`.

## Keyboard

Extend `hooks/useGlobalShortcuts.ts` with one new shortcut:

- `/` (no modifier, target not a typing element) → `onFocusFilter()` callback.

`App.tsx` passes `onFocusFilter: () => useFilterFocusStore.getState().requestFocus()` into the existing `shortcutHandlers` memo.

## Persistence

On startup, `App.tsx`'s existing mount effect block also calls `useTimelineFilterStore.getState().hydrate()` once. Mirrors how `useThemeStore.applyTheme()` is invoked. Malformed JSON → defaults.

## Error handling

- Malformed `localStorage` value: caught, falls back to defaults.
- `matchesFilter` never throws: an unexpected entry shape returns `"unknown"` from `entryKind`, which is not in any `Kind` set, so the entry is filtered out.
- Empty filtered list (every entry filtered out): Timeline shows "No entries match the current filter." with a reset button.

## Testing

**Unit — `panels/__tests__/timelineFilter.test.ts`:**
- `entryKind` returns the right kind for each message variant and for action entries
- direction filter: includes only matching direction
- kind filter: includes only matching kinds
- query filter: substring match on kind label; substring on surfaceId; substring on componentId; empty query passes all
- combination: all three composed; case-insensitive

**Store — `__tests__/timelineFilterStore.test.ts`:**
- defaults (both directions, all kinds, empty query)
- `toggleDirection` / `toggleKind` flips set membership
- `setQuery`
- `reset` restores defaults
- persistence: `hydrate` after a `localStorage.setItem` of a known serialized form reads the values back; `hydrate` on malformed JSON falls back to defaults

**Store — `__tests__/filterFocusStore.test.ts`:**
- `requestFocus` increments `focusTick`

**Component — `__tests__/Timeline.test.tsx`** (extend existing):
- toggling a kind chip hides non-matching rows
- typing in the search input filters by substring
- "X of Y shown" appears only when filtered; "reset" appears only when filtered; clicking reset restores all rows
- scrub snap: scrub to a tick, apply a filter that hides it, assert `scrubTick` snaps to the nearest visible tick

**Hook — `__tests__/useGlobalShortcuts.test.tsx`** (extend existing):
- `/` (no modifier) fires `onFocusFilter`
- `/` inside an input is ignored (existing typing-target guard)

## File summary

```
packages/ui/src/
├── panels/
│   ├── Timeline.tsx                            MODIFIED — filter panel, visibleEntries, scrub snap
│   ├── timelineFilter.ts                       NEW — pure matcher + helpers
│   └── __tests__/timelineFilter.test.ts        NEW
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

## Risks

1. **Sticky filter on reload could confuse users** ("why is the timeline empty?"). Mitigated by the always-visible "X of Y shown" + reset button when any filter is non-default — the state is never hidden.
2. **Set-in-Zustand persistence quirk:** Sets don't `JSON.stringify` natively. The hydrate/persist path serializes via `Array.from` and rebuilds Sets on read. Tested directly.
3. **Empty filtered list edge case:** explicitly handled in the empty-state branch of Timeline.
