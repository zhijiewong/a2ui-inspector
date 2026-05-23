# A2UI Inspector — Bookmarks Design

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-23
**Depends on:** A2UI Inspector v1 + v1.1 + Share-via-URL + Timeline filter (all on `main`)

## Context

Inspector users want to mark a specific tick — "this is where it broke" — and send a colleague a link that opens the same recording with the same marker visible. The Timeline already supports scrubbing and filtering, but there's no way to label a tick or to share that label. This spec adds **per-tick bookmarks with optional text notes**, persisted into share links.

## Scope

**In scope:**
- Per-tick bookmarks (one per tick) with an optional plain-text note.
- Inline UI: a star icon on each Timeline row; click to toggle; shift-click to edit the note.
- Bookmarks travel in the `#share=` URL fragment so a shared link replays with the same markers.

**Explicitly out (per scoping decisions):**
- ❌ Bookmarks in file `Save`/`Load` (would require sidecar plumbing through `loadSession`/`saveSession`, the bridge protocol, and the sidecar SessionStore — disproportionate for the bug-report use case the share link already covers).
- ❌ Multiple bookmarks per tick.
- ❌ Markdown / rich-text notes — plain string only.
- ❌ Bookmark colors / categories.
- ❌ A separate "Bookmarks" panel or tab — inline only.
- ❌ Keyboard shortcut to toggle bookmark on the active tick — left for a future iteration if it proves missed.
- ❌ Sidecar/`@a2ui-inspector/shared` schema changes — bookmarks live entirely in the UI codebase.

## Goals

1. One-click bookmark from the Timeline; one-shift-click to edit the why.
2. A shared link round-trips both the session and its bookmarks (backwards-compatible with already-shared entries-only links).
3. Small surface area — no new dependencies, no cross-package schema changes.

## Architecture

### Data type

```ts
interface Bookmark { tick: number; note: string }   // note may be ""
```

Tick is the key — one bookmark per tick. Keeping `Bookmark` minimal (no id, no createdAt, no author) trades the metadata for a smaller wire format and simpler semantics.

### `useBookmarksStore` — new Zustand store

```ts
interface BookmarksState {
  bookmarks: Map<number, Bookmark>;             // tick → bookmark
  has: (tick: number) => boolean;
  get: (tick: number) => Bookmark | undefined;
  toggle: (tick: number) => void;               // add (empty note) / remove
  setNote: (tick: number, note: string) => void; // edit; creates if missing
  loadAll: (bookmarks: Bookmark[]) => void;     // replace all on session load
  clear: () => void;
}
```

Not persisted to `localStorage` — bookmarks are session-scoped, not user-scoped. They are cleared when the session is replaced (file load, `clear` command, etc.) and restored from the share fragment when one is opened.

### `useBookmarkEditorStore` — tiny popover open-state store

```ts
interface BookmarkEditorState {
  openTick: number | undefined;
  openFor: (tick: number) => void;
  close: () => void;
}
```

Lets the Timeline star button trigger the popover declaratively; the popover is rendered once at App root and listens to this store.

### Share codec — wire-format extension

Current codec encodes `SessionEntry[]` as JSONL → gzip → base64url. New encoder takes `(entries, bookmarks?)` and writes JSONL where each line is either a `SessionEntry` (unchanged shape) or a `{ "bookmark": Bookmark }` line. Decoder partitions lines into `entries[]` and `bookmarks[]` and returns `{ entries, bookmarks }`.

Decoder shape detection: a parsed JSON line is a bookmark iff its top-level keys are exactly `{ bookmark }`; otherwise it's parsed as a `SessionEntry`. Anything else throws `ShareDecodeError` (existing behaviour).

**Backwards compat:** previously-shared fragments contain only entry-JSONL — no bookmark lines. The new decoder handles them transparently and returns `{ entries, bookmarks: [] }`. Already-shared links keep working.

`encodeSession` signature becomes `encodeSession(entries: SessionEntry[], bookmarks?: Bookmark[], maxBytes?): Promise<EncodeResult>` — `bookmarks` defaults to `[]`.

### Boot wiring

The existing `#share=` boot effect in `App.tsx` runs `decodeSession(fragment)` and currently calls `useSessionStore.getState().loadEntries(decoded)`. After this change `decoded` is `{ entries, bookmarks }` — the effect calls both `loadEntries(decoded.entries)` AND `useBookmarksStore.getState().loadAll(decoded.bookmarks)`.

The Share button (in `ShareDialog`) now reads both the session entries and the bookmarks and passes them to `encodeSession`.

## UI

### Star icon on each Timeline row

Each `<li>` in `Timeline.tsx`'s visible-entry list gets a star button at the right edge.

- **Not bookmarked**: empty `Star` icon (`lucide-react`), `text-ink-faint`, opacity 0 by default, opacity 1 on row hover (`group-hover:opacity-100`).
- **Bookmarked**: filled `Star` (`fill="currentColor"`), `text-amber-400`, always visible.
- **Click**: `useBookmarksStore.getState().toggle(tick)`. `stopPropagation()` so it does not also fire the row's click-to-scrub.
- **Shift-click**: `useBookmarkEditorStore.getState().openFor(tick)`.

