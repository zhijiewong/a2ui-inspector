# Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-tick bookmarks with optional text notes; an inline star on each Timeline row toggles them; shift-click opens a note editor; bookmarks travel inside `#share=` URL fragments.

**Architecture:** Two new Zustand stores (`useBookmarksStore` holds a `Map<tick, Bookmark>`; `useBookmarkEditorStore` holds the open-popover tick). The Share codec wire format becomes mixed JSONL — each line is either a `SessionEntry` (existing) or a `{ bookmark: { tick, note } }` line; the decoder partitions and returns `{ entries, bookmarks }`. UI-only — no sidecar/`@a2ui-inspector/shared` changes.

**Tech Stack:** Existing — TypeScript 5, React 18, Zustand 4, Tailwind, Vitest + React Testing Library, Playwright, `lucide-react`.

---

## Scope

One feature, 7 tasks. Implements the approved spec `docs/superpowers/specs/2026-05-23-bookmarks-design.md`.

## Starting state

- Branch off `main`: `bookmarks-impl` (already created, spec committed).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`.
- Existing relevant code:
  - `packages/ui/src/share/codec.ts` — `encodeSession(entries, maxBytes?)`, `decodeSession(fragment): Promise<SessionEntry[]>`, `_gzipToFragment(text)`, `ShareDecodeError`, `MAX_FRAGMENT_BYTES`. (Full content in Task 3.)
  - `packages/ui/src/components/ShareDialog.tsx` — currently calls `encodeSession(entries)`. (Full content in Task 6.)
  - `packages/ui/src/App.tsx` — boot effect does `decodeSession(fragment).then((decoded) => { useSessionStore.getState().loadEntries(decoded); ... })`. The `entries` selector reads from `useSessionStore`.
  - `packages/ui/src/panels/Timeline.tsx` — renders one `<li>` per visible entry with `onClick={() => setScrub(e.tick)}`.
  - UI tokens: `bg-app`/`surface`/`raised`, `border-edge`/`edge-strong`, `text-ink`/`ink-muted`/`ink-faint`. Accents: `amber-400`, `emerald-400`.
  - Modal pattern (CommandPalette, ShareDialog): hand-rolled `fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24`, inner `bg-surface border border-edge-strong rounded p-4` with `onClick={(e) => e.stopPropagation()}` to keep clicks inside.
  - `packages/ui/src/__tests__/setup.ts` polyfills `localStorage` and runs `afterEach(cleanup)`.

## File summary

```
packages/ui/src/
├── share/
│   ├── codec.ts                          MODIFIED — Bookmark type; encode/decode {entries, bookmarks}
│   └── __tests__/codec.test.ts           MODIFIED — round-trip + legacy + decode return shape
├── store/
│   ├── bookmarks.ts                      NEW — useBookmarksStore
│   └── bookmarkEditor.ts                 NEW — useBookmarkEditorStore
├── components/
│   ├── BookmarkNotePopover.tsx           NEW
│   └── ShareDialog.tsx                   MODIFIED — pass bookmarks to encodeSession
├── panels/Timeline.tsx                   MODIFIED — star button + inline note line
├── __tests__/
│   ├── bookmarksStore.test.ts            NEW
│   ├── bookmarkEditorStore.test.ts       NEW
│   ├── BookmarkNotePopover.test.tsx      NEW
│   └── Timeline.test.tsx                 MODIFIED — star + popover + scrub-doesn't-fire cases
└── App.tsx                               MODIFIED — boot effect destructures {entries,bookmarks}; mounts popover

tests/e2e/share.spec.ts                   MODIFIED — bookmark survives share round-trip
```

## Pre-flight

1. Run `pnpm test` after each task — Phase 1+2+filter (177 UI/sidecar/etc.) tests must stay green, modulo Task 3 which is intentionally a breaking change resolved by Task 6.
2. Commit after every task.

---

## Task 1: `useBookmarksStore`

**Files:**
- Create: `packages/ui/src/store/bookmarks.ts`
- Create: `packages/ui/src/__tests__/bookmarksStore.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/bookmarksStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useBookmarksStore, type Bookmark } from "../store/bookmarks.js";

