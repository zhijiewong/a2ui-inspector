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
import { useTimelineFilterStore } from "./store/timelineFilter.js";
import { useFilterFocusStore } from "./store/filterFocus.js";
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
  const [shareError, setShareError] = useState<string | undefined>();

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
          setShareError(message);
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
    useTimelineFilterStore.getState().hydrate();
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
      onFocusFilter: () => useFilterFocusStore.getState().requestFocus(),
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
      {shareError && (
        <div className="flex items-center justify-between border-b border-edge bg-surface px-3 py-1 text-xs text-red-300">
          <span>{shareError}</span>
          <button
            onClick={() => setShareError(undefined)}
            className="rounded border border-edge px-2 py-0.5 text-ink-muted hover:bg-raised"
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
