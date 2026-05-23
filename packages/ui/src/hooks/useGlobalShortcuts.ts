import { useEffect } from "react";
import type { MainPaneTab } from "../store/mainPane.js";

export interface ShortcutHandlers {
  onSave: () => void;
  onOpenFile: () => void;
  onTogglePalette: () => void;
  onTab: (tab: MainPaneTab) => void;
  onFocusFilter: () => void;
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
      if (!mod && key === "/") {
        e.preventDefault();
        handlers.onFocusFilter();
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
