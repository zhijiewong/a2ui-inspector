# A2UI Inspector — Errors & Diagnostics Panel Design

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-23
**Depends on:** A2UI Inspector v1 + v1.1 + Share-via-URL + Timeline filter + Bookmarks (all on `main`)

## Context

The inspector today shows the session stream, but failures inside that stream are invisible. The sidecar silently drops messages that fail `safeParse`. Protocol mistakes (unknown surface, dangling componentRef) replay without complaint. Upstream connect/disconnect history disappears as soon as the status bar updates. Preview throws were once mistaken for bundler bugs (the React #130 catalog-mismatch incident) because nothing in the UI named the failure.

This spec adds an **Errors & Diagnostics panel** that surfaces every failure mode in one filterable list, with red dots on the affected timeline ticks and one-click jump-to. Read-only and replay-first.

## Scope

**In scope:**
- Four diagnostic categories: `schema` (sidecar parse failures), `protocol` (dangling refs, version skew, unknown surface), `transport` (bridge/upstream connect/disconnect/auth/file errors), `render` (preview boundary catches).
- Severities: `error` and `warn`.
- New right-sidebar tab `Errors` with category + severity filter chips and a list of `[dot] tick · code · message` rows; click jumps focus to the tick.
- Red dot on Timeline rows for any tick with diagnostics.
- New shared `DiagnosticSchema`; new `EventSchema` variant for bridge transport.
- Sidecar emits diagnostics over the bridge AND persists them to `.a2ui-session.diagnostics.jsonl`.
- UI derives `protocol` and `render` diagnostics client-side so pure `#share=` replays (no sidecar) still get them.

**Explicitly out:**
- ❌ Error suppression, "ignore similar", or any mutation.
- ❌ Severity beyond `error`/`warn` (no `info`, no `debug`).
- ❌ Notifications/toasts/sound — the existing inspector is replay-first, not alerting.
- ❌ Diagnostics inside the `#share=` URL fragment. Replay-derived categories (`protocol`, `render`) recompute from entries; `schema`/`transport` are live-session concepts that don't replay.
- ❌ Cross-session error history or trend graphs.
- ❌ Stack-trace symbolication or sourcemap resolution.

## Goals

1. Every failure the inspector can detect appears in one place, filterable by category.
2. Replay (file or share link) surfaces as much as it possibly can without sidecar plumbing.
3. Small surface area — one new schema, one new store, one new panel, one error boundary. No new dependencies.

## Architecture

### Shared schema (`packages/shared`)

```ts
export const DiagnosticSchema = z.object({
  tick: z.number().int().optional(),       // omitted for transport events before first tick
  ts: z.number(),                          // ms epoch
  category: z.enum(["schema", "protocol", "transport", "render"]),
  severity: z.enum(["error", "warn"]),
  code: z.string(),                        // stable identifier, e.g. "parse-failed", "dangling-ref"
  message: z.string(),                     // human-readable
  detail: z.unknown().optional(),          // category-specific payload
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
```

`EventSchema` gains a discriminated variant:

```ts
{ type: "diagnostic"; diagnostic: Diagnostic }
```

alongside the existing `entry`/`status`/etc. variants. Bridge clients that don't recognise the variant already `safeParse` and drop — forward-compatible by construction.

### Sidecar (`packages/sidecar`)

**`adapters/websocket.ts`, `adapters/sse.ts`** — replace silent `return` on parse failure with:
```ts
const diagnostic: Diagnostic = {
  ts: Date.now(),
  category: "schema",
  severity: "error",
  code: "parse-failed",
  message: result.error.issues[0]?.message ?? "schema validation failed",
  detail: { raw: data.toString().slice(0, 1024) }, // bounded
};
store.appendDiagnostic(diagnostic);
```
`store.appendDiagnostic` then emits the bridge event via the existing event channel.

**Upstream status mirror** — `onStatus(s)` callback in each adapter additionally calls `store.appendDiagnostic({ category: "transport", code: s.status, ... })` for `connecting`/`connected`/`closed`/`error` transitions. The status bar's behavior is unchanged.

**`SessionStore`** — add:
```ts
appendDiagnostic(d: Diagnostic): void          // also fires bridge event
diagnostics(): Diagnostic[]
```
Persisted to a parallel `.a2ui-session.diagnostics.jsonl` next to the entries file. Loaded on startup like entries are. Keeping it as a separate file avoids changing the entries-file format and lets old recordings load cleanly (empty diagnostics).

### UI (`packages/ui`)

**`useDiagnosticsStore`** (Zustand) — `Map<string, Diagnostic>` keyed by a stable id (`${ts}-${category}-${code}-${tick ?? "-"}`-index for collisions). Selectors:
- `byTick: Map<number, Diagnostic[]>` — derived from the map, recomputed on add/clear (cheap; sessions are bounded).
- `add(d)`, `addMany(ds)`, `clear()`.

**`deriveProtocolDiagnostics(entries: SessionEntry[]): Diagnostic[]`** — pure function in `packages/ui/src/diagnostics/`. Walks the stream and emits:
- `code: "unknown-surface"` when an `updateComponents` references a surface that was never `createSurface`'d.
- `code: "dangling-ref"` when a `componentRef` resolves to no component at end-of-stream (intra-stream out-of-order is allowed).
- `code: "version-mismatch"` when an entry carries a `version` field that does not equal `"v0.9"` (the only protocol version this build targets).

Wrapped in `try/catch`; if the walk itself throws, emit a single `{ category: "protocol", code: "derive-crashed" }`.

**`<PreviewErrorBoundary>`** — standard React class boundary around the preview. `componentDidCatch` calls `useDiagnosticsStore.getState().add({ category: "render", tick: useFocusStore.getState().tick, code: "preview-threw", message: err.message })`. Fallback UI: `"Preview crashed at tick {tick} — see Errors panel."`

**`ErrorsPanel`** (new tab in the right sidebar):
```
┌─ Errors (3) ──────────────────────────┐
│ [×] schema  [×] protocol  [×] render  │   ← filter chips, click to toggle
│ [×] error   [ ] warn                  │
├───────────────────────────────────────┤
│ ● tick #5  parse-failed               │   ← red dot, click row to jump
│   Expected string at .createSurface…  │
│   ▸ detail                            │   ← expandable JSON
│ ● tick #8  dangling-ref               │
│   componentRef "btn-3" not found      │
│ ◐ —        connect-error              │   ← no tick (transport pre-tick)
│   ECONNREFUSED 127.0.0.1:8787         │
└───────────────────────────────────────┘
```

Empty state: `"No errors in this session."`

**`Timeline.tsx`** — each row consults `useDiagnosticsStore(s => s.byTick.get(tick))`; if non-empty, render a small `bg-red-500` dot at row start (next to the existing direction arrow). Multiple diagnostics on one tick: single dot (count visible in the panel).

### Lifecycle

`useDiagnosticsStore.clear()` is called from the same three session-replacement paths as `useBookmarksStore.clear()` in `packages/ui/src/store/session.ts`: `reset()`, `loadEntries()`, and the `sessionLoaded` event branch. Tests extend `sessionLoadEntries.test.ts` to cover both stores.

On `#share=` boot: after `loadEntries(decoded.entries)` (which clears diagnostics), the App calls `useDiagnosticsStore.getState().addMany(deriveProtocolDiagnostics(decoded.entries))` so protocol diagnostics appear on replay even without a sidecar.

On sidecar-attached startup: the bridge replays persisted diagnostics through the new `diagnostic` event variant; UI calls `addMany`.

## Data flow

**Live session:**
1. Bad bytes → adapter `safeParse` fails → `store.appendDiagnostic` → bridge `event: { type: "diagnostic" }` → UI `useDiagnosticsStore.add`.
2. Good message → existing `appendMessage` → UI `useSessionStore` appends entry → incremental `deriveProtocolDiagnostics` runs on the new entry → adds any protocol diagnostics.
3. Upstream status change → existing `onStatus` → sidecar mirrors as transport diagnostic.
4. Preview throws → `<PreviewErrorBoundary>` → diagnostic added with `category: "render"`.

**Replay session (`#share=` or `.jsonl`):**
1. Entries arrive; if sidecar is in the loop, persisted diagnostics file is forwarded too.
2. `deriveProtocolDiagnostics(entries)` seeds protocol diagnostics one time.
3. Render-boundary catches still happen live during replay.

**Jump-to-tick:** clicking a panel row calls existing `useFocusStore.setTick(tick)`. Timeline already snaps the scrubber. No new coordination.

## Error handling

- `useDiagnosticsStore` mutations are Map operations — cannot fail.
- `deriveProtocolDiagnostics` wrapped in `try/catch`; a crash inside the walk surfaces as its own diagnostic (`code: "derive-crashed"`).
- `<PreviewErrorBoundary>` follows React's standard pattern; the boundary only catches throws from descendants, so it cannot recurse.
- Sidecar diagnostic emission is best-effort: if bridge WS is disconnected, diagnostic is still in `SessionStore` and gets delivered via the existing sync path on reconnect.
- A malformed `DiagnosticSchema` arriving over the bridge fails `safeParse` and is logged + dropped. A single meta `{ category: "schema", code: "diagnostic-parse-failed" }` is added by the UI, bounded so it can't recurse (we don't emit a meta-diagnostic when the offender is itself a meta-diagnostic).