When a row IS bookmarked, the note text is rendered inline under the row in `text-ink-muted text-[10px]`, truncated if long. Empty-note bookmarks show the star only.

### `BookmarkNotePopover` component

A small hand-rolled modal (same `fixed inset-0 z-50` pattern as `ShareDialog` and `CommandPalette` — no Radix dependency):

```
┌─────────────────────────────┐
│ Bookmark · tick #5          │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ <textarea note>         │ │
│ └─────────────────────────┘ │
│ [Remove]    [Cancel] [Save] │
└─────────────────────────────┘
```

- Open: reads `useBookmarkEditorStore.openTick`; renders nothing when `undefined`.
- Pre-fills the `<textarea>` with the current note (or empty if not yet bookmarked).
- **Save** → `useBookmarksStore.setNote(tick, draft); editor.close()`.
- **Remove** → `useBookmarksStore.toggle(tick)` to delete; `editor.close()`. Hidden when the tick isn't yet bookmarked.
- **Cancel** → `editor.close()` (discards draft).
- Click outside → cancel (same pattern as ShareDialog).
- Mounted once at App root.

## Error handling

- `decodeSession` of a malformed bookmark line throws `ShareDecodeError` (same path as a malformed entry line) — whole fragment rejected, App falls through to normal startup with the inline error strip. No partial render.
- `encodeSession` with too-large output still returns `{ ok: false, reason: "too-large" }`. Bookmarks added to a session do count against the 256 KB cap — large notes can push it over, in which case the existing "use Save to export" fallback applies.
- The popover is robust to the bookmark being deleted out from under it (e.g., a `clear()` during edit): on save, if the tick is not in the store, `setNote` creates it; on remove, `toggle` is a no-op if absent.

## Testing

**Store — `__tests__/bookmarksStore.test.ts`** (Vitest)
- defaults: empty `bookmarks` map
- `toggle(tick)` adds with empty note; `toggle(tick)` again removes
- `setNote(tick, note)` updates an existing bookmark; creates one if missing
- `has` / `get` reflect the map
- `loadAll(arr)` replaces all
- `clear()` empties the map

**Store — `__tests__/bookmarkEditorStore.test.ts`**: `openFor` sets `openTick`; `close` clears it.

**Codec — extend `share/__tests__/codec.test.ts`**:
- `encodeSession(entries, bookmarks)` → `decodeSession` returns `{ entries, bookmarks }` exactly
- empty `bookmarks` round-trips as `[]`
- a legacy fragment (encoded by the old codec, entries-only JSONL) decodes with `bookmarks: []` (compose by calling the existing test helper `_gzipToFragment(jsonl)` on an entries-only payload)

**Timeline — extend `__tests__/Timeline.test.tsx`**:
- a row exposes a star button (hover-revealed)
- clicking it adds a bookmark to the store at that tick (and does not change scrub)
- clicking again removes it
- shift-click sets `useBookmarkEditorStore.openTick` to that tick
- a bookmarked row renders the filled star and (when present) the note text

**Popover — `__tests__/BookmarkNotePopover.test.tsx`**:
- renders nothing when `openTick === undefined`
- opens with the existing note pre-filled
- Save calls `setNote` with the draft and closes the editor
- Remove calls `toggle` (which removes) and closes
- Cancel closes without mutating

**E2E — extend `tests/e2e/share.spec.ts`** (or new `tests/e2e/bookmarks.spec.ts`):
- load fixture session → hover a row → click its star → assert filled star
- shift-click the star → editor opens → type a note → Save → assert note rendered
- click Share → read the link → open it in a fresh navigation → assert the filled star + note text appear, and the read-only banner is shown

## File summary

```
packages/ui/src/
├── store/
│   ├── bookmarks.ts                       NEW
│   └── bookmarkEditor.ts                  NEW
├── components/
│   └── BookmarkNotePopover.tsx            NEW
├── panels/
│   └── Timeline.tsx                       MODIFIED — star button + inline note
├── share/
│   ├── codec.ts                           MODIFIED — encode/decode {entries, bookmarks}
│   └── __tests__/codec.test.ts            MODIFIED — bookmark round-trip + legacy
├── __tests__/
│   ├── bookmarksStore.test.ts             NEW
│   ├── bookmarkEditorStore.test.ts        NEW
│   ├── BookmarkNotePopover.test.tsx       NEW
│   └── Timeline.test.tsx                  MODIFIED — star + popover-open cases
├── components/ShareDialog.tsx             MODIFIED — pass bookmarks into encodeSession
└── App.tsx                                MODIFIED — boot loads bookmarks; render popover at root

tests/e2e/share.spec.ts                    MODIFIED — bookmark survives share round-trip
```

## Risks

1. **Bookmarks lost on file Save/Load.** Surprising to users who expect the file to be a full snapshot. Acceptable given the scoping decision and the share-link alternative; revisit when the file path becomes the dominant workflow.
2. **`encodeSession` signature change** ripples through the one existing call site in `ShareDialog`. Captured in the file summary.
3. **Codec wire format change** is backwards-compatible only at decode; new encodings of bookmark-less sessions still write a different (but valid) JSONL stream (no bookmark lines), so produced fragments stay smaller in the common case.
