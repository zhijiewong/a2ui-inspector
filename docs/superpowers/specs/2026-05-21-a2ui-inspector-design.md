# A2UI Inspector — Cross-Renderer DevTool for A2UI Agents

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-21
**Spec version targeted:** A2UI v0.9
**Distribution:** npm package, `npx a2ui-inspector`
**License (planned):** MIT

## Context

The [A2UI protocol](https://a2ui.org/) (Google, v0.9 public preview) defines how AI agents stream declarative JSON describing UIs. The ecosystem has matured rapidly: 15+ community renderers across web/mobile/native, official Google products using it in production (Opal, Gemini Enterprise), and a Q2-2026 official SwiftUI renderer planned.

What's missing is a **debugger**. When an agent emits a broken message stream, developers fall back to `console.log`. There is no equivalent of Redux DevTools, React DevTools, or Chrome DevTools' Network tab for A2UI message streams — yet every renderer's users would benefit from one.

This spec covers `a2ui-inspector`, a cross-renderer browser-based debugger that ingests A2UI message streams (live or recorded), visualizes them as a scrubbable timeline + component tree + data model, and lets developers inject synthetic action events back to live agents for testing.

### Why this, why now

- **No competition.** No equivalent tool exists. CopilotKit Composer is for *composing* sample UIs, not debugging running agents.
- **Cross-cutting value.** Useful regardless of which renderer or agent framework a user picks. The growing ecosystem (Google's official SwiftUI renderer ships this quarter) only makes the tool more valuable over time.
- **Defensible niche.** A devtool is hard to displace once it becomes default. First-mover advantage is real.
- **Aligned with original intent.** The user originally wanted iOS rental-app work in Chinese; that path collided with Google's imminent official SwiftUI renderer. Inspector is upstream of any A2UI app the user (or anyone) builds.

### What this is not

- Not a renderer — it embeds `@a2ui/react` for preview; does not implement its own component mapping.
- Not an authoring/composer tool — read-only timeline, not a UI builder (CopilotKit Composer occupies that niche).
- Not a hosted service in v1 — runs entirely locally via `npx a2ui-inspector`.
- Not multi-agent — single session at a time in v1.

## Goals

1. **Time-travel debugging** of A2UI streams: scrub any tick, see exactly the state that existed.
2. **Cross-renderer applicability**: works for any agent emitting valid A2UI v0.9, regardless of the user's target renderer.
3. **Multiple ingestion modes**: live WebSocket, live SSE, HTTP proxy, JSONL file replay.
4. **Bidirectional**: inject synthetic action events back to live agents.
5. **Zero-install UX**: `npx a2ui-inspector` boots the tool; no global install required.
6. **Open source, MIT.**

## Non-goals (v1)

- Hosted backend / cloud session sharing (URL-share deferred to v1.5; v1 ships file-based export/import only)
- Auth on the local bridge (localhost-only in v1)
- Recording multiple agents/sessions in parallel (single session at a time)
- Editing messages in the timeline (read-only; only action injection writes back)
- Renderer-pluggability (`@a2ui/react` only in v1)
- Inspector chrome i18n (English-only chrome; the agent-rendered preview is locale-driven by the agent itself)
- Native mobile / desktop builds (web-only via local sidecar)
- Standalone spec validator / linter CLI (possible follow-on project)

## Architecture

The Inspector is a Node sidecar serving a React UI over a local bridge. The sidecar owns all network and filesystem I/O; the UI is a thin client over a local WebSocket bridge.

### Why the sidecar

Three of the four required ingestion modes (HTTP proxy, raw file IO, unrestricted upstream connections) need server capability. A pure-browser tool would be smaller but couldn't deliver proxy mode and would suffer CORS pain when connecting to arbitrary agents. The sidecar bypasses both.

The sidecar also gives clean architectural seams: future growth (multi-session recording, secrets management, headless CI replay) lands behind the bridge protocol without touching the UI.

### High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│  npx a2ui-inspector                                         │
│  (Node sidecar — Fastify, ~5-10 dependencies)               │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ WS adapter  │    │ SSE adapter │    │ File adapter│     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         └──────────┬───────┴──────────────────┘             │
│                    ▼                                        │
│             SessionStore (canonical log + index)            │
│                    │                                        │
│                    ▼                                        │
│             WS to browser ─────────────────────────┐        │
└────────────────────────────────────────────────────┼────────┘
                                                     │
                                                     ▼
┌────────────────────────────────────────────────────┴────────┐
│  React UI (Vite, served by sidecar)                         │
│  ┌─────────────┬──────────────────┬────────────────────┐    │
│  │ Timeline    │ Component Tree   │ Data Model         │    │
│  │ (left rail) │ + Preview        │ (right rail)       │    │
│  │             │ (@a2ui/react)    │                    │    │
│  └─────────────┴──────────────────┴────────────────────┘    │
│  Zustand store mirrors sidecar; scrubs replay locally       │
└─────────────────────────────────────────────────────────────┘
```

### Repository layout (pnpm monorepo)

```
a2ui-inspector/
├── packages/
│   ├── sidecar/              # Node server (Fastify, TypeScript)
│   │   └── src/
│   │       ├── server.ts             # Fastify entry; hosts UI + bridge WS
│   │       ├── adapters/             # ingestion sources
│   │       │   ├── websocket.ts      # upstream WS client
│   │       │   ├── sse.ts            # upstream SSE client
│   │       │   ├── file.ts           # JSONL read/write
│   │       │   └── proxy.ts          # HTTP MITM proxy
│   │       ├── session/
│   │       │   ├── store.ts          # canonical message log + index
│   │       │   └── persistence.ts    # .a2ui-session file IO
│   │       ├── bridge.ts             # browser WS endpoint
│   │       └── bin.ts                # `npx a2ui-inspector` entry
│   ├── ui/                   # React app (Vite, TypeScript)
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── store/                # Zustand stores
│   │       │   ├── session.ts
│   │       │   └── timeline.ts
│   │       ├── panels/
│   │       │   ├── Timeline.tsx
│   │       │   ├── ComponentTree.tsx
│   │       │   ├── DataModel.tsx
│   │       │   ├── Preview.tsx       # embeds @a2ui/react
│   │       │   └── ActionInjector.tsx
│   │       ├── transport/
│   │       └── replay/               # uses @a2ui/web_core MessageProcessor
│   └── shared/               # Cross-package types (Zod-validated)
│       └── src/
│           ├── messages.ts           # bridge protocol types
│           └── session.ts            # .a2ui-session schema
├── examples/
│   ├── mock-agent/                   # Node script emitting demo A2UI
│   └── recordings/                   # sample .a2ui-session.jsonl files
├── docs/
├── pnpm-workspace.yaml
└── package.json
```

### Module boundaries

- **`sidecar`** is the only module that touches the network or filesystem. All upstream protocols (WS / SSE / proxy) live here. Single security review surface.
- **`ui`** is dumb relative to the sidecar — it receives a mirrored log + scrub commands over the bridge. It can be hosted standalone (e.g. on a static site) for demo purposes; on boot it attempts to connect to the bridge on the configured port and, on failure, enters a "static demo" mode that supports file replay (via browser File API) only and disables live/proxy modes with a visible banner.
- **`shared`** carries Zod schemas for the bridge protocol and the session file format. Zero runtime dependencies. Compiled by both other packages so contract violations fail loudly at the type-check and runtime layers.

### Bridge protocol (sidecar ↔ UI)

A local WebSocket between the UI and the sidecar, with a small typed message protocol. Every payload is validated by Zod schemas in `shared` on both sides.

```ts
// UI → sidecar
type Command =
  | { kind: 'connectUpstream', config: UpstreamConfig }
  | { kind: 'startProxy', port: number, target: string }
  | { kind: 'loadFile', path: string }
  | { kind: 'saveSession', path: string }
  | { kind: 'injectAction', action: A2UIAction }
  | { kind: 'scrubTo', tick: number }   // UI-state only; not propagated
  | { kind: 'clear' }

// Sidecar → UI
type Event =
  | { kind: 'messageReceived', tick: number, ts: number, message: A2UIMessage }
  | { kind: 'actionSent', tick: number, ts: number, action: A2UIAction }
  | { kind: 'upstreamStatus', status: 'connecting' | 'connected' | 'closed' | 'error', detail?: string }
  | { kind: 'sessionLoaded', tickCount: number }
  | { kind: 'diagnostic', level: 'warn' | 'error', message: string }
```

Scrub is a pure UI concern: the sidecar holds the canonical log, the UI replays through `@a2ui/web_core`'s `MessageProcessor` locally to materialize state at any tick. No bridge round-trip per scrub frame.

### Data flow examples

**Live mode**

```
agent ──(WS/SSE)──▶ sidecar.adapter ──▶ SessionStore (append, assign tick)
                                              │
                                              ▼
                                       sidecar.bridge ──(local WS)──▶ UI
                                                                          │
                                                                          ▼
                                                                  UI store appends;
                                                                  if scrub is at HEAD,
                                                                  UI replays new msg
                                                                  through processor
                                                                          │
                                                                          ▼
                                                                  Panels re-render
```

**File replay**

```
user drops .jsonl on UI ──(bridge: loadFile)──▶ sidecar.adapter.file
                                                       │
                                                       ▼ (read, parse, validate)
                                                SessionStore (replaces log)
                                                       │
                                                       ▼
                                            batched bridge events to UI
                                                       │
                                                       ▼
                                            UI rebuilds session, scrub defaults to tick 0
```

**Action injection**

```
user clicks "inject" in UI ──(bridge: injectAction)──▶ sidecar.adapter (live transport)
                                                              │
                                                              ▼
                                                      sent upstream to agent
                                                              │
                                                              ▼ (also recorded)
                                                      SessionStore appends actionSent
                                                              │
                                                              ▼ (bridge event)
                                                      UI shows it in timeline
```

## UI/UX

### Top-level layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  A2UI Inspector  •  ws://localhost:8000 [connected]  •  234 msgs  •  ●REC   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [+ Connect] [⤓ Load file] [▶ Mock agent] [⤒ Save] [⤓ Export JSONL] [⚙ Settings]
├──────────────┬─────────────────────────────────────┬─────────────────────────┤
│ TIMELINE     │ MAIN PANE  ( tab bar:  Preview | Tree | Diff )                │
│              │                                                                │
│ [filter: ▼]  │ ┌──────────────────────────┬──────────────────────────────┐   │
│              │ │ COMPONENT TREE           │ PREVIEW                       │   │
│ 14:32:01 ◌  │ │  surface "main"          │ ┌──────────────────────────┐ │   │
│  createSrf   │ │  ├─ root (Column)        │ │                          │ │   │
│ 14:32:01 ◉  │ │  │  ├─ greeting (Text)   │ │  Hello, Yvon!            │ │   │
│  updComp ×3  │ │  │  └─ form (Column)     │ │                          │ │   │
│ 14:32:02 ◌  │ │  │     ├─ input (TextFld)│ │  [____________________]  │ │   │
│  updData     │ │  │     └─ submit (Btn)   │ │  [ Submit ]              │ │   │
│ 14:32:04 ←  │ │                          │ │                          │ │   │
│  action(tap) │ │  selected: input         │ └──────────────────────────┘ │   │
│ 14:32:04 ◌  │ │  ┌─────────────────────┐ │ [⚡ Inject action] [Render:  │   │
│  updData     │ │  │ component: TextFld  │ │  mobile▾]                    │   │
│ 14:32:05 ◉  │ │  │ id: "input"         │ │                              │   │
│  updComp     │ │  │ value: → /user/name │ │                              │   │
│              │ │  │ placeholder: "..."  │ │                              │   │
│  scrub:      │ │  └─────────────────────┘ │                              │   │
│  ◀━━━●━━━▶  │ └──────────────────────────┴──────────────────────────────┘   │
│              │                                                                │
│              │ DATA MODEL ( bottom drawer, collapsible )                     │
│              │ ┌────────────────────────────────────────────────────────┐    │
│              │ │ /                                                       │    │
│              │ │ ├─ title: "Hello..."                                    │    │
│              │ │ ├─ user                                                 │    │
│              │ │ │  └─ name: "Yvon"          ← changed at tick 5         │    │
│              │ │ └─ items: [3 entries]                                   │    │
│              │ │ Diff vs prev tick: + /user/name (was: undefined)        │    │
│              │ └────────────────────────────────────────────────────────┘    │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

### Panel behavior

**Timeline (left rail)**
- Vertical list of messages: tick #, timestamp, kind, summary
- Color-coded by kind (createSurface, updateComponents, updateDataModel, action, diagnostic)
- Filter dropdown: all / agent→client only / client→agent only / errors only
- Click row → scrubs to that tick; drag scrub bar for continuous scrub
- Keyboard: `←`/`→` step ±1 tick; `Shift+←/→` step ±10; `Home`/`End` jump to bounds

**Component Tree (main pane tab)**
- Tree view of current surface(s) at the scrubbed tick
- Click a component → highlight in Preview pane + open prop inspector below
- Prop inspector: id, type, raw JSON, resolved data bindings (e.g. `value: → /user/name → "Yvon"`)
- Multi-surface: surface tabs at top of pane

**Preview (main pane tab)**
- Renders the current surface using `@a2ui/react` against the scrubbed state
- Device-frame toggle: mobile / tablet / desktop widths
- Action injector: capture interactions in the preview as candidate actions; show an "Inject?" confirm before sending; on confirm, send via the bridge
- Tree-selected component highlighted with a dotted outline

**Diff (main pane tab)**
- Side-by-side prev tick vs current tick
- Shows what `updateComponents` / `updateDataModel` changed
- Highlights added / removed / mutated component ids and data model paths

**Data Model (bottom drawer)**
- Collapsible JSON tree of the current data model
- Each leaf shows value, source path, and tick last changed
- Diff vs prev tick highlighted

### Visual direction

- **Dense, devtool aesthetic.** Borrows from Chrome DevTools / VS Code / Linear: monospace for JSON, 1px borders, no gradients, system font for chrome.
- **Dark mode default**, light mode toggle.
- **Limited palette:** background, surface, accent, success/warn/error. No design system (no MUI, no Ant) — devtools should feel utilitarian.
- **Component library:** TailwindCSS + Radix UI primitives (unstyled accessible building blocks for tabs, dialogs, dropdowns, popovers). Keeps bundle small.
- **Icons:** Lucide.

### Keyboard-first

A devtool's value scales with keyboard support.
- `Cmd/Ctrl+K` — command palette (connect, load file, jump to tick, switch tab)
- `←` / `→` — step timeline
- `T` / `R` / `D` — switch main-pane tab (Tree / Preview / Diff)
- `Cmd/Ctrl+S` — save session
- `Cmd/Ctrl+O` — open session file
- `/` — focus filter

## Error handling

The Inspector consumes data from untrusted sources (LLM-generated messages, user-supplied files, broken agents). Three categories:

| Category | Examples | Behavior |
|---|---|---|
| Sidecar-fatal | Port in use, can't bind WS, bad CLI flags | Exit non-zero with a clear stderr message |
| Per-message recoverable | Malformed JSON from upstream, unknown message kind, action send fails | Log a diagnostic event into the session; UI marks the tick; never crash |
| UI rendering errors | Preview crashes on a malformed surface | React error boundary on the affected panel; rest of UI stays alive (user can scrub past the bad tick) |

Diagnostics appear as their own timeline row + a counter in the status bar. The user can filter the timeline to "errors only."

## Testing strategy

**Sidecar (`packages/sidecar`)** — Vitest
- Unit tests for each adapter (WS / SSE / file / proxy) against mocked sockets and fixture files
- SessionStore append / replace / truncate semantics; persistence round-trip
- Integration: spin up a fixture upstream + sidecar + fake browser WS client; assert events flow through correctly
- Bridge protocol Zod schemas validate every fixture in both directions

**UI (`packages/ui`)** — Vitest + React Testing Library + Playwright
- Component-level: each panel renders correctly given a fixed (session, tick) pair, no network
- Store-level: scrub correctness, replay determinism, action-injector state machine
- End-to-end (Playwright): launch an in-process fake sidecar, load a recorded JSONL fixture, drive the UI through representative flows

**Shared (`packages/shared`)** — Vitest
- Zod schemas accept known-good fixtures and reject known-bad fixtures

**Fixtures.** A small library under `examples/recordings/` doubles as test data:
- `restaurant-finder-happy-path.jsonl`
- `malformed-components.jsonl`
- `multi-surface.jsonl`
- `action-roundtrip.jsonl`

**CI.** GitHub Actions; `pnpm install && pnpm test && pnpm build` on Node 20 + 22.

## Performance targets (informal)

- Scrub at 60 fps on sessions up to **10,000 messages**, using periodic state snapshots rather than full replay from tick 0
- Bridge end-to-end latency (agent message → UI render) under **50 ms** on localhost
- `npx a2ui-inspector` cold start to UI ready: under **2 s**

## Risks & open questions

1. **`@a2ui/react` API stability.** We embed it; breaking changes upstream break our preview pane. Mitigation: pin to a known-good version; smoke-test on each renderer update; document the version contract.
2. **Action event shape.** The v0.9 spec's action serialization is sparsely documented publicly; we may need to align with reference renderers during implementation, and revisit on v0.10.
3. **Snapshot strategy for scrub.** Periodic snapshots of data model + components map is straightforward but memory-hungry for huge sessions. Acceptable for v1; revisit if reports come in of >100k-message sessions.
4. **Proxy mode complexity.** MITM for arbitrary upstream HTTP+WS is fiddly (TLS, header preservation, framing). Risk we ship a flaky proxy mode in v1; mitigation is to gate it behind an explicit `--proxy` flag and mark "experimental" if quality slips before release.
5. **Naming on npm.** Reserve `a2ui-inspector` early in case of squatting.

## Distribution

- npm package: `a2ui-inspector` with a `bin` entry. Users run `npx a2ui-inspector` to boot.
- Default port: `8765` (configurable via `--port`).
- Also published as a Docker image (`a2ui/inspector`) for CI / headless replay use cases.
- Repo: `github.com/<user-or-org>/a2ui-inspector`, MIT.
- README with an animated GIF demo (essential for devtool adoption).

## Future work (separately specced)

- **v1.5 — Share-via-URL.** Optional hosted backend so users can share session recordings with collaborators by link. Privacy review needed (logs may contain secrets).
- **v1.5 — Bridge auth.** Token-based auth on the local bridge, enabling safe remote-host inspector usage.
- **v2 — Renderer-pluggable preview.** Let users pick which renderer (Lit / Angular / SwiftUI-via-iframe) drives the preview pane, so they preview in their actual target.
- **v2 — Spec validator CLI.** Standalone command that validates a JSONL session against the v0.9 spec; useful in CI for renderer authors. Reuses the same Zod schemas.
- **v2 — Multi-agent dashboard.** Concurrent recording from multiple agents/sessions, side-by-side.
