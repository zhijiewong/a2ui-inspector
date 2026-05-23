import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGlobalShortcuts, type ShortcutHandlers } from "../hooks/useGlobalShortcuts.js";

function Harness({ handlers }: { handlers: ShortcutHandlers }) {
  useGlobalShortcuts(handlers);
  return <div>harness</div>;
}

function makeHandlers(): ShortcutHandlers & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const onSave = vi.fn();
  const onOpenFile = vi.fn();
  const onTogglePalette = vi.fn();
  const onTab = vi.fn();
  const onFocusFilter = vi.fn();
  return {
    onSave, onOpenFile, onTogglePalette, onTab, onFocusFilter,
    spies: { onSave, onOpenFile, onTogglePalette, onTab, onFocusFilter },
  };
}

describe("useGlobalShortcuts", () => {
  it("Cmd/Ctrl+K toggles the palette", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(h.spies.onTogglePalette).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+S triggers save", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(h.spies.onSave).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+O triggers open file", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(h.spies.onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("plain T/R/D switch the main-pane tab", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "t" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "d" });
    expect(h.spies.onTab).toHaveBeenNthCalledWith(1, "preview");
    expect(h.spies.onTab).toHaveBeenNthCalledWith(2, "tree");
    expect(h.spies.onTab).toHaveBeenNthCalledWith(3, "diff");
  });

  it("ignores shortcuts while typing in an input", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "t" });
    expect(h.spies.onTab).not.toHaveBeenCalled();
    input.remove();
  });

  it("`/` focuses the filter when not in a typing target", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(h.spies.onFocusFilter).toHaveBeenCalledTimes(1);
  });

  it("`/` inside an input is ignored", () => {
    const h = makeHandlers();
    render(<Harness handlers={h} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "/" });
    expect(h.spies.onFocusFilter).not.toHaveBeenCalled();
    input.remove();
  });
});
