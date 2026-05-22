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
