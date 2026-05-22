# Share-via-URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-server "Share" action that encodes the current session into a URL fragment, and make the UI replay a `#share=` link read-only.

**Architecture:** A pure browser-side codec (gzip via `CompressionStream` + base64url) turns `SessionEntry[]` into a URL fragment and back. A Share dialog generates links with a privacy warning; on boot the UI detects a `#share=` fragment, decodes it, loads the session read-only, and skips the sidecar. A GitHub Pages workflow deploys the static UI so links are publicly openable.

**Tech Stack:** Existing — TypeScript 5, React 18, Zustand 4, Vite 5, Tailwind, Vitest + React Testing Library, Playwright. Browser-native `CompressionStream`/`Blob`/`Response` — no new dependency.

---

## Scope

One coherent feature, ~7 tasks. Implements the approved spec `docs/superpowers/specs/2026-05-22-share-via-url-design.md`.

**Note on the spec:** the spec says "Radix dialog". The codebase has **no Radix dependency** — the existing `CommandPalette` is a hand-rolled `fixed inset-0` modal. This plan uses the same hand-rolled pattern for `ShareDialog`; do **not** add Radix.

## Starting state

- Branch off `main` (v1 + v1.1 merged).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`
- Relevant existing code:
  - `packages/shared` exports `SessionEntry` (type) and `SessionEntrySchema` (Zod).
  - `packages/ui/src/store/session.ts` — `useSessionStore` with `entries: SessionEntry[]`, `applyEvent`, `reset`. (Full current content reproduced in Task 2.)
  - `packages/ui/src/components/Toolbar.tsx` — `<Toolbar>` with theme/Connect/Proxy/Load file/Save buttons. (Full content in Task 4.)
  - `packages/ui/src/App.tsx` — boot effects (`bridge.connect()`, theme, drag-drop), Toolbar wiring, panels, `ActionInjector`, `CommandPalette`. (Full content in Task 5.)
  - `packages/ui/src/components/CommandPalette.tsx` — the hand-rolled modal pattern to mirror.
  - `packages/ui/vite.config.ts` — Vite config (content in Task 6).
  - `packages/ui/src/__tests__/setup.ts` — Vitest setup (`afterEach(cleanup)` + a `localStorage` polyfill).
  - `tests/e2e/happy-path.spec.ts` — the existing Playwright spec; `examples/recordings/restaurant-finder-happy-path.jsonl` is the fixture.

## File summary

```
packages/ui/src/
├── share/
│   ├── codec.ts                       NEW — encodeSession / decodeSession (pure)
│   └── __tests__/codec.test.ts        NEW
├── store/
│   ├── session.ts                     MODIFIED — add loadEntries action
│   └── shareView.ts                   NEW — isSharedView store
├── components/
│   ├── ShareDialog.tsx                NEW — hand-rolled modal
│   └── Toolbar.tsx                    MODIFIED — Share button + bridgeDisabled
├── __tests__/
│   ├── codec is under share/__tests__
│   ├── shareView.test.ts              NEW
│   └── ShareDialog.test.tsx           NEW
├── App.tsx                            MODIFIED — #share= boot, banner, disable bridge actions
└── vite.config.ts                     MODIFIED — base: "./"

.github/workflows/deploy-pages.yml     NEW
tests/e2e/share.spec.ts                NEW
README.md                              MODIFIED — "Sharing a session" section
```

## Pre-flight notes

1. Run `pnpm test` after each task — the existing 124 tests must stay green.
2. `CompressionStream`/`DecompressionStream`/`Blob`/`Response` are Node 18+ globals, available in Vitest's jsdom environment — the codec tests run without a browser.
3. Commit after every task.

---

## Task 1: Session codec

**Files:**
- Create: `packages/ui/src/share/codec.ts`
- Create: `packages/ui/src/share/__tests__/codec.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/share/__tests__/codec.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { encodeSession, decodeSession, ShareDecodeError, MAX_FRAGMENT_BYTES } from "../codec.js";

