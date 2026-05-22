# A2UI Inspector — Phase 2c: Polish & Packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish v1 of the A2UI Inspector — add a command palette, global keyboard shortcuts, a light-mode toggle, a Preview device-frame selector, a Docker image, and extra fixture recordings.

**Architecture:** Build on the Phase 1+2a+2b monorepo. Light mode is done with CSS-custom-property color tokens (so the toggle flips one class, not every component) plus a one-time sweep of the hardcoded `neutral-*` utility classes onto semantic tokens. The command palette and keyboard shortcuts are small self-contained UI units backed by Zustand stores. Docker uses a two-stage build.

**Tech Stack:** Existing — TypeScript 5, React 18, Zustand 4, Vite 5, TailwindCSS 3, Vitest, `lucide-react`. Plus a `node:20-slim` Docker image.

---

## Phase 2c scope

**In scope:**
- Light-mode toggle — CSS-variable color tokens, theme store, `localStorage` persistence, Toolbar toggle
- Preview device-frame selector — mobile / tablet / desktop widths
- Command palette — `Cmd/Ctrl+K`, fuzzy-filter, arrow-navigate, Enter-run
- Global keyboard shortcuts — `Cmd/Ctrl+K` palette, `Cmd/Ctrl+S` save, `Cmd/Ctrl+O` open file, `T`/`R`/`D` main-pane tab switch
- Extra fixture recordings — `malformed-components`, `multi-surface`, `action-roundtrip` + a validation test
- Docker image — `Dockerfile` + `.dockerignore` + README section

**Out of scope (none deferred — this completes v1):** the design's `/` "focus filter" shortcut is dropped because the Timeline filter dropdown was never built.

## Starting state

- Branch off `main` (Phase 1+2a+2b merged).
- Working dir: `/Users/yvon.zhu/Documents/GitHub/a2ui-inspector`
- Existing relevant code:
  - `packages/ui/tailwind.config.js` — `darkMode: "class"`, content globs for `index.html` + `src/**/*.{ts,tsx}`.
  - `packages/ui/index.html` — `<html lang="en" class="dark">`, `<body class="bg-neutral-950 text-neutral-100">`.
  - `packages/ui/src/index.css` — `@tailwind` directives, a `body` font rule, a `.mono` rule.
  - `packages/ui/src/components/` — `Toolbar.tsx`, `MainPaneTabs.tsx`, `ActionInjector.tsx`, `JsonTree.tsx`.
  - `packages/ui/src/panels/` — `Timeline.tsx`, `Preview.tsx`, `ComponentTree.tsx`, `DataModel.tsx`, `Diff.tsx`.
  - `packages/ui/src/store/` — `session.ts`, `timeline.ts`, `selection.ts`, `mainPane.ts` (`mainPane` exports `useMainPaneStore` with `tab: "preview"|"tree"|"diff"`, `setTab`, type `MainPaneTab`).
  - `packages/ui/src/App.tsx` — wires Toolbar + MainPaneTabs + panels + ActionInjector + `bridge`.
  - `packages/sidecar/src/session/persistence.ts` — `loadSession(path)`.
  - `packages/sidecar/src/bin.ts` — reads `A2UI_INSPECTOR_HOST` (default `127.0.0.1`) and `A2UI_INSPECTOR_PORT` (default `8765`).
  - `examples/recordings/restaurant-finder-happy-path.jsonl` — the one existing fixture.

## File structure after Phase 2c

