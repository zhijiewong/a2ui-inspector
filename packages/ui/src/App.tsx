import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar.js";
import { useSessionStore } from "./store/session.js";
import { bridge } from "./transport/bridgeClient.js";

export default function App() {
  const upstreamStatus = useSessionStore((s) => s.upstreamStatus);
  const upstreamDetail = useSessionStore((s) => s.upstreamDetail);

  useEffect(() => { bridge.connect(); }, []);

  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => {
          const url = prompt("Upstream WS URL (e.g. ws://localhost:8000/a2ui):");
          if (url) bridge.send({ kind: "connectUpstream", config: { transport: "websocket", url } });
        }}
        onLoadFile={() => {
          const path = prompt("Path to .a2ui-session.jsonl on the host filesystem:");
          if (path) bridge.send({ kind: "loadFile", path });
        }}
        onSave={() => {
          const path = prompt("Save session to (path):");
          if (path) bridge.send({ kind: "saveSession", path });
        }}
        upstreamStatus={upstreamDetail ? `${upstreamStatus} (${upstreamDetail})` : upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-neutral-800 p-2 mono text-xs">timeline (Task 11)</aside>
        <section className="flex-1 p-2">preview (Task 12)</section>
      </main>
    </div>
  );
}