const entry = (tick: number): SessionEntry => ({
  tick,
  ts: 1000 + tick,
  direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

describe("session codec", () => {
  it("round-trips a session: encode then decode preserves entries", async () => {
    const entries = [entry(0), entry(1), entry(2)];
    const res = await encodeSession(entries);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const decoded = await decodeSession(res.fragment);
    expect(decoded).toEqual(entries);
  });

  it("round-trips an empty session", async () => {
    const res = await encodeSession([]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await decodeSession(res.fragment)).toEqual([]);
  });

  it("returns too-large when the encoded blob exceeds the cap", async () => {
    // Pass a tiny cap so a normal session trips it without a giant input.
    const res = await encodeSession([entry(0)], 1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("too-large");
    expect(res.bytes).toBeGreaterThan(1);
  });

  it("exports a 256 KiB default cap", () => {
    expect(MAX_FRAGMENT_BYTES).toBe(256 * 1024);
  });

  it("throws ShareDecodeError on a non-base64url fragment", async () => {
    await expect(decodeSession("!!!not base64!!!")).rejects.toBeInstanceOf(ShareDecodeError);
  });

  it("throws ShareDecodeError on base64url that is not gzip", async () => {
    // "hello" in base64url — valid base64url, not gzip data.
    await expect(decodeSession("aGVsbG8")).rejects.toBeInstanceOf(ShareDecodeError);
  });

  it("throws ShareDecodeError when a decoded line is not a valid SessionEntry", async () => {
    // Encode a hand-built bad payload through the same gzip+base64url pipeline.
    const { _gzipToFragment } = await import("../codec.js");
    const badFragment = await _gzipToFragment(JSON.stringify({ tick: 0 }) + "\n");
    await expect(decodeSession(badFragment)).rejects.toBeInstanceOf(ShareDecodeError);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../codec.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/share/codec.ts`**

```typescript
import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";

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

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
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

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Test-only helper: gzip+base64url arbitrary text through the real pipeline. */
export async function _gzipToFragment(text: string): Promise<string> {
  return bytesToBase64url(await gzip(text));
}

/** Encode a session into a URL-fragment-safe string. Over `maxBytes` → too-large. */
export async function encodeSession(
  entries: SessionEntry[],
  maxBytes: number = MAX_FRAGMENT_BYTES,
): Promise<EncodeResult> {
  const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
  const fragment = bytesToBase64url(await gzip(jsonl));
  if (fragment.length > maxBytes) {
    return { ok: false, reason: "too-large", bytes: fragment.length };
  }
  return { ok: true, fragment };
}

/** Decode a `#share=` fragment back into validated session entries. */
export async function decodeSession(fragment: string): Promise<SessionEntry[]> {
  const bytes = base64urlToBytes(fragment);
  let jsonl: string;
  try {
    jsonl = await gunzip(bytes);
  } catch {
    throw new ShareDecodeError("fragment is not valid gzip data");
  }
  const entries: SessionEntry[] = [];
  for (const raw of jsonl.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ShareDecodeError("fragment contains a malformed JSON line");
    }
    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new ShareDecodeError("fragment contains a non-conforming session entry");
    }
    entries.push(result.data);
  }
  return entries;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — 7 codec tests green.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/share
git commit -m "feat(ui): add session share codec (gzip + base64url)"
```

---

## Task 2: `loadEntries` action + share-view store

**Files:**
- Modify: `packages/ui/src/store/session.ts`
- Create: `packages/ui/src/store/shareView.ts`
- Create: `packages/ui/src/__tests__/shareView.test.ts`
- Create: `packages/ui/src/__tests__/sessionLoadEntries.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/__tests__/shareView.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useShareViewStore } from "../store/shareView.js";

beforeEach(() => useShareViewStore.setState({ isSharedView: false }));

describe("share-view store", () => {
  it("defaults to not-shared", () => {
    expect(useShareViewStore.getState().isSharedView).toBe(false);
  });

  it("setSharedView toggles the flag", () => {
    useShareViewStore.getState().setSharedView(true);
    expect(useShareViewStore.getState().isSharedView).toBe(true);
    useShareViewStore.getState().setSharedView(false);
    expect(useShareViewStore.getState().isSharedView).toBe(false);
  });
});
```

`packages/ui/src/__tests__/sessionLoadEntries.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { useSessionStore } from "../store/session.js";

const entry = (tick: number): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

beforeEach(() => useSessionStore.getState().reset());

describe("session store loadEntries", () => {
  it("replaces entries with the given array", () => {
    useSessionStore.getState().loadEntries([entry(0), entry(1)]);
    expect(useSessionStore.getState().entries).toHaveLength(2);
    expect(useSessionStore.getState().entries[0]?.tick).toBe(0);
  });

  it("replaces any pre-existing entries", () => {
    useSessionStore.getState().loadEntries([entry(0), entry(1), entry(2)]);
    useSessionStore.getState().loadEntries([entry(0)]);
    expect(useSessionStore.getState().entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/shareView.js` not found; `loadEntries` not a function.

- [ ] **Step 3: Add `loadEntries` to `packages/ui/src/store/session.ts`**

The current file is:

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

Add a `loadEntries` method. In the `SessionState` interface, add after `applyEvent`:

```typescript
  loadEntries: (entries: SessionEntry[]) => void;
```

In the store object, add after `applyEvent`'s closing `,` (before `reset`):

```typescript
  loadEntries: (entries) => set({ entries }),
```

- [ ] **Step 4: Implement `packages/ui/src/store/shareView.ts`**

```typescript
import { create } from "zustand";

interface ShareViewState {
  isSharedView: boolean;
  setSharedView: (v: boolean) => void;
}

export const useShareViewStore = create<ShareViewState>((set) => ({
  isSharedView: false,
  setSharedView: (isSharedView) => set({ isSharedView }),
}));
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — 4 new tests green.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/store packages/ui/src/__tests__/shareView.test.ts packages/ui/src/__tests__/sessionLoadEntries.test.ts
git commit -m "feat(ui): add session loadEntries action + share-view store"
```

---

## Task 3: ShareDialog component

**Files:**
- Create: `packages/ui/src/components/ShareDialog.tsx`
- Create: `packages/ui/src/__tests__/ShareDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/ShareDialog.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { ShareDialog } from "../components/ShareDialog.js";

const entry = (tick: number): SessionEntry => ({
  tick, ts: tick, direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("ShareDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ShareDialog open={false} onClose={() => {}} entries={[entry(0)]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty-state message for an empty session", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[]} />);
    expect(await screen.findByText(/nothing to share/i)).toBeTruthy();
  });

  it("shows the privacy warning and a link for a valid session", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[entry(0), entry(1)]} />);
    expect(await screen.findByText(/anyone with the link can read it/i)).toBeTruthy();
    const link = screen.getByLabelText(/share link/i) as HTMLInputElement;
    expect(link.value).toMatch(/#share=/);
  });

  it("copies the link to the clipboard on Copy", async () => {
    render(<ShareDialog open onClose={() => {}} entries={[entry(0)]} />);
    const copyBtn = await screen.findByRole("button", { name: /copy link/i });
    fireEvent.click(copyBtn);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<ShareDialog open onClose={onClose} entries={[entry(0)]} />);
    fireEvent.click(await screen.findByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../components/ShareDialog.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/components/ShareDialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { encodeSession, MAX_FRAGMENT_BYTES } from "../share/codec.js";

const SHARE_BASE_URL =
  (import.meta.env.VITE_SHARE_BASE_URL as string | undefined) ??
  location.origin + location.pathname;

type DialogState =
  | { kind: "encoding" }
  | { kind: "empty" }
  | { kind: "too-large"; bytes: number }
  | { kind: "ready"; link: string }
  | { kind: "error"; message: string };

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  entries: SessionEntry[];
}

export function ShareDialog({ open, onClose, entries }: ShareDialogProps) {
  const [state, setState] = useState<DialogState>({ kind: "encoding" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    if (entries.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "encoding" });
    let cancelled = false;
    encodeSession(entries)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ kind: "ready", link: `${SHARE_BASE_URL}#share=${res.fragment}` });
        else setState({ kind: "too-large", bytes: res.bytes });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String((err as Error).message) });
      });
    return () => { cancelled = true; };
  }, [open, entries]);

  if (!open) return null;

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setState({ kind: "error", message: "Copy failed — select the link manually." });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={onClose}
    >
      <div
        className="w-[34rem] max-w-[90vw] rounded border border-edge-strong bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 font-semibold text-ink">Share session</div>

        {state.kind === "encoding" && <p className="text-sm text-ink-muted">Encoding…</p>}

        {state.kind === "empty" && (
          <p className="text-sm text-ink-muted">Nothing to share — load or record a session first.</p>
        )}

        {state.kind === "too-large" && (
          <p className="text-sm text-ink-muted">
            This session is too large to share as a link ({Math.ceil(state.bytes / 1024)} KB &gt;{" "}
            {MAX_FRAGMENT_BYTES / 1024} KB limit). Use <span className="text-ink">Save</span> to export
            the .jsonl file and share that instead.
          </p>
        )}

        {state.kind === "error" && <p className="text-sm text-red-300">{state.message}</p>}

        {state.kind === "ready" && (
          <>
            <p className="mb-2 text-sm text-amber-300">
              This link contains the full session data, including anything sensitive in it. Anyone with
              the link can read it.
            </p>
            <input
              readOnly
              aria-label="Share link"
              value={state.link}
              className="mono w-full rounded border border-edge bg-app px-2 py-1 text-xs text-ink"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => copy(state.link)}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </>
        )}

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded border border-edge px-2 py-1 text-xs hover:bg-raised"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: PASS — 5 ShareDialog tests green.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ShareDialog.tsx packages/ui/src/__tests__/ShareDialog.test.tsx
git commit -m "feat(ui): add ShareDialog (encode + privacy warning + copy link)"
```

---

## Task 4: Toolbar — Share button + bridge-disabled state

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx`

The current `Toolbar.tsx`:

```tsx
import { FilePlus, Link2, Moon, Save, Split, Sun } from "lucide-react";
import { useThemeStore } from "../store/theme.js";

export interface ToolbarProps {
  onConnect: () => void;
  onProxy: () => void;
  onLoadFile: () => void;
  onSave: () => void;
  upstreamStatus: string;
}

export function Toolbar({ onConnect, onProxy, onLoadFile, onSave, upstreamStatus }: ToolbarProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  return (
    <header className="flex items-center justify-between border-b border-edge px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">A2UI Inspector</span>
        <span className="mono text-xs text-ink-muted">• {upstreamStatus}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={onConnect} className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface">
          <Link2 size={14} /> Connect
        </button>
        <button onClick={onProxy} className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface">
          <Split size={14} /> Proxy
        </button>
        <button onClick={onLoadFile} className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface">
          <FilePlus size={14} /> Load file
        </button>
        <button onClick={onSave} className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface">
          <Save size={14} /> Save
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 1: Replace `packages/ui/src/components/Toolbar.tsx` with**

```tsx
import { FilePlus, Link2, Moon, Save, Share2, Split, Sun } from "lucide-react";
import { useThemeStore } from "../store/theme.js";

export interface ToolbarProps {
  onConnect: () => void;
  onProxy: () => void;
  onLoadFile: () => void;
  onSave: () => void;
  onShare: () => void;
  /** When true, sidecar-dependent actions (Connect/Proxy/Load file/Save) are disabled. */
  bridgeDisabled?: boolean;
  upstreamStatus: string;
}

export function Toolbar({
  onConnect,
  onProxy,
  onLoadFile,
  onSave,
  onShare,
  bridgeDisabled = false,
  upstreamStatus,
}: ToolbarProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const btn = "flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <header className="flex items-center justify-between border-b border-edge px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">A2UI Inspector</span>
        <span className="mono text-xs text-ink-muted">• {upstreamStatus}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={toggleTheme} aria-label="Toggle theme" className={btn}>
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={onConnect} disabled={bridgeDisabled} className={btn}>
          <Link2 size={14} /> Connect
        </button>
        <button onClick={onProxy} disabled={bridgeDisabled} className={btn}>
          <Split size={14} /> Proxy
        </button>
        <button onClick={onLoadFile} disabled={bridgeDisabled} className={btn}>
          <FilePlus size={14} /> Load file
        </button>
        <button onClick={onSave} disabled={bridgeDisabled} className={btn}>
          <Save size={14} /> Save
        </button>
        <button onClick={onShare} className={btn}>
          <Share2 size={14} /> Share
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @a2ui-inspector/ui typecheck`
Expected: FAIL — `App.tsx` still renders `<Toolbar>` without the now-required `onShare` prop. That is expected; Task 5 fixes it. Do not "fix" it here.

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: the existing UI tests still pass (no test references `Toolbar` directly); only the App-level typecheck is broken, which Task 5 resolves.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Toolbar.tsx
git commit -m "feat(ui): add Toolbar Share button + bridgeDisabled state"
```

---

## Task 5: App — wire ShareDialog, `#share=` boot detection, read-only banner

**Files:**
- Modify: `packages/ui/src/App.tsx`

The current `App.tsx` is reproduced in the plan context above. Replace it entirely with the version below. Changes from the current file: imports for `useState`, `ShareDialog`, `decodeSession`/`ShareDecodeError`, `useShareViewStore`; a `shareOpen` state; a share-aware boot effect replacing the plain `bridge.connect()` effect; a read-only banner; `bridgeDisabled` + `onShare` passed to `Toolbar`; `ActionInjector` rendered only when not in shared view; `<ShareDialog>` rendered.

- [ ] **Step 1: Replace `packages/ui/src/App.tsx` with**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { MainPaneTabs } from "./components/MainPaneTabs.js";
import { ActionInjector } from "./components/ActionInjector.js";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette.js";
import { ShareDialog } from "./components/ShareDialog.js";
import { Timeline } from "./panels/Timeline.js";
import { Preview } from "./panels/Preview.js";
import { ComponentTree } from "./panels/ComponentTree.js";
import { Diff } from "./panels/Diff.js";
import { DataModel } from "./panels/DataModel.js";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts.js";
import { useSessionStore } from "./store/session.js";
import { useMainPaneStore } from "./store/mainPane.js";
import { useCommandPaletteStore } from "./store/commandPalette.js";
import { useThemeStore } from "./store/theme.js";
import { useShareViewStore } from "./store/shareView.js";
import { decodeSession, ShareDecodeError } from "./share/codec.js";
import { bridge } from "./transport/bridgeClient.js";

const SHARE_PREFIX = "#share=";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);
  const entries = useSessionStore((s) => s.entries);
  const mainTab = useMainPaneStore((s) => s.tab);
  const setTab = useMainPaneStore((s) => s.setTab);
  const togglePalette = useCommandPaletteStore((s) => s.toggle);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isSharedView = useShareViewStore((s) => s.isSharedView);
  const dropRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Boot: if the URL carries a #share= fragment, replay it read-only and skip
  // the sidecar. Otherwise connect to the bridge as usual.
  useEffect(() => {
    const hash = location.hash;
    if (hash.startsWith(SHARE_PREFIX)) {
      const fragment = hash.slice(SHARE_PREFIX.length);
      decodeSession(fragment)
        .then((decoded) => {
          useSessionStore.getState().loadEntries(decoded);
          useShareViewStore.getState().setSharedView(true);
        })
        .catch((err) => {
          const message =
            err instanceof ShareDecodeError
              ? "This share link is corrupt or invalid."
              : `Failed to open share link: ${String((err as Error).message)}`;
          useSessionStore.getState().applyEvent({ kind: "diagnostic", level: "error", message });
          void bridge.connect();
        });
    } else {
      void bridge.connect();
    }
  }, []);

  useEffect(() => {
    useThemeStore.getState().applyTheme();
  }, []);

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

  const handleConnect = useCallback(() => {
    const url = window.prompt("Upstream URL — ws:// or wss:// for WebSocket, http:// or https:// for SSE:");
    if (!url) return;
    const transport = /^wss?:\/\//i.test(url) ? "websocket" : "sse";
    bridge.send({ kind: "connectUpstream", config: { transport, url } });
  }, []);

  const handleLoadFile = useCallback(() => {
    const path = window.prompt("Path to .a2ui-session.jsonl on the host:");
    if (path) bridge.send({ kind: "loadFile", path });
  }, []);

  const handleSave = useCallback(() => {
    const path = window.prompt("Save session to:");
    if (path) bridge.send({ kind: "saveSession", path });
  }, []);

  const shortcutHandlers = useMemo(
    () => ({
      onSave: handleSave,
      onOpenFile: handleLoadFile,
      onTogglePalette: togglePalette,
      onTab: setTab,
    }),
    [handleSave, handleLoadFile, togglePalette, setTab]
  );
  useGlobalShortcuts(shortcutHandlers);

  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      { id: "connect", label: "Connect to upstream", run: handleConnect },
      { id: "load", label: "Load session file", run: handleLoadFile },
      { id: "save", label: "Save session", run: handleSave },
      { id: "share", label: "Share session as a link", run: () => setShareOpen(true) },
      { id: "clear", label: "Clear session", run: () => bridge.send({ kind: "clear" }) },
      { id: "tab-preview", label: "Show Preview tab", run: () => setTab("preview") },
      { id: "tab-tree", label: "Show Tree tab", run: () => setTab("tree") },
      { id: "tab-diff", label: "Show Diff tab", run: () => setTab("diff") },
      { id: "theme", label: "Toggle light/dark theme", run: toggleTheme },
    ],
    [handleConnect, handleLoadFile, handleSave, setTab, toggleTheme]
  );

  return (
    <div ref={dropRef} className="flex h-screen flex-col">
      <Toolbar
        onConnect={handleConnect}
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
        onLoadFile={handleLoadFile}
        onSave={handleSave}
        onShare={() => setShareOpen(true)}
        bridgeDisabled={isSharedView}
        upstreamStatus={upstreamDetail ? `${upstreamStatus} (${upstreamDetail})` : upstreamStatus}
      />
      {isSharedView && !bannerDismissed && (
        <div className="flex items-center justify-between border-b border-edge bg-surface px-3 py-1 text-xs text-ink-muted">
          <span>Viewing a shared session (read-only).</span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="rounded border border-edge px-2 py-0.5 hover:bg-raised"
          >
            Dismiss
          </button>
        </div>
      )}
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 overflow-y-auto border-r border-edge"><Timeline /></aside>
        <section className="flex flex-1 flex-col overflow-hidden">
          <MainPaneTabs />
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto">
              {mainTab === "preview" && <Preview />}
              {mainTab === "tree" && <ComponentTree />}
              {mainTab === "diff" && <Diff />}
            </div>
            <aside className="w-80 overflow-auto border-l border-edge"><DataModel /></aside>
          </div>
          {!isSharedView && (
            <ActionInjector onInject={(action) => bridge.send({ kind: "injectAction", action })} />
          )}
        </section>
      </main>
      <CommandPalette commands={paletteCommands} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} entries={entries} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean (the Task 4 break is now resolved).
Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass.
Run: `pnpm --filter @a2ui-inspector/ui build` — clean.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "feat(ui): wire ShareDialog + #share= boot replay + read-only banner"
```

---

## Task 6: Vite base path + GitHub Pages deploy + README

**Files:**
- Modify: `packages/ui/vite.config.ts`
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `README.md`

- [ ] **Step 1: Set a relative base in `packages/ui/vite.config.ts`**

The current file:

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
  test: { environment: "jsdom", globals: false, setupFiles: ["./src/__tests__/setup.ts"] },
});
```