```
packages/ui/src/
├── store/
│   ├── theme.ts            NEW — "dark" | "light" + toggle + persistence
│   ├── preview.ts          NEW — device frame ("mobile"|"tablet"|"desktop")
│   └── commandPalette.ts   NEW — open flag
├── components/
│   ├── Toolbar.tsx         MODIFIED — theme toggle button
│   ├── CommandPalette.tsx  NEW — Cmd/Ctrl+K modal
│   └── (others)            MODIFIED — neutral-* → semantic color tokens
├── hooks/
│   └── useGlobalShortcuts.ts  NEW — keyboard shortcut listener
├── panels/Preview.tsx      MODIFIED — device-frame selector
├── App.tsx                 MODIFIED — wire theme, shortcuts, palette
├── index.css               MODIFIED — CSS color-token variables
└── (index.html, tailwind.config.js)  MODIFIED — token wiring

examples/recordings/
├── restaurant-finder-happy-path.jsonl   (existing)
├── malformed-components.jsonl           NEW
├── multi-surface.jsonl                  NEW
└── action-roundtrip.jsonl               NEW

Dockerfile                  NEW
.dockerignore               NEW
```

## Pre-flight notes

1. Run `pnpm test` after each task — the 86 existing tests must stay green.
2. Light mode (Task 1) is the largest task: a mechanical class sweep across ~12 files. If it genuinely cannot be completed in one pass, the implementer should report `DONE_WITH_CONCERNS` and list what remains.
3. Commit after every task.

---

## Task 1: Light-mode toggle

**Files:**
- Modify: `packages/ui/tailwind.config.js`
- Modify: `packages/ui/src/index.css`
- Modify: `packages/ui/index.html`
- Create: `packages/ui/src/store/theme.ts`
- Create: `packages/ui/src/__tests__/themeStore.test.ts`
- Modify: `packages/ui/src/components/Toolbar.tsx`
- Modify (class sweep): every file under `packages/ui/src/` that uses `neutral-*` utility classes

### Background

The UI currently hardcodes a dark palette (`bg-neutral-950`, `text-neutral-100`, `border-neutral-800`, …). Light mode is implemented by (a) defining semantic color tokens backed by CSS custom properties, (b) sweeping the hardcoded `neutral-*` classes onto those tokens, (c) a theme store that toggles a `light` class on `<html>`. Accent colors (`emerald-*`, `sky-*`, `amber-*`, `red-*`) are left unchanged — they read on both themes.

- [ ] **Step 1: Extend `packages/ui/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--app) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        edge: "rgb(var(--edge) / <alpha-value>)",
        "edge-strong": "rgb(var(--edge-strong) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        "ink-faint": "rgb(var(--ink-faint) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Add the token variables to `packages/ui/src/index.css`**

Replace the file with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --app: 10 10 10;
  --surface: 23 23 23;
  --raised: 38 38 38;
  --edge: 38 38 38;
  --edge-strong: 64 64 64;
  --ink: 245 245 245;
  --ink-muted: 163 163 163;
  --ink-faint: 115 115 115;
}

:root.light {
  --app: 250 250 250;
  --surface: 245 245 245;
  --raised: 229 229 229;
  --edge: 212 212 212;
  --edge-strong: 163 163 163;
  --ink: 23 23 23;
  --ink-muted: 82 82 82;
  --ink-faint: 115 115 115;
}

body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.mono { font-family: ui-monospace, "JetBrains Mono", "Fira Code", monospace; }
```

- [ ] **Step 3: Update `packages/ui/index.html`**

Change the `<html>` tag from `<html lang="en" class="dark">` to `<html lang="en">` (dark is the `:root` default; the `light` class is added at runtime). Change the `<body>` class from `bg-neutral-950 text-neutral-100` to `bg-app text-ink`.

- [ ] **Step 4: Write the failing theme-store test**

`packages/ui/src/__tests__/themeStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { useThemeStore } from "../store/theme.js";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("light");
  useThemeStore.setState({ theme: "dark" });
});

describe("theme store", () => {
  it("defaults to dark", () => {
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggle() flips the theme", () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("applyTheme adds the light class for light and removes it for dark", () => {
    useThemeStore.setState({ theme: "light" });
    useThemeStore.getState().applyTheme();
    expect(document.documentElement.classList.contains("light")).toBe(true);
    useThemeStore.setState({ theme: "dark" });
    useThemeStore.getState().applyTheme();
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("toggle persists the chosen theme to localStorage", () => {
    useThemeStore.getState().toggle();
    expect(localStorage.getItem("a2ui-inspector-theme")).toBe("light");
  });
});
```

