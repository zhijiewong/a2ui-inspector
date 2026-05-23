import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MainPaneTabs } from "../components/MainPaneTabs.js";
import { useMainPaneStore } from "../store/mainPane.js";

beforeEach(() => useMainPaneStore.setState({ tab: "preview" }));

describe("MainPaneTabs", () => {
  it("renders all tabs", () => {
    render(<MainPaneTabs />);
    expect(screen.getByRole("button", { name: /Preview/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tree/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Diff/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Errors/ })).toBeTruthy();
  });

  it("clicking a tab updates the store", () => {
    render(<MainPaneTabs />);
    fireEvent.click(screen.getByRole("button", { name: /Tree/ }));
    expect(useMainPaneStore.getState().tab).toBe("tree");
  });
});
