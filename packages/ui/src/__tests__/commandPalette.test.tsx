import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommandPalette, type PaletteCommand } from "../components/CommandPalette.js";
import { useCommandPaletteStore } from "../store/commandPalette.js";

function commands(run: () => void): PaletteCommand[] {
  return [
    { id: "connect", label: "Connect to upstream", run },
    { id: "save", label: "Save session", run: () => {} },
    { id: "tree", label: "Switch to Tree tab", run: () => {} },
  ];
}

beforeEach(() => useCommandPaletteStore.setState({ open: true }));

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    useCommandPaletteStore.setState({ open: false });
    const { container } = render(<CommandPalette commands={commands(() => {})} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists all commands when open with an empty query", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    expect(screen.getByText("Connect to upstream")).toBeTruthy();
    expect(screen.getByText("Save session")).toBeTruthy();
    expect(screen.getByText("Switch to Tree tab")).toBeTruthy();
  });

  it("filters commands by the typed query (case-insensitive)", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "save" } });
    expect(screen.getByText("Save session")).toBeTruthy();
    expect(screen.queryByText("Connect to upstream")).toBeNull();
  });

  it("runs the selected command on Enter and closes", () => {
    const run = vi.fn();
    render(<CommandPalette commands={commands(run)} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it("ArrowDown moves the selection before Enter runs it", () => {
    const run = vi.fn();
    render(<CommandPalette commands={commands(run)} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).not.toHaveBeenCalled();
  });

  it("Escape closes the palette", () => {
    render(<CommandPalette commands={commands(() => {})} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