## Testing

**Shared — `packages/shared/src/__tests__/diagnostic.test.ts`** (NEW)
- `DiagnosticSchema` round-trips a full record.
- Rejects missing `category` / unknown `severity` / non-string `code`.

**Sidecar — extend `__tests__/websocket.test.ts` + `__tests__/sse.test.ts`**
- Feed malformed bytes → expect exactly one `schema` diagnostic appended AND emitted over bridge.
- `onStatus("error", ...)` → expect a `transport` diagnostic mirrored.

**Sidecar — extend `__tests__/persistence.test.ts`**
- Save a session with diagnostics → load → entries AND diagnostics both restored.
- Load an old recording with no `.diagnostics.jsonl` → diagnostics empty (no throw).

**UI — `src/diagnostics/__tests__/deriveProtocolDiagnostics.test.ts`** (NEW)
- Empty input → `[]`.
- `updateComponents` for never-created surface → one `unknown-surface` diagnostic.
- `componentRef` to never-created component at end-of-stream → `dangling-ref`.
- Out-of-order create/use → no diagnostic.
- Version skew across entries → `version-mismatch`.
- Walker throws on a malformed entry → single `derive-crashed` diagnostic, no rethrow.

**UI — `src/store/__tests__/diagnosticsStore.test.ts`** (NEW)
- `add` then `byTick.get(tick)` returns the diagnostic.
- Two diagnostics on the same tick → `byTick.get(tick)` returns both.
- `clear()` empties both map and `byTick`.