- [ ] **Step 5: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/theme.js` not found.

- [ ] **Step 6: Implement `packages/ui/src/store/theme.ts`**

```typescript
import { create } from "zustand";

export type Theme = "dark" | "light";

const STORAGE_KEY = "a2ui-inspector-theme";

function initialTheme(): Theme {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return stored === "light" ? "light" : "dark";
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  applyTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    set({ theme: next });
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
    get().applyTheme();
  },
  applyTheme: () => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("light", get().theme === "light");
  },
}));
```

- [ ] **Step 7: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 4 theme-store tests pass.

- [ ] **Step 8: Add the theme toggle button to `packages/ui/src/components/Toolbar.tsx`**

Read the current `Toolbar.tsx`. It has props `onConnect, onProxy, onLoadFile, onSave, upstreamStatus` and a row of buttons. Add a theme toggle:
- Add `import { Moon, Sun } from "lucide-react";` to the existing `lucide-react` import.
- Add `import { useThemeStore } from "../store/theme.js";`.
- Inside the component body: `const theme = useThemeStore((s) => s.theme); const toggleTheme = useThemeStore((s) => s.toggle);`
- Add this button as the FIRST child of the right-hand button row (before `Connect`):

```tsx
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
```

(Note the button already uses the new `border-edge` / `hover:bg-surface` tokens — Step 9 sweeps the rest.)

- [ ] **Step 9: Sweep `neutral-*` classes to semantic tokens**

Find every occurrence of a `neutral-` color class in `packages/ui/src/` (all `.tsx` files) and `packages/ui/index.html` and replace per this table:

| Old class fragment | New |
|---|---|
| `bg-neutral-950` | `bg-app` |
| `bg-neutral-900` | `bg-surface` |
| `bg-neutral-800` | `bg-raised` |
| `hover:bg-neutral-900` | `hover:bg-surface` |
| `hover:bg-neutral-800` | `hover:bg-raised` |
| `border-neutral-800` | `border-edge` |
| `border-neutral-700` | `border-edge-strong` |
| `text-neutral-100` | `text-ink` |
| `text-neutral-200` | `text-ink` |
| `text-neutral-300` | `text-ink` |
| `text-neutral-400` | `text-ink-muted` |
| `text-neutral-500` | `text-ink-muted` |
| `text-neutral-600` | `text-ink-faint` |

Run `grep -rn "neutral-" packages/ui/src packages/ui/index.html` first to enumerate every occurrence. Apply the mapping. If a `neutral-` shade appears that is not in the table, map it to the nearest token (lighter backgrounds → `surface`/`raised`; brighter text → `ink`; dimmer text → `ink-muted`). Leave all `emerald-*`, `sky-*`, `amber-*`, `red-*` classes untouched.

After the sweep, `grep -rn "neutral-" packages/ui/src packages/ui/index.html` should return nothing.

- [ ] **Step 10: Wire `applyTheme` on startup**

In `packages/ui/src/App.tsx`, add `import { useThemeStore } from "./store/theme.js";` and, inside the existing `useEffect(() => { bridge.connect(); }, [])` OR a new effect, call the theme application once on mount:

```tsx
  useEffect(() => {
    useThemeStore.getState().applyTheme();
  }, []);
```

- [ ] **Step 11: Verify**

Run: `pnpm --filter @a2ui-inspector/ui test` — all UI tests pass (90 total: 86 + 4 theme).
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.
Run: `pnpm --filter @a2ui-inspector/ui build` — clean.
Run: `grep -rn "neutral-" packages/ui/src packages/ui/index.html` — no output.

- [ ] **Step 12: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add light-mode toggle via CSS color tokens"
```

