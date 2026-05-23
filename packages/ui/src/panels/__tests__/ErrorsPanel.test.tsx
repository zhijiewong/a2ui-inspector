import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorsPanel } from "../ErrorsPanel.js";
import { useDiagnosticsStore } from "../../store/diagnostics.js";
import { useTimelineStore } from "../../store/timeline.js";
import type { Diagnostic } from "@a2ui-inspector/shared";

const make = (over: Partial<Diagnostic>): Diagnostic => ({
  ts: 1, category: "schema", severity: "error",
  code: "parse-failed", message: "bad", ...over,
});

describe("ErrorsPanel", () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().clear();
    useTimelineStore.getState().setScrubTick("head");
  });

  it("shows empty state when no diagnostics", () => {
    render(<ErrorsPanel />);
    expect(screen.queryByText(/No errors in this session/i)).toBeTruthy();
  });

  it("renders one row per diagnostic with code + message", () => {
    useDiagnosticsStore.getState().addMany([
      make({ tick: 1, code: "parse-failed", message: "first" }),
      make({ tick: 2, category: "render", code: "preview-threw", message: "second" }),
    ]);
    render(<ErrorsPanel />);
    expect(screen.queryByText("parse-failed")).toBeTruthy();
    expect(screen.queryByText("preview-threw")).toBeTruthy();
    expect(screen.queryByText("first")).toBeTruthy();
    expect(screen.queryByText("second")).toBeTruthy();
  });

  it("toggling a category chip hides matching rows", () => {
    useDiagnosticsStore.getState().addMany([
      make({ tick: 1, code: "parse-failed" }),
      make({ tick: 2, category: "render", code: "preview-threw" }),
    ]);
    render(<ErrorsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /schema/i }));
    expect(screen.queryByText("parse-failed")).toBeNull();
    expect(screen.queryByText("preview-threw")).toBeTruthy();
  });

  it("clicking a row scrubs to that tick via useTimelineStore", () => {
    useDiagnosticsStore.getState().add(make({ tick: 7 }));
    render(<ErrorsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /tick #7/i }));
    expect(useTimelineStore.getState().scrubTick).toBe(7);
  });
});