Replace it with (adds `base: "./"` so the build works both at `/` on the sidecar and at `/a2ui-inspector/` on GitHub Pages):

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
  test: { environment: "jsdom", globals: false, setupFiles: ["./src/__tests__/setup.ts"] },
});
```

- [ ] **Step 2: Verify the existing e2e still passes with the relative base**

Run: `pnpm build && pnpm e2e`
Expected: clean build, e2e PASS. The e2e serves the UI through the sidecar at `/`; `base: "./"` must not break that. If the e2e fails on missing assets, stop and report — `base: "./"` is wrong for this layout (it should not be; relative base is correct for both contexts).

- [ ] **Step 3: Create `.github/workflows/deploy-pages.yml`**

```yaml
name: Deploy Pages
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
        env:
          VITE_SHARE_BASE_URL: https://zhijiewong.github.io/a2ui-inspector/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/ui/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Add a "Sharing a session" section to `README.md`**

Read `README.md`. After the existing `## Validating session files` section and before `## Status`, insert:

```markdown
## Sharing a session

The **Share** button encodes the current session into a link — no server, no
upload. The whole session is gzip-compressed into the URL fragment, so the data
never leaves the link itself.

Opening a share link replays the session read-only in the inspector (no sidecar
needed). Links are generated against the public build at
`https://zhijiewong.github.io/a2ui-inspector/`.