---

## Task 2: Preview device-frame selector

**Files:**
- Create: `packages/ui/src/store/preview.ts`
- Create: `packages/ui/src/__tests__/previewStore.test.ts`
- Modify: `packages/ui/src/panels/Preview.tsx`

- [ ] **Step 1: Write the failing store test**

`packages/ui/src/__tests__/previewStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { usePreviewStore, FRAME_WIDTHS } from "../store/preview.js";

beforeEach(() => usePreviewStore.setState({ frame: "desktop" }));

describe("preview store", () => {
  it("defaults to the desktop frame", () => {
    expect(usePreviewStore.getState().frame).toBe("desktop");
  });

  it("setFrame changes the frame", () => {
    usePreviewStore.getState().setFrame("mobile");
    expect(usePreviewStore.getState().frame).toBe("mobile");
  });

  it("FRAME_WIDTHS maps mobile and tablet to pixel widths and desktop to undefined", () => {
    expect(FRAME_WIDTHS.mobile).toBe(390);
    expect(FRAME_WIDTHS.tablet).toBe(768);
    expect(FRAME_WIDTHS.desktop).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../store/preview.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/store/preview.ts`**

```typescript
import { create } from "zustand";

export type DeviceFrame = "mobile" | "tablet" | "desktop";

/** Max content width per frame, in CSS pixels. `desktop` is unconstrained. */
export const FRAME_WIDTHS: Record<DeviceFrame, number | undefined> = {
  mobile: 390,
  tablet: 768,
  desktop: undefined,
};

interface PreviewState {
  frame: DeviceFrame;
  setFrame: (frame: DeviceFrame) => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  frame: "desktop",
  setFrame: (frame) => set({ frame }),
}));
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 3 preview-store tests pass.

- [ ] **Step 5: Add the frame selector to `packages/ui/src/panels/Preview.tsx`**

Read the current `Preview.tsx`. It renders an optional surface-tab row (when `>1` surface) and a `<div className="flex-1 overflow-auto p-3">` containing the surface card with `<A2uiSurface>`.

Add the device-frame selector and apply the width:
- Add imports: `import { usePreviewStore, FRAME_WIDTHS, type DeviceFrame } from "../store/preview.js";`
- Inside the component: `const frame = usePreviewStore((s) => s.frame); const setFrame = usePreviewStore((s) => s.setFrame);`
- Add a frame-selector row directly above the `<div className="flex-1 overflow-auto p-3">` content area (inside the same outer `flex h-full flex-col` container, after the surface-tab row):

```tsx
      <div className="flex items-center gap-1 border-b border-edge px-2 py-1">
        {(["mobile", "tablet", "desktop"] as DeviceFrame[]).map((f) => (
          <button
            key={f}
            onClick={() => setFrame(f)}
            className={
              "mono rounded px-2 py-0.5 text-xs " +
              (frame === f ? "bg-raised text-ink" : "text-ink-muted hover:bg-surface")
            }
          >
            {f}
          </button>
        ))}
      </div>
```

- Wrap the surface card so its width is constrained by the selected frame. Change the content `<div className="flex-1 overflow-auto p-3">` so its inner content sits in a width-limited, centered box:

```tsx
      <div className="flex-1 overflow-auto p-3">
        <div
          className="mx-auto"
          style={{ maxWidth: FRAME_WIDTHS[frame] ? `${FRAME_WIDTHS[frame]}px` : undefined }}
        >
          {/* existing surface card markup goes here, unchanged */}
        </div>
      </div>
