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
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
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
              onClick={() => {
                setOpen(false);
                cmd.run();
              }}
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
