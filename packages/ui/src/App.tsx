import { useEffect, useRef } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { MainPaneTabs } from "./components/MainPaneTabs.js";
import { ActionInjector } from "./components/ActionInjector.js";
import { Timeline } from "./panels/Timeline.js";
import { Preview } from "./panels/Preview.js";
import { ComponentTree } from "./panels/ComponentTree.js";
import { Diff } from "./panels/Diff.js";
import { DataModel } from "./panels/DataModel.js";
import { useSessionStore } from "./store/session.js";
import { useMainPaneStore } from "./store/mainPane.js";
import { bridge } from "./transport/bridgeClient.js";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);
  const mainTab = useMainPaneStore((s) => s.tab);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bridge.connect(); }, []);

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

  return (
    <div ref={dropRef} className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => {
          const url = window.prompt("Upstream URL — ws:// or wss:// for WebSocket, http:// or https:// for SSE:");
          if (!url) return;
          const transport = /^wss?:\/\//i.test(url) ? "websocket" : "sse";
          bridge.send({ kind: "connectUpstream", config: { transport, url } });
        }}
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
        onLoadFile={() => {
          const path = window.prompt("Path to .a2ui-session.jsonl on the host:");
          if (path) bridge.send({ kind: "loadFile", path });
        }}
        onSave={() => {
          const path = window.prompt("Save session to:");
          if (path) bridge.send({ kind: "saveSession", path });
        }}
        upstreamStatus={upstreamDetail ? `${upstreamStatus} (${upstreamDetail})` : upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 overflow-y-auto border-r border-neutral-800"><Timeline /></aside>
        <section className="flex flex-1 flex-col overflow-hidden">
          <MainPaneTabs />
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto">
              {mainTab === "preview" && <Preview />}
              {mainTab === "tree" && <ComponentTree />}
              {mainTab === "diff" && <Diff />}
            </div>
            <aside className="w-80 overflow-auto border-l border-neutral-800"><DataModel /></aside>
          </div>
          <ActionInjector onInject={(action) => bridge.send({ kind: "injectAction", action })} />
        </section>
      </main>
    </div>
  );
}