```

Preserve everything else in `Preview.tsx` — the `SurfaceErrorBoundary`, the `stateAtTick` call, the surface-tab row, the empty state.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @a2ui-inspector/ui test` — all pass (93 total).
Run: `pnpm --filter @a2ui-inspector/ui typecheck && pnpm --filter @a2ui-inspector/ui build` — clean.

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Preview device-frame selector (mobile/tablet/desktop)"
```

---

## Task 3: Command palette

**Files:**
- Create: `packages/ui/src/store/commandPalette.ts`
- Create: `packages/ui/src/components/CommandPalette.tsx`
- Create: `packages/ui/src/__tests__/commandPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/commandPalette.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommandPalette, type PaletteCommand } from "../components/CommandPalette.js";
import { useCommandPaletteStore } from "../store/commandPalette.js";

function commands(run: () => void): PaletteCommand[] {
  return [
    { id: "connect", label: "Connect to upstream", run },
    { id: "save", label: "Save session", run: () => {} },
    { id: "tree", label: "Switch to Tree tab", run: () => {} },
  ];
}

beforeEach(() => useCommandPaletteStore.setState({ open: true }));

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    useCommandPaletteStore.setState({ open: false });
    const { container } = render(<CommandPalette commands={commands(() => {})} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists all commands when open with an empty query", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    expect(screen.getByText("Connect to upstream")).toBeTruthy();
    expect(screen.getByText("Save session")).toBeTruthy();
    expect(screen.getByText("Switch to Tree tab")).toBeTruthy();
  });

  it("filters commands by the typed query (case-insensitive)", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "save" } });
    expect(screen.getByText("Save session")).toBeTruthy();
    expect(screen.queryByText("Connect to upstream")).toBeNull();
  });

  it("runs the selected command on Enter and closes", () => {
    const run = vi.fn();
    render(<CommandPalette commands={commands(run)} />);
    // First command is selected by default.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("ArrowDown moves the selection before Enter runs it", () => {
    const run = vi.fn();
    // run is on the FIRST command; move down twice → third command, whose run is a noop.
    render(<CommandPalette commands={commands(run)} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).not.toHaveBeenCalled();
  });

  it("Escape closes the palette", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — palette store + component not found.

- [ ] **Step 3: Implement `packages/ui/src/store/commandPalette.ts`**

```typescript
import { create } from "zustand";

interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
```

- [ ] **Step 4: Implement `packages/ui/src/components/CommandPalette.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useCommandPaletteStore } from "../store/commandPalette.js";

export interface PaletteCommand {
  id: string;
  label: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: PaletteCommand[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  // Reset query + selection each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  if (!open) return null;

  const clampedSelected = Math.min(selected, Math.max(0, filtered.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[clampedSelected];
      if (cmd) {
        setOpen(false);
        cmd.run();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[32rem] max-w-[90vw] overflow-hidden rounded border border-edge-strong bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={query}
          placeholder="Type a command…"
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={onKeyDown}
          className="w-full border-b border-edge bg-surface px-3 py-2 text-sm text-ink outline-none"
        />
        <ul className="max-h-72 overflow-auto">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-ink-faint">No matching commands</li>
          )}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              onClick={() => { setOpen(false); cmd.run(); }}
              onMouseEnter={() => setSelected(i)}
              className={
                "cursor-pointer px-3 py-2 text-sm " +
                (i === clampedSelected ? "bg-raised text-ink" : "text-ink-muted")
              }
            >
              {cmd.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 6 command-palette tests pass.
Run: `pnpm --filter @a2ui-inspector/ui typecheck` — clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add command palette component + store"
```

---

## Task 4: Global keyboard shortcuts

**Files:**
- Create: `packages/ui/src/hooks/useGlobalShortcuts.ts`
- Create: `packages/ui/src/__tests__/useGlobalShortcuts.test.tsx`
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/__tests__/useGlobalShortcuts.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGlobalShortcuts, type ShortcutHandlers } from "../hooks/useGlobalShortcuts.js";

function Harness({ handlers }: { handlers: ShortcutHandlers }) {
  useGlobalShortcuts(handlers);
  return <div>harness</div>;
}

