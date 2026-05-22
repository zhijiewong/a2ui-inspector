# A2UI Inspector — Share-via-URL Design

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-22
**Depends on:** A2UI Inspector v1 + v1.1 (merged to `main`)

## Context

A2UI Inspector records A2UI v0.9 agent sessions and replays them (timeline, preview, tree, diff, data model). v1 ships JSONL file export/import. This feature adds **Share-via-URL**: a one-click "Share" action that turns the current session into a clickable link; opening the link replays that session read-only.

It was deferred out of v1.1 because the obvious implementation — a hosted backend — carries real infra cost, a maintenance burden, and a privacy surface unsuitable for an OSS devtool with no business model. Brainstorming settled on a **zero-server** design instead.

### Decisions locked in brainstorming

- **No server.** The whole session is encoded into the URL fragment. Data never reaches any server — fragments are not even sent in HTTP requests.
- **Link target:** a public **GitHub Pages** static deploy of the inspector UI (free static-file hosting, no backend, no runtime to maintain). Links are `https://zhijiewong.github.io/a2ui-inspector/#share=<blob>`.
- **Privacy:** the Share action shows an explicit confirmation/warning — a share link embeds the entire session, including anything sensitive. No false-confidence redaction.
- **Size:** encoded blobs are capped at **256 KB**; over-cap sessions fall back to the existing JSONL file export.

## Goals

1. One-click share of a recorded session as a clickable link, with no server.
2. Opening a share link replays the session read-only, with no sidecar required.
3. Honest privacy UX — the user is told exactly what the link exposes.
4. Predictable failure for over-large sessions (clear fallback, not a broken link).
5. Free, maintenance-light hosting (static deploy only).

## Non-goals

- Server-side storage, short links, link expiry, view analytics.
- Redaction of secrets/PII (rejected in brainstorming — best-effort redaction gives false confidence).
- Sharing a *live* session — only completed/recorded sessions.
- Truncated/partial-session sharing.

## Architecture

Zero server. The entire pipeline runs in the browser.

```
Generate:  session entries  →  JSONL text  →  gzip (CompressionStream)
           →  base64url  →  https://<pages>/#share=<blob>

Open:      location.hash  →  base64url decode  →  gunzip (DecompressionStream)
           →  JSONL text  →  parse + validate SessionEntry lines  →  load read-only
```

The feature is a small, isolated set of units: one pure codec module, a dialog, a tiny store, thin `App`/`Toolbar` wiring, and a deploy workflow.

### Codec — `packages/ui/src/share/codec.ts`

The only module that knows the wire format. Pure: deals only in `SessionEntry[]`; no stores, no bridge, no DOM.

```ts
export const MAX_FRAGMENT_BYTES = 256 * 1024;

export class ShareDecodeError extends Error {}

export type EncodeResult =
  | { ok: true; fragment: string }
  | { ok: false; reason: "too-large"; bytes: number };

export function encodeSession(entries: SessionEntry[]): Promise<EncodeResult>;
export function decodeSession(fragment: string): Promise<SessionEntry[]>;
```

- Encoding: `entries` → JSONL (`entries.map(JSON.stringify).join("\n")`) → `CompressionStream("gzip")` → base64url. The cap is checked on the encoded blob; over `MAX_FRAGMENT_BYTES` → `{ ok: false, reason: "too-large", bytes }`.
- Decoding: base64url → `DecompressionStream("gzip")` → JSONL → split → `JSON.parse` each line → validate via `SessionEntrySchema` (from `@a2ui-inspector/shared`). Any failure (bad base64, bad gzip, malformed JSON, schema-invalid line) throws `ShareDecodeError`. The whole fragment is rejected — no partial render.
- Uses browser-native `CompressionStream`/`DecompressionStream` (`"gzip"`) — no new dependency. If unsupported, `encodeSession` throws (handled by the dialog).

### Share view store — `packages/ui/src/store/shareView.ts`

```ts
interface ShareViewState {
  isSharedView: boolean;
  setSharedView: (v: boolean) => void;
}
```

Set `true` when the UI booted from a `#share=` link.

### ShareDialog — `packages/ui/src/components/ShareDialog.tsx`

A Radix dialog (matching existing UI primitives). On open, calls `encodeSession(entries)` and renders one of:

- **Empty session** → "Nothing to share — load or record a session first."
- **`too-large`** → "This session is too large to share as a link (X KB > 256 KB limit). Use **Save** to export the `.jsonl` file and share that instead."
- **`ok`** → the privacy warning verbatim — *"This link contains the full session data, including anything sensitive in it. Anyone with the link can read it."* — plus the link in a read-only selectable field and a **Copy link** button (`navigator.clipboard.writeText`; confirms "Copied").

The link is `${SHARE_BASE_URL}#share=<blob>`. `SHARE_BASE_URL` = `import.meta.env.VITE_SHARE_BASE_URL` if set, else `location.origin + location.pathname` (so a self-hosted UI still produces working links). The Pages deploy sets `VITE_SHARE_BASE_URL` to the Pages URL.

### Generate flow

Toolbar gets a **Share** button (`Share2` lucide icon, next to Save) that opens `ShareDialog`.

### Open flow

