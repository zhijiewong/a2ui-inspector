import { FilePlus, Link2, Save } from "lucide-react";

export interface ToolbarProps {
  onConnect: () => void;
  onLoadFile: () => void;
  onSave: () => void;
  upstreamStatus: string;
}

export function Toolbar({ onConnect, onLoadFile, onSave, upstreamStatus }: ToolbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">A2UI Inspector</span>
        <span className="mono text-xs text-neutral-500">• {upstreamStatus}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onConnect} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <Link2 size={14} /> Connect
        </button>
        <button onClick={onLoadFile} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <FilePlus size={14} /> Load file
        </button>
        <button onClick={onSave} className="flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs hover:bg-neutral-900">
          <Save size={14} /> Save
        </button>
      </div>
    </header>
  );
}