function makeHandlers(): ShortcutHandlers & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const onSave = vi.fn();
  const onOpenFile = vi.fn();
  const onTogglePalette = vi.fn();
  const onTab = vi.fn();
  return { onSave, onOpenFile, onTogglePalette, onTab, spies: { onSave, onOpenFile, onTogglePalette, onTab } };
}

describe("useGlobalShortcuts", () => {
  it("Cmd/Ctrl+K toggles the palette", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(h.spies.onTogglePalette).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+S triggers save", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(h.spies.onSave).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+O triggers open file", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(h.spies.onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("plain T/R/D switch the main-pane tab", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "d" });
    expect(h.spies.onTab).toHaveBeenNthCalledWith(1, "preview");
    expect(h.spies.onTab).toHaveBeenNthCalledWith(2, "tree");
    expect(h.spies.onTab).toHaveBeenNthCalledWith(3, "diff");
  });

  it("ignores shortcuts while typing in an input", () => {
    const h = makeHandlers();
    render(
      <Harness handlers={h} />,
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "t" });
    expect(h.spies.onTab).not.toHaveBeenCalled();
    input.remove();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: FAIL — `../hooks/useGlobalShortcuts.js` not found.

- [ ] **Step 3: Implement `packages/ui/src/hooks/useGlobalShortcuts.ts`**

```typescript
import { useEffect } from "react";
import type { MainPaneTab } from "../store/mainPane.js";

export interface ShortcutHandlers {
  onSave: () => void;
  onOpenFile: () => void;
  onTogglePalette: () => void;
  onTab: (tab: MainPaneTab) => void;
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
      if (!mod && key in TAB_KEYS) {
        handlers.onTab(TAB_KEYS[key]!);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @a2ui-inspector/ui test`
Expected: 5 shortcut tests pass.

- [ ] **Step 5: Wire shortcuts + the palette into `packages/ui/src/App.tsx`**

Read the current `App.tsx`. It defines the Toolbar handler callbacks inline. Refactor so the save / load-file handlers are named functions reusable by both the Toolbar and the shortcuts, then mount `useGlobalShortcuts`, the `CommandPalette`, and build the command list.

Make these changes to `App.tsx`:

1. Add imports:

```tsx
import { useCallback } from "react";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette.js";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts.js";
import { useCommandPaletteStore } from "./store/commandPalette.js";
import { useThemeStore } from "./store/theme.js";
import { useMainPaneStore } from "./store/mainPane.js";
```

(`useMainPaneStore` is likely already imported — do not double-import. `useThemeStore` was added in Task 1 — keep one import.)

2. Inside the component, after the existing store selectors, add:

```tsx
  const setTab = useMainPaneStore((s) => s.setTab);
  const togglePalette = useCommandPaletteStore((s) => s.toggle);
  const toggleTheme = useThemeStore((s) => s.toggle);

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

  useGlobalShortcuts({
    onSave: handleSave,
    onOpenFile: handleLoadFile,
    onTogglePalette: togglePalette,
    onTab: setTab,
  });

  const paletteCommands: PaletteCommand[] = [
    { id: "connect", label: "Connect to upstream", run: handleConnect },
    { id: "load", label: "Load session file", run: handleLoadFile },
    { id: "save", label: "Save session", run: handleSave },
    { id: "clear", label: "Clear session", run: () => bridge.send({ kind: "clear" }) },
    { id: "tab-preview", label: "Show Preview tab", run: () => setTab("preview") },
    { id: "tab-tree", label: "Show Tree tab", run: () => setTab("tree") },
    { id: "tab-diff", label: "Show Diff tab", run: () => setTab("diff") },
    { id: "theme", label: "Toggle light/dark theme", run: toggleTheme },
  ];
```

3. Update the `Toolbar` JSX so `onConnect`/`onLoadFile`/`onSave` use the named callbacks (`handleConnect`, `handleLoadFile`, `handleSave`) instead of inline arrow functions. Leave `onProxy` as its existing inline handler. Leave `upstreamStatus` unchanged.

4. Render `<CommandPalette commands={paletteCommands} />` as the last child inside the top-level `<div ref={dropRef} ...>` (after `<main>`).

Do not remove any existing functionality — the drag-drop effect, `bridge.connect()`, the panels, the ActionInjector all stay.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @a2ui-inspector/ui test` — all pass.
Run: `pnpm --filter @a2ui-inspector/ui typecheck && pnpm --filter @a2ui-inspector/ui build` — clean.
Run: `pnpm e2e` — the happy-path e2e must still pass (the palette is closed by default and must not intercept the existing flow).

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add global keyboard shortcuts + wire command palette"
```

---

## Task 5: Extra fixture recordings

**Files:**
- Create: `examples/recordings/malformed-components.jsonl`
- Create: `examples/recordings/multi-surface.jsonl`
- Create: `examples/recordings/action-roundtrip.jsonl`
- Create: `packages/sidecar/src/__tests__/fixtures.test.ts`

- [ ] **Step 1: Create `examples/recordings/malformed-components.jsonl`**

A session whose components reference a non-existent child and use an unknown component type — valid JSONL, valid schema, exercises UI resilience. Three lines, single trailing newline:

```jsonl
{"tick":0,"ts":1700000100000,"direction":"agent->client","message":{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}}
{"tick":1,"ts":1700000100100,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["title","ghost"]},{"id":"title","component":"WidgetThatDoesNotExist"}]}}}
{"tick":2,"ts":1700000100200,"direction":"agent->client","message":{"version":"v0.9","updateDataModel":{"surfaceId":"main","path":"/","value":{"title":"Broken refs on purpose"}}}}
```

- [ ] **Step 2: Create `examples/recordings/multi-surface.jsonl`**

A session that creates two surfaces. Four lines, single trailing newline:

```jsonl
{"tick":0,"ts":1700000200000,"direction":"agent->client","message":{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}}
{"tick":1,"ts":1700000200100,"direction":"agent->client","message":{"version":"v0.9","createSurface":{"surfaceId":"sidebar","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}}
{"tick":2,"ts":1700000200200,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Text","text":{"path":"/heading"}}]}}}
{"tick":3,"ts":1700000200300,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"sidebar","components":[{"id":"root","component":"Text","text":{"path":"/label"}}]}}}
```

- [ ] **Step 3: Create `examples/recordings/action-roundtrip.jsonl`**

A session with both an agent message and a client action. Three lines, single trailing newline:

```jsonl
{"tick":0,"ts":1700000300000,"direction":"agent->client","message":{"version":"v0.9","createSurface":{"surfaceId":"main","catalogId":"https://a2ui.org/specification/v0_9/basic_catalog.json"}}}
{"tick":1,"ts":1700000300100,"direction":"agent->client","message":{"version":"v0.9","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Button"}]}}}
{"tick":2,"ts":1700000300200,"direction":"client->agent","action":{"surfaceId":"main","componentId":"root","kind":"tap"}}
```

- [ ] **Step 4: Write the fixture-validation test**

`packages/sidecar/src/__tests__/fixtures.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSession } from "../session/persistence.js";

// The sidecar package is ESM, so `__dirname` is not defined — derive it.
const here = dirname(fileURLToPath(import.meta.url));
const RECORDINGS = resolve(here, "../../../../examples/recordings");

const FIXTURES = [
  "restaurant-finder-happy-path.jsonl",
  "malformed-components.jsonl",
  "multi-surface.jsonl",
  "action-roundtrip.jsonl",
];

describe("example fixture recordings", () => {
  for (const name of FIXTURES) {
    it(`${name} parses cleanly as a session`, async () => {
      const entries = await loadSession(resolve(RECORDINGS, name));
      expect(entries.length).toBeGreaterThan(0);
      entries.forEach((e, i) => expect(e.tick).toBe(i));
    });
  }

  it("multi-surface.jsonl creates two distinct surfaces", async () => {
    const entries = await loadSession(resolve(RECORDINGS, "multi-surface.jsonl"));
    const created = entries
      .map((e) => e.message && "createSurface" in e.message ? e.message.createSurface.surfaceId : undefined)
      .filter((s): s is string => s !== undefined);
    expect(new Set(created)).toEqual(new Set(["main", "sidebar"]));
  });

  it("action-roundtrip.jsonl contains a client->agent action", async () => {
    const entries = await loadSession(resolve(RECORDINGS, "action-roundtrip.jsonl"));
    expect(entries.some((e) => e.direction === "client->agent" && e.action)).toBe(true);
  });
});
```

Note: the `RECORDINGS` path resolves four levels up from `packages/sidecar/src/__tests__/` to the repo root's `examples/recordings`. If the fixture-not-found error appears, verify that relative path — do not weaken the test.

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter a2ui-inspector test`
Expected: PASS — 6 new fixture tests (4 parse + 2 content), all sidecar tests green. If the `RECORDINGS` path is wrong the tests fail with a file-not-found error — fix the relative path, do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add examples packages/sidecar
git commit -m "test: add malformed/multi-surface/action-roundtrip fixtures + validation"
```

---

## Task 6: Docker image

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `README.md`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
**/node_modules
**/dist
.git
test-results
playwright-report
coverage
ui-dist
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# --- build stage -----------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

# --- runtime stage ---------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app

# Bind to all interfaces so the inspector is reachable from outside the container.
ENV A2UI_INSPECTOR_HOST=0.0.0.0
ENV A2UI_INSPECTOR_PORT=8765
EXPOSE 8765

CMD ["node", "packages/sidecar/dist/bin.js"]
```

- [ ] **Step 3: Add a Docker section to `README.md`**

Read the current `README.md` and append this section at the end:

```markdown
## Docker

Build and run the inspector in a container:

```bash
docker build -t a2ui-inspector .
docker run --rm -p 8765:8765 a2ui-inspector
```

Then open http://localhost:8765. The container binds the sidecar to `0.0.0.0`
so it is reachable via the published port.
```

- [ ] **Step 4: Verify**

Run: `docker build -t a2ui-inspector .`
Expected: a successful image build. If `docker` is not installed in this environment, that is acceptable — instead verify the `Dockerfile` is structurally correct by inspection: two stages, `corepack enable` before any `pnpm` use, `pnpm install --frozen-lockfile && pnpm build` in the build stage, the runtime stage copies `/app` and runs `packages/sidecar/dist/bin.js`. Report which verification path you used.

The sidecar's `bin.ts` attempts to open a browser via `open`/`xdg-open`; that call is wrapped in a `try/catch` and fails harmlessly inside a container.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore README.md
git commit -m "feat: add Docker image for containerized deployment"
```

---

## Phase 2c acceptance checklist

```bash
pnpm install
pnpm build       # clean
pnpm typecheck   # clean
pnpm test        # 86 prior + Phase 2c new tests (theme 4, preview 3, palette 6, shortcuts 5, fixtures 6), all green
pnpm e2e         # happy-path green
grep -rn "neutral-" packages/ui/src packages/ui/index.html   # no output — sweep complete
```

Manual smoke:

```bash
pnpm --filter a2ui-inspector-mock-agent start   # terminal 1
pnpm --filter a2ui-inspector dev                # terminal 2
pnpm --filter @a2ui-inspector/ui dev            # terminal 3
```

In the UI: press `Cmd/Ctrl+K` → command palette opens, filter + Enter runs a command; press `T`/`R`/`D` → main-pane tab switches; click the sun/moon button → theme flips and persists across reload; in the Preview tab, switch mobile/tablet/desktop → the surface width changes. Load `examples/recordings/multi-surface.jsonl` → two surface tabs appear.

This completes the A2UI Inspector v1 design.