On UI startup, in `App`, **before** the normal bridge connect:

1. Check `location.hash` for `#share=`.
2. **Present:** `decodeSession` the fragment.
   - Success → replace the session store contents with the decoded entries, `setSharedView(true)`, and **skip `bridge.connect()`** (a shared link is a static recording — no sidecar).
   - `ShareDecodeError` → show an inline "This share link is corrupt or invalid" message; fall through to normal startup.
3. **Absent:** normal startup (bridge connect) — unchanged.

When `isSharedView` is set:
- A dismissable banner under the Toolbar: *"Viewing a shared session (read-only)."*
- Bridge-dependent actions are disabled — Toolbar **Connect**, **Proxy**, and the **ActionInjector** (they cannot function without a sidecar).
- Everything else works normally: Timeline, Preview, Component Tree, Diff, Data Model, command palette, scrubbing, renderer selector, theme, device-frame — all pure replay over the session store.

## Hosting — GitHub Pages

For share links to be openable by anyone, the UI must be reachable at a stable public URL. A static GitHub Pages deploy provides this — free, no backend.

### Vite base path

GitHub Pages serves a project site under `/a2ui-inspector/`; the sidecar serves the same build at `/`. Set **`base: "./"`** in `packages/ui/vite.config.ts` so relative asset URLs work in both contexts — one build, both places. URL fragments are unaffected by base path.

### Deploy workflow — `.github/workflows/deploy-pages.yml`

- Trigger: push to `main`.
- `permissions: { pages: write, id-token: write }`.
- Steps: checkout → pnpm setup → `pnpm install --frozen-lockfile` → `pnpm build` (with `VITE_SHARE_BASE_URL` set to the Pages URL) → `actions/upload-pages-artifact` on `packages/ui/dist` → `actions/deploy-pages`.
- Independent of `ci.yml` (which remains the test/lint gate). Deploy runs only after a merge to `main`.

### One-time manual setup

Enabling Pages (repo Settings → Pages → Source: GitHub Actions) is a one-time manual click — a workflow cannot self-enable Pages. The spec and README note this.

## Error handling

| Situation | Behavior |
|---|---|
| Share clicked, session empty | Dialog: "Nothing to share — load or record a session first." |
| Encoded blob > 256 KB | Dialog: "too large to share as a link" + points to **Save** (file export) |
| `navigator.clipboard` unavailable / denied | Link still shown in a selectable field; "Copy" surfaces "Copy failed — select the link manually" |
| Share link with corrupt/truncated `#share=` | `ShareDecodeError`; inline "This share link is corrupt or invalid"; fall through to normal startup |
| Decoded line fails `SessionEntrySchema` | Treated as corrupt — whole fragment rejected, no partial render |
| `CompressionStream` unsupported | `encodeSession` throws; dialog: "Your browser doesn't support session sharing" |

No silent failures — every path either succeeds or shows a specific message.

## Testing

**Unit — `packages/ui/src/share/__tests__/codec.test.ts`** (Vitest, jsdom):
- `encodeSession` → `decodeSession` round-trip preserves entries exactly
- Over-cap session → `{ ok: false, reason: "too-large" }`
- Corrupt fragment (bad base64, bad gzip, schema-invalid line) → `decodeSession` throws `ShareDecodeError`
- Empty session → encodes and decodes to `[]`

**Component — `packages/ui/src/__tests__/ShareDialog.test.tsx`** (RTL):
- Empty session → empty-state message
- Valid session → privacy warning text + link field + Copy button
- Too-large session → fallback message
- Copy click → `navigator.clipboard.writeText` called (mocked)

**Store — `packages/ui/src/__tests__/shareView.test.ts`:** `isSharedView` toggling.

**E2E — `tests/e2e/share.spec.ts`:** load the fixture, click Share, read the generated link from the dialog, `page.goto` that link, assert the timeline + preview repopulate and the read-only banner shows — exercises the full encode → URL → decode loop in a real browser.

## File summary

```
packages/ui/src/
├── share/
│   ├── codec.ts                     NEW — encode/decode (pure)
│   └── __tests__/codec.test.ts      NEW
├── store/shareView.ts               NEW — isSharedView
├── components/
│   ├── ShareDialog.tsx              NEW
│   └── Toolbar.tsx                  MODIFIED — Share button
├── __tests__/
│   ├── ShareDialog.test.tsx         NEW
│   └── shareView.test.ts            NEW
├── App.tsx                          MODIFIED — #share= boot detection, banner, disable-in-shared-view
└── vite.config.ts                   MODIFIED — base: "./"

.github/workflows/deploy-pages.yml   NEW
tests/e2e/share.spec.ts              NEW
README.md                            MODIFIED — "Sharing a session" section
```

## Risks

1. **Fragment size in practice.** 256 KB of base64 in a URL is fine for browsers but can be awkward in some chat tools. The cap is conservative; the file-export fallback covers the rest.
2. **GitHub Pages must be manually enabled once.** Documented; the first deploy workflow run fails informatively if it is not.
3. **`base: "./"` regression risk.** The sidecar already serves the UI at `/`; relative base must be verified to still work there (covered by the existing e2e, which runs against the sidecar).