**UI — `src/__tests__/PreviewErrorBoundary.test.tsx`** (NEW)
- Child component throws → boundary renders fallback AND `useDiagnosticsStore` gains a `render` diagnostic.
- Multiple renders without throw → no diagnostic added.

**UI — `src/panels/__tests__/ErrorsPanel.test.tsx`** (NEW)
- Renders empty state when store empty.
- Renders one row per diagnostic with category, code, message.
- Filter chip toggle hides matching rows.
- Click on a row calls `useFocusStore.setTick`.

**UI — extend `src/__tests__/Timeline.test.tsx`**
- A row with a diagnostic at that tick renders the red dot.
- A row with multiple diagnostics still renders exactly one dot.

**UI — extend `src/__tests__/sessionLoadEntries.test.ts`**
- `reset()`, `loadEntries()`, and a `sessionLoaded` event all also clear diagnostics (in addition to bookmarks).

**E2E — `tests/e2e/errors.spec.ts`** (NEW)
- Load a fixture session containing an entry that triggers `unknown-surface`.
- Assert the timeline row has the red dot.
- Open the Errors tab → assert the diagnostic row is listed.
- Click the row → assert the timeline scrubber jumps to that tick.

## File summary

```
packages/shared/src/
├── diagnostic.ts                                NEW — DiagnosticSchema
├── events.ts (or index.ts)                      MODIFIED — add { type: "diagnostic" } variant
└── __tests__/diagnostic.test.ts                 NEW

packages/sidecar/src/
├── session/store.ts                             MODIFIED — appendDiagnostic, diagnostics()
├── session/persistence.ts                       MODIFIED — read/write .diagnostics.jsonl
├── adapters/websocket.ts                        MODIFIED — emit schema + transport diagnostics
├── adapters/sse.ts                              MODIFIED — emit schema + transport diagnostics
├── bridge/server.ts (event forwarding)          MODIFIED — forward diagnostic events
└── __tests__/{websocket,sse,persistence}.test.ts MODIFIED

packages/ui/src/
├── diagnostics/
│   ├── deriveProtocolDiagnostics.ts             NEW
│   └── __tests__/deriveProtocolDiagnostics.test.ts NEW
├── store/
│   ├── diagnostics.ts                           NEW — useDiagnosticsStore
│   ├── session.ts                               MODIFIED — clear diagnostics on session replace
│   └── __tests__/diagnosticsStore.test.ts       NEW
├── components/
│   └── PreviewErrorBoundary.tsx                 NEW
├── panels/
│   ├── ErrorsPanel.tsx                          NEW
│   ├── Timeline.tsx                             MODIFIED — red dot per row
│   └── __tests__/ErrorsPanel.test.tsx           NEW
├── App.tsx                                      MODIFIED — register ErrorsPanel tab, seed protocol diagnostics on share boot, wrap preview in error boundary
└── __tests__/{Timeline,sessionLoadEntries,PreviewErrorBoundary}.test.tsx MODIFIED/NEW

tests/e2e/errors.spec.ts                         NEW
```

## Risks

1. **Sidecar adapters previously dropped bad bytes silently** — now they emit. Any downstream tool listening on the bridge that hadn't anticipated a `diagnostic` event will see an unknown variant. Mitigated by the bridge client's existing safeParse-and-skip behavior for unknown event variants.
2. **Protocol-error heuristics are subjective** — the "dangling at end-of-stream" rule avoids false positives from out-of-order delivery but will miss genuine intra-stream bugs. Acceptable for v1; revisit if real recordings produce too few or too many.
3. **New on-disk file** — `.a2ui-session.diagnostics.jsonl` lives next to the existing session file. Documented in `persistence.ts` and the README; old recordings without it load with empty diagnostics.
4. **`deriveProtocolDiagnostics` cost on huge sessions** — pure walk over entries, O(n). Memoised by entry-length so it only recomputes when entries change; matches how filter-matcher works today.