beforeEach(() => useBookmarksStore.getState().clear());

describe("useBookmarksStore", () => {
  it("starts empty", () => {
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
  });

  it("toggle(tick) adds a bookmark with an empty note", () => {
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(1);
    expect(useBookmarksStore.getState().bookmarks.get(5)).toEqual({ tick: 5, note: "" });
    expect(useBookmarksStore.getState().has(5)).toBe(true);
  });

  it("toggle(tick) on an existing bookmark removes it", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
    expect(useBookmarksStore.getState().has(5)).toBe(false);
  });

  it("setNote updates an existing note", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarksStore.getState().setNote(5, "broken here");
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("broken here");
  });

  it("setNote creates a bookmark if missing", () => {
    useBookmarksStore.getState().setNote(7, "note");
    expect(useBookmarksStore.getState().bookmarks.get(7)).toEqual({ tick: 7, note: "note" });
  });

  it("get returns the bookmark or undefined", () => {
    expect(useBookmarksStore.getState().get(5)).toBeUndefined();
    useBookmarksStore.getState().toggle(5);
    expect(useBookmarksStore.getState().get(5)).toEqual({ tick: 5, note: "" });
  });

  it("loadAll replaces the current set", () => {
    useBookmarksStore.getState().toggle(99);
    const fresh: Bookmark[] = [{ tick: 1, note: "a" }, { tick: 3, note: "b" }];
    useBookmarksStore.getState().loadAll(fresh);
    expect(useBookmarksStore.getState().bookmarks.size).toBe(2);
    expect(useBookmarksStore.getState().has(99)).toBe(false);
    expect(useBookmarksStore.getState().has(1)).toBe(true);
    expect(useBookmarksStore.getState().get(3)?.note).toBe("b");
  });

  it("clear empties the map", () => {
    useBookmarksStore.getState().toggle(1);
    useBookmarksStore.getState().toggle(2);
    useBookmarksStore.getState().clear();
    expect(useBookmarksStore.getState().bookmarks.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/bookmarks.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/store/bookmarks.ts`**

```typescript
import { create } from "zustand";

export interface Bookmark {
  tick: number;
  note: string;
}

interface BookmarksState {
  bookmarks: Map<number, Bookmark>;
  has: (tick: number) => boolean;
  get: (tick: number) => Bookmark | undefined;
  toggle: (tick: number) => void;
  setNote: (tick: number, note: string) => void;
  loadAll: (bookmarks: Bookmark[]) => void;
  clear: () => void;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: new Map(),

  has: (tick) => get().bookmarks.has(tick),
  get: (tick) => get().bookmarks.get(tick),

  toggle: (tick) => {
    const next = new Map(get().bookmarks);
    if (next.has(tick)) next.delete(tick);
    else next.set(tick, { tick, note: "" });
    set({ bookmarks: next });
  },

  setNote: (tick, note) => {
    const next = new Map(get().bookmarks);
    next.set(tick, { tick, note });
    set({ bookmarks: next });
  },

  loadAll: (bookmarks) => {
    const next = new Map<number, Bookmark>();
    for (const b of bookmarks) next.set(b.tick, b);
    set({ bookmarks: next });
  },

  clear: () => set({ bookmarks: new Map() }),
}));
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — 8 bookmarks-store tests green.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/store/bookmarks.ts packages/ui/src/__tests__/bookmarksStore.test.ts
git commit -m "feat(ui): add useBookmarksStore"
```

---

## Task 2: `useBookmarkEditorStore`

**Files:**
- Create: `packages/ui/src/store/bookmarkEditor.ts`
- Create: `packages/ui/src/__tests__/bookmarkEditorStore.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/bookmarkEditorStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

beforeEach(() => useBookmarkEditorStore.setState({ openTick: undefined }));

describe("useBookmarkEditorStore", () => {
  it("defaults openTick to undefined", () => {
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("openFor sets openTick", () => {
    useBookmarkEditorStore.getState().openFor(5);
    expect(useBookmarkEditorStore.getState().openTick).toBe(5);
  });

  it("close clears openTick", () => {
    useBookmarkEditorStore.getState().openFor(5);
    useBookmarkEditorStore.getState().close();
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @a2ui-inspector/ui test`; missing module.

- [ ] **Step 3: Implement `packages/ui/src/store/bookmarkEditor.ts`**

```typescript
import { create } from "zustand";

interface BookmarkEditorState {
  openTick: number | undefined;
  openFor: (tick: number) => void;
  close: () => void;
}

export const useBookmarkEditorStore = create<BookmarkEditorState>((set) => ({
  openTick: undefined,
  openFor: (openTick) => set({ openTick }),
  close: () => set({ openTick: undefined }),
}));
```

- [ ] **Step 4: Run, verify pass** — 3 editor-store tests green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/store/bookmarkEditor.ts packages/ui/src/__tests__/bookmarkEditorStore.test.ts
git commit -m "feat(ui): add useBookmarkEditorStore"
```

---

## Task 3: Codec — encode/decode `{ entries, bookmarks }`

**Files:**
- Modify: `packages/ui/src/share/codec.ts`
- Modify: `packages/ui/src/share/__tests__/codec.test.ts`

### Current `packages/ui/src/share/codec.ts` (relevant signatures)

```ts
export async function encodeSession(entries: SessionEntry[], maxBytes?: number): Promise<EncodeResult>;
export async function decodeSession(fragment: string): Promise<SessionEntry[]>;
```

`decodeSession`'s return type is changing from `SessionEntry[]` to `{ entries, bookmarks }`. This is a BREAKING change for App.tsx (the only call site) — that break is resolved in Task 6. After this task, `pnpm --filter @a2ui-inspector/ui typecheck` will FAIL with ONE error in `App.tsx` about the destructured shape. That is the expected intermediate state.

### Bookmark type — re-exported from the bookmarks store

The codec needs the `Bookmark` shape. Import the type from the store created in Task 1 to avoid a duplicate definition.

- [ ] **Step 1: Replace the existing decoder test in `share/__tests__/codec.test.ts`**

The existing codec test file has cases like `expect(decoded).toEqual(entries)`. With the new return shape they need to expect `{ entries, bookmarks }`. Make these line-level edits to the existing tests (do not rewrite the whole file):

Wherever a test does:
```typescript
const decoded = await decodeSession(res.fragment);
expect(decoded).toEqual(entries);
```
change to:
```typescript
const decoded = await decodeSession(res.fragment);
expect(decoded.entries).toEqual(entries);
expect(decoded.bookmarks).toEqual([]);
```

Wherever a test does:
```typescript
expect(await decodeSession(res.fragment)).toEqual([]);
```
change to:
```typescript
const decoded = await decodeSession(res.fragment);
expect(decoded.entries).toEqual([]);
expect(decoded.bookmarks).toEqual([]);
```

The four `await expect(decodeSession(...)).rejects.toBeInstanceOf(ShareDecodeError)` cases are unchanged — they still reject the same way.

Then APPEND a new `describe("session codec — bookmarks", ...)` block to the same file:

```typescript
import type { Bookmark } from "../../store/bookmarks.js";

describe("session codec — bookmarks", () => {
  const entry = (tick: number): SessionEntry => ({
    tick, ts: 1000 + tick, direction: "agent->client",
    message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
  });

  it("round-trips bookmarks alongside entries", async () => {
    const entries = [entry(0), entry(1)];
    const bookmarks: Bookmark[] = [{ tick: 0, note: "broke here" }, { tick: 1, note: "" }];
    const res = await encodeSession(entries, bookmarks);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const decoded = await decodeSession(res.fragment);
    expect(decoded.entries).toEqual(entries);
    expect(decoded.bookmarks).toEqual(bookmarks);
  });

  it("encodes an empty bookmarks list", async () => {
    const res = await encodeSession([entry(0)], []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const decoded = await decodeSession(res.fragment);
    expect(decoded.bookmarks).toEqual([]);
  });

  it("decodes a legacy entries-only fragment with bookmarks: []", async () => {
    // The pre-bookmarks codec wrote pure entry-JSONL with no bookmark lines.
    // Reproduce that by hand-building the JSONL and feeding it through the
    // same gzip+base64url pipeline via the existing _gzipToFragment helper.
    const legacyJsonl = [entry(0), entry(1)].map((e) => JSON.stringify(e)).join("\n");
    const legacyFragment = await _gzipToFragment(legacyJsonl);
    const decoded = await decodeSession(legacyFragment);
    expect(decoded.entries.length).toBe(2);
    expect(decoded.bookmarks).toEqual([]);
  });

  it("rejects a malformed bookmark line via ShareDecodeError", async () => {
    // bookmark line with a non-numeric tick.
    const badJsonl = JSON.stringify({ bookmark: { tick: "x", note: "n" } });
    const badFragment = await _gzipToFragment(badJsonl);
    await expect(decodeSession(badFragment)).rejects.toBeInstanceOf(ShareDecodeError);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — codec tests fail because `decodeSession` still returns `SessionEntry[]` (no `.entries`/`.bookmarks` fields).

- [ ] **Step 3: Replace `packages/ui/src/share/codec.ts` entirely**

```typescript
import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";
import type { Bookmark } from "../store/bookmarks.js";

/** Maximum size, in bytes, of the encoded fragment. Larger sessions fall back to file export. */
export const MAX_FRAGMENT_BYTES = 256 * 1024;

/** Thrown by decodeSession when a fragment is malformed, corrupt, or schema-invalid. */
export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

export type EncodeResult =
  | { ok: true; fragment: string }
  | { ok: false; reason: "too-large"; bytes: number };

export interface DecodedSession {
  entries: SessionEntry[];
  bookmarks: Bookmark[];
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new ShareDecodeError("fragment is not valid base64url");
  }
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ShareDecodeError("fragment is not valid base64url");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pumpThrough(
  input: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer
    .write(input)
    .then(() => writer.close())
    .catch(() => {
      /* surfaced via the readable side below */
    });
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
}

async function gzip(text: string): Promise<Uint8Array> {
  return pumpThrough(new TextEncoder().encode(text), new CompressionStream("gzip"));
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(await pumpThrough(bytes, new DecompressionStream("gzip")));
}

/** Test-only helper: gzip+base64url arbitrary text through the real pipeline. */
export async function _gzipToFragment(text: string): Promise<string> {
  return bytesToBase64url(await gzip(text));
}

function isBookmarkLine(parsed: unknown): parsed is { bookmark: unknown } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "bookmark" in parsed
  );
}

function parseBookmark(raw: unknown): Bookmark {
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { tick?: unknown }).tick === "number" &&
    Number.isFinite((raw as { tick: number }).tick) &&
    typeof (raw as { note?: unknown }).note === "string"
  ) {
    const r = raw as { tick: number; note: string };
    return { tick: r.tick, note: r.note };
  }
  throw new ShareDecodeError("fragment contains a malformed bookmark");
}

/**
 * Encode a session (and optional bookmarks) into a URL-fragment-safe string.
 * Bookmarks are interleaved as `{ bookmark: ... }` lines in the JSONL stream.
 */
export async function encodeSession(
  entries: SessionEntry[],
  bookmarks: Bookmark[] = [],
  maxBytes: number = MAX_FRAGMENT_BYTES,
): Promise<EncodeResult> {
  const entryLines = entries.map((e) => JSON.stringify(e));
  const bookmarkLines = bookmarks.map((b) => JSON.stringify({ bookmark: b }));
  const jsonl = [...entryLines, ...bookmarkLines].join("\n");
  const fragment = bytesToBase64url(await gzip(jsonl));
  if (fragment.length > maxBytes) {
    return { ok: false, reason: "too-large", bytes: fragment.length };
  }
  return { ok: true, fragment };
}

/**
 * Decode a `#share=` fragment back into `{ entries, bookmarks }`. Backwards-
 * compatible with the pre-bookmarks codec: a fragment with no bookmark lines
 * decodes with `bookmarks: []`.
 */
export async function decodeSession(fragment: string): Promise<DecodedSession> {
  const bytes = base64urlToBytes(fragment);
  let jsonl: string;
  try {
    jsonl = await gunzip(bytes);
  } catch {
    throw new ShareDecodeError("fragment is not valid gzip data");
  }
  const entries: SessionEntry[] = [];
  const bookmarks: Bookmark[] = [];
  for (const raw of jsonl.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ShareDecodeError("fragment contains a malformed JSON line");
    }
    if (isBookmarkLine(parsed)) {
      bookmarks.push(parseBookmark(parsed.bookmark));
      continue;
    }
    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new ShareDecodeError("fragment contains a non-conforming session entry");
    }
    entries.push(result.data);
  }
  return { entries, bookmarks };
}
```

- [ ] **Step 4: Verify codec tests**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: codec tests PASS. `App.tsx`-level tests (if any execute the boot path) and the typecheck will reveal the App-side break — see Step 5.

Run: `pnpm --filter @a2ui-inspector/ui typecheck`
Expected: FAIL with ONE typecheck error in `packages/ui/src/App.tsx` about treating `DecodedSession` like `SessionEntry[]`. This is the expected intermediate state; Task 6 resolves it.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/share/codec.ts packages/ui/src/share/__tests__/codec.test.ts
git commit -m "feat(ui): codec now encodes/decodes {entries, bookmarks} (back-compat)"
```

---

## Task 4: `BookmarkNotePopover` component

**Files:**
- Create: `packages/ui/src/components/BookmarkNotePopover.tsx`
- Create: `packages/ui/src/__tests__/BookmarkNotePopover.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/BookmarkNotePopover.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { BookmarkNotePopover } from "../components/BookmarkNotePopover.js";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

beforeEach(() => {
  useBookmarksStore.getState().clear();
  useBookmarkEditorStore.setState({ openTick: undefined });
});

describe("BookmarkNotePopover", () => {
  it("renders nothing when openTick is undefined", () => {
    const { container } = render(<BookmarkNotePopover />);
    expect(container.firstChild).toBeNull();
  });

  it("opens for the given tick and pre-fills an empty textarea when no bookmark exists", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    expect(screen.getByText(/Bookmark · tick #5/)).toBeTruthy();
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("pre-fills the textarea with the existing note", () => {
    useBookmarksStore.getState().setNote(5, "broke here");
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("broke here");
  });

  it("Save writes the draft via setNote and closes the editor", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "the new note" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("the new note");
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("Remove deletes the bookmark and closes the editor", () => {
    useBookmarksStore.getState().toggle(5);
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(useBookmarksStore.getState().has(5)).toBe(false);
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });

  it("Remove is hidden when the tick is not yet bookmarked", () => {
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    expect(screen.queryByRole("button", { name: /^remove$/i })).toBeNull();
  });

  it("Cancel closes without mutating", () => {
    useBookmarksStore.getState().setNote(5, "original");
    useBookmarkEditorStore.getState().openFor(5);
    render(<BookmarkNotePopover />);
    const textarea = screen.getByLabelText(/bookmark note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(useBookmarksStore.getState().bookmarks.get(5)?.note).toBe("original");
    expect(useBookmarkEditorStore.getState().openTick).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail** — module not found.

- [ ] **Step 3: Implement `packages/ui/src/components/BookmarkNotePopover.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";

export function BookmarkNotePopover() {
  const openTick = useBookmarkEditorStore((s) => s.openTick);
  const close = useBookmarkEditorStore((s) => s.close);
  const existing = useBookmarksStore((s) => (openTick === undefined ? undefined : s.bookmarks.get(openTick)));
  const setNote = useBookmarksStore((s) => s.setNote);
  const toggle = useBookmarksStore((s) => s.toggle);

  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (openTick === undefined) return;
    setDraft(existing?.note ?? "");
  }, [openTick, existing?.note]);

  if (openTick === undefined) return null;

  const onSave = () => {
    setNote(openTick, draft);
    close();
  };
  const onRemove = () => {
    if (existing) toggle(openTick);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={close}
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded border border-edge-strong bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-semibold text-ink">Bookmark · tick #{openTick}</div>
        <textarea
          aria-label="Bookmark note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What's interesting about this tick?"
          rows={4}
          className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
        />
        <div className="mt-3 flex items-center justify-between">
          {existing ? (
            <button
              onClick={onRemove}
              className="rounded border border-edge px-2 py-1 text-xs text-red-300 hover:bg-raised"
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={close}
              className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass** — 7 popover tests green; typecheck still red for App.tsx (Task 3's break, resolved by Task 6).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/BookmarkNotePopover.tsx packages/ui/src/__tests__/BookmarkNotePopover.test.tsx
git commit -m "feat(ui): add BookmarkNotePopover (edit/remove tick note)"
```

---

## Task 5: Timeline — star button + inline note

**Files:**
- Modify: `packages/ui/src/panels/Timeline.tsx` (full replace of the existing row markup; preserve everything else)
- Modify: `packages/ui/src/__tests__/Timeline.test.tsx` (add new cases)

### Current row markup (inside `Timeline.tsx`'s `visibleEntries.map(...)`)

```tsx
<li
  key={e.tick}
  onClick={() => setScrub(e.tick)}
  className={"cursor-pointer border-l-2 px-2 py-1 " + (isActive ? "border-emerald-400 bg-surface text-emerald-300" : "border-transparent hover:bg-surface")}
>
  <span className="mr-2 text-ink-muted">#{e.tick}</span>
  <span>{entryKind(e)}</span>
  {e.direction === "client->agent" ? <span className="ml-1 text-amber-400">←</span> : null}
</li>
```

### Replacement row markup

Each row becomes a `group` (Tailwind hover-group), gets an inline-flex layout with the star at the far right; an empty-state star fades in on hover, the bookmarked-state star is always visible. If a note exists it renders on a second line.

- [ ] **Step 1: Add failing test cases**

Append inside the existing `describe("Timeline", ...)` block in `packages/ui/src/__tests__/Timeline.test.tsx`. Make sure `fireEvent` is already imported from `@testing-library/react` (it is).

```tsx
  it("clicking a row's bookmark star toggles a bookmark at that tick without scrubbing", async () => {
    const { useBookmarksStore } = await import("../store/bookmarks.js");
    useBookmarksStore.getState().clear();
    const scrubBefore = useTimelineStore.getState().scrubTick;
    render(<Timeline />);
    // Each row has a star button labeled "Bookmark tick N".
    const star = screen.getByRole("button", { name: /Bookmark tick 0/ });
    fireEvent.click(star);
    expect(useBookmarksStore.getState().has(0)).toBe(true);
    expect(useTimelineStore.getState().scrubTick).toBe(scrubBefore);
    // Click again to remove.
    fireEvent.click(screen.getByRole("button", { name: /Bookmark tick 0/ }));
    expect(useBookmarksStore.getState().has(0)).toBe(false);
    useBookmarksStore.getState().clear();
  });

  it("shift-clicking the star opens the bookmark editor for that tick", async () => {
    const { useBookmarksStore } = await import("../store/bookmarks.js");
    const { useBookmarkEditorStore } = await import("../store/bookmarkEditor.js");
    useBookmarksStore.getState().clear();
    useBookmarkEditorStore.setState({ openTick: undefined });
    render(<Timeline />);
    fireEvent.click(screen.getByRole("button", { name: /Bookmark tick 1/ }), { shiftKey: true });
    expect(useBookmarkEditorStore.getState().openTick).toBe(1);
    useBookmarkEditorStore.setState({ openTick: undefined });
  });

  it("renders the note text on a bookmarked row", async () => {
    const { useBookmarksStore } = await import("../store/bookmarks.js");
    useBookmarksStore.getState().clear();
    useBookmarksStore.getState().setNote(0, "broke here");
    render(<Timeline />);
    expect(screen.getByText("broke here")).toBeTruthy();
    useBookmarksStore.getState().clear();
  });
```

- [ ] **Step 2: Run, verify fail** — star button doesn't exist yet.

- [ ] **Step 3: Replace the existing row block in `packages/ui/src/panels/Timeline.tsx`**

Open `Timeline.tsx`. Make these targeted changes:

1. Add imports at the top alongside existing imports:
```tsx
import { Star } from "lucide-react";
import { useBookmarksStore } from "../store/bookmarks.js";
import { useBookmarkEditorStore } from "../store/bookmarkEditor.js";
```

2. Inside the `Timeline()` function body, after the existing store selectors (e.g. after `isDefault`), add:
```tsx
  const bookmarksMap = useBookmarksStore((s) => s.bookmarks);
  const toggleBookmark = useBookmarksStore((s) => s.toggle);
  const openEditor = useBookmarkEditorStore((s) => s.openFor);
```

3. Find the existing row JSX block — the one rendered inside `visibleEntries.map((e) => { ... return <li ...>...</li>; })`. Replace that whole `<li>` block with:
```tsx
              <li
                key={e.tick}
                onClick={() => setScrub(e.tick)}
                className={
                  "group flex flex-col cursor-pointer border-l-2 px-2 py-1 " +
                  (isActive
                    ? "border-emerald-400 bg-surface text-emerald-300"
                    : "border-transparent hover:bg-surface")
                }
              >
                <div className="flex items-center">
                  <span className="mr-2 text-ink-muted">#{e.tick}</span>
                  <span>{entryKind(e)}</span>
                  {e.direction === "client->agent" ? (
                    <span className="ml-1 text-amber-400">←</span>
                  ) : null}
                  <button
                    aria-label={`Bookmark tick ${e.tick}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (ev.shiftKey) openEditor(e.tick);
                      else toggleBookmark(e.tick);
                    }}
                    className={
                      "ml-auto rounded p-0.5 " +
                      (bookmarksMap.has(e.tick)
                        ? "text-amber-400"
                        : "text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink")
                    }
                  >
                    <Star
                      size={12}
                      fill={bookmarksMap.has(e.tick) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                {bookmarksMap.get(e.tick)?.note ? (
                  <div className="mono ml-4 text-[10px] text-ink-muted truncate">
                    {bookmarksMap.get(e.tick)!.note}
                  </div>
                ) : null}
              </li>
```

Preserve everything else in `Timeline.tsx`: the filter panel, `visibleEntries` memo, scrub-snap effect, keyboard handler, empty-state. The only meaningful structural change is each row becoming a `flex flex-col` `group`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: Timeline tests pass (including the 3 new cases). All existing Timeline cases (click-to-scrub, arrow keys, filter, etc.) still pass — the row's outer `onClick` is unchanged, and the star button's `stopPropagation` prevents the toggle from also scrubbing.

`pnpm --filter @a2ui-inspector/ui typecheck` is still RED with the one expected App.tsx error from Task 3.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/panels/Timeline.tsx packages/ui/src/__tests__/Timeline.test.tsx
git commit -m "feat(ui): add bookmark star + inline note on Timeline rows"
```

---

## Task 6: App + ShareDialog wiring

**Files:**
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/components/ShareDialog.tsx`

### Background

`decodeSession`'s return type is now `{ entries, bookmarks }` — App.tsx must destructure it. The ShareDialog must read bookmarks from `useBookmarksStore` and pass them into `encodeSession`. App also mounts the popover at root.

- [ ] **Step 1: Update `packages/ui/src/App.tsx`**

Read `App.tsx`. Make these targeted edits:

1. Add imports next to existing share imports:
```tsx
import { BookmarkNotePopover } from "./components/BookmarkNotePopover.js";
import { useBookmarksStore } from "./store/bookmarks.js";
```

2. Find the existing `#share=` boot effect. Its `decodeSession(fragment).then((decoded) => { useSessionStore.getState().loadEntries(decoded); useShareViewStore.getState().setSharedView(true); })`. Change the `.then` body to:
```tsx
        .then((decoded) => {
          useSessionStore.getState().loadEntries(decoded.entries);
          useBookmarksStore.getState().loadAll(decoded.bookmarks);
          useShareViewStore.getState().setSharedView(true);
        })
```

3. At the very bottom of the returned JSX, AFTER the `<ShareDialog ... />` line and BEFORE the closing `</div>` of the top-level `<div ref={dropRef} ...>`, add:
```tsx
      <BookmarkNotePopover />
```

Do not touch anything else in `App.tsx` — Toolbar wiring, panels, palette, banner, drag-drop, theme effect, hydrate effect, share dialog state, filter wiring.

- [ ] **Step 2: Update `packages/ui/src/components/ShareDialog.tsx`**

Read the current `ShareDialog.tsx` (the bookmarks-aware version pulls `bookmarks` from the new store and passes it to `encodeSession`). Make these targeted edits:

1. Add imports:
```tsx
import { useBookmarksStore } from "../store/bookmarks.js";
```

2. Inside the `ShareDialog()` component body, after the existing `useState` lines, add:
```tsx
  const bookmarksMap = useBookmarksStore((s) => s.bookmarks);
```

3. Find the existing `encodeSession(entries)` call inside the `useEffect`. Change it to:
```tsx
    encodeSession(entries, Array.from(bookmarksMap.values()))
```

4. Add `bookmarksMap` to the effect's dependency array — the existing `[open, entries]` becomes `[open, entries, bookmarksMap]`.

Do not change the dialog UI, the empty/too-large/error states, the copy logic, etc.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean (Task 3's break resolved).
Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass.
Run: `pnpm --filter @a2ui-inspector/ui build` — clean.
Run: `pnpm e2e` — existing 3 specs still pass (happy-path / share / corrupt-link). The bookmark star is in every row but doesn't intercept any happy-path selector.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/App.tsx packages/ui/src/components/ShareDialog.tsx
git commit -m "feat(ui): wire bookmarks into App boot + ShareDialog encode"
```

---

## Task 7: E2E — bookmark survives a share round-trip

**Files:**
- Modify: `tests/e2e/share.spec.ts`

- [ ] **Step 1: Append a new test to `tests/e2e/share.spec.ts`**

```typescript
test("a bookmarked tick + note survives share round-trip", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // Load the fixture session.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });

  // Bookmark tick 0 via its star button.
  await page.getByRole("button", { name: /Bookmark tick 0/ }).click();

  // Shift-click the same star to open the editor.
  await page.getByRole("button", { name: /Bookmark tick 0/ }).click({ modifiers: ["Shift"] });
  const noteField = page.getByLabel(/bookmark note/i);
  await expect(noteField).toBeVisible({ timeout: 5000 });
  await noteField.fill("broke here");
  await page.getByRole("button", { name: /^Save$/ }).click();

  // Note text renders under the bookmarked row.
  await expect(page.getByText("broke here")).toBeVisible();

  // Generate a share link.
  await page.getByRole("button", { name: /Share/ }).click();
  const linkField = page.getByLabel(/share link/i);
  await expect(linkField).toBeVisible({ timeout: 5000 });
  const link = await linkField.inputValue();
  expect(link).toContain("#share=");

  // Open the link in a fresh document (hash-only nav doesn't re-mount).
  await page.goto("about:blank");
  await page.goto(link);

  // Banner + bookmark + note all survived.
  await expect(page.getByText(/Viewing a shared session/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("broke here")).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 2: Run**

Run: `pnpm e2e`
Expected: all 4 specs pass — happy-path + share + corrupt-link + bookmark round-trip.

If a selector is ambiguous (e.g., `/Save/` matches both the Save toolbar button and the bookmark's Save), tighten with anchors (`/^Save$/` already used) or scope inside the popover. Do not weaken the assertion that "broke here" appears after navigation.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/share.spec.ts
git commit -m "test(e2e): bookmark + note survives share round-trip"
```

---

## Acceptance checklist

```bash
pnpm install
pnpm build       # clean
pnpm typecheck   # clean (Task 3's intermediate break resolved in Task 6)
pnpm test        # prior + bookmarks tests (store 8, editor 3, popover 7, codec 4 new, Timeline 3 new), all green
pnpm e2e         # 4 specs all green (happy-path + share + corrupt-link + bookmark round-trip)
```

Manual smoke:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

Connect, let the timeline fill. Hover a row → empty star appears → click it → filled amber star stays. Shift-click → editor opens → type a note → Save → note text appears under the row. Click **Share** → copy link → open in a new tab → the inspector shows the read-only banner AND the bookmarked row with the note.

## Out of scope (per spec non-goals)

Multiple bookmarks per tick, rich-text notes, colors/categories, file Save/Load persistence, a separate Bookmarks panel/tab, keyboard shortcut to toggle on the active tick.
