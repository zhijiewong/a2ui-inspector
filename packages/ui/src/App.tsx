import { useState } from "react";
import { Toolbar } from "./components/Toolbar.js";

export default function App() {
  const [upstreamStatus] = useState<string>("idle");
  return (
    <div className="flex h-screen flex-col">
      <Toolbar
        onConnect={() => alert("connect — wired in Task 11")}
        onLoadFile={() => alert("load — wired in Task 12")}
        onSave={() => alert("save — wired in Task 12")}
        upstreamStatus={upstreamStatus}
      />
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-neutral-800 p-2 mono text-xs">timeline goes here</aside>
        <section className="flex-1 p-2">preview goes here</section>
      </main>
    </div>
  );
}
