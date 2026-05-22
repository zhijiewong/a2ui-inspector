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
