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

  const btn =
    "flex items-center gap-1 rounded border border-edge px-2 py-1 text-xs hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent";

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
