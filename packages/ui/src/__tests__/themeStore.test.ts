import { describe, expect, it, beforeEach } from "vitest";
import { useThemeStore } from "../store/theme.js";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("light");
  useThemeStore.setState({ theme: "dark" });
});

describe("theme store", () => {
  it("defaults to dark", () => {
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggle() flips the theme", () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("applyTheme adds the light class for light and removes it for dark", () => {
    useThemeStore.setState({ theme: "light" });
    useThemeStore.getState().applyTheme();
    expect(document.documentElement.classList.contains("light")).toBe(true);
    useThemeStore.setState({ theme: "dark" });
    useThemeStore.getState().applyTheme();
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("toggle persists the chosen theme to localStorage", () => {
    useThemeStore.getState().toggle();
    expect(localStorage.getItem("a2ui-inspector-theme")).toBe("light");
  });
});