A share link contains the **full session data, including anything sensitive in
it** — treat it like the recording itself. Sessions larger than 256 KB encoded
cannot be shared as a link; use **Save** to export the `.jsonl` file instead.

> One-time repo setup for maintainers: enable Pages under
> Settings → Pages → Source: **GitHub Actions**. The `Deploy Pages` workflow
> publishes the UI on every push to `main`.
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/vite.config.ts .github/workflows/deploy-pages.yml README.md
git commit -m "feat: GitHub Pages deploy for share links; relative Vite base"
```

---

## Task 7: End-to-end share test

**Files:**
- Create: `tests/e2e/share.spec.ts`

- [ ] **Step 1: Write the e2e spec**

`tests/e2e/share.spec.ts`:

```typescript
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("share a loaded session and reopen it from the link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // Load the fixture session.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });

  // Open the Share dialog and read the generated link.
  await page.getByRole("button", { name: /Share/ }).click();
  const linkField = page.getByLabelText(/share link/i);
  await expect(linkField).toBeVisible({ timeout: 5000 });
  const link = await linkField.inputValue();
  expect(link).toContain("#share=");

  // Open the share link in a fresh navigation.
  await page.goto(link);
  await expect(page.getByText(/Viewing a shared session/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Hello world")).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 2: Run the e2e**

Run: `pnpm e2e`
Expected: both specs pass — `happy-path.spec.ts` and the new `share.spec.ts`.

The share link's base is `location.origin + location.pathname` (no `VITE_SHARE_BASE_URL` in the e2e build), i.e. `http://127.0.0.1:8765/` — the same server Playwright is already pointed at, so `page.goto(link)` re-loads the inspector with the `#share=` fragment. The boot effect decodes it, loads the session read-only, and shows the banner.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/share.spec.ts
git commit -m "test(e2e): add share-link round-trip spec"
```

---

## Acceptance checklist

```bash
pnpm install
pnpm build       # clean — base: "./" works for the sidecar-served build
pnpm typecheck   # clean
pnpm test        # 124 prior + share-via-URL new tests (codec 7, shareView 2, loadEntries 2, ShareDialog 5), all green
pnpm e2e         # happy-path + share round-trip, both green
```

Manual smoke:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

Connect to `ws://127.0.0.1:8000`, let the timeline fill, click **Share** → the dialog shows the privacy warning + a `#share=` link. Copy it, open it in a new tab → the session replays with the "Viewing a shared session (read-only)" banner and Connect/Proxy/Load/Save disabled.

## Out of scope (per the spec's non-goals)

Server-side storage, short links, link expiry, view analytics, secret redaction, live-session sharing, partial/truncated sharing.
