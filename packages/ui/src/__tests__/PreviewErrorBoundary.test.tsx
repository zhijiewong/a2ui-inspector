import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewErrorBoundary } from "../components/PreviewErrorBoundary.js";
import { useDiagnosticsStore } from "../store/diagnostics.js";

function Boom(): never { throw new Error("boom"); }

describe("PreviewErrorBoundary", () => {
  beforeEach(() => useDiagnosticsStore.getState().clear());

  it("renders children when nothing throws", () => {
    render(
      <PreviewErrorBoundary><div>ok</div></PreviewErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeTruthy();
    expect(useDiagnosticsStore.getState().diagnostics.size).toBe(0);
  });

  it("catches a throw, shows fallback, adds a render diagnostic", () => {
    // Silence React's noisy error-boundary log for this test only.
    const original = console.error;
    console.error = () => {};
    try {
      render(
        <PreviewErrorBoundary><Boom /></PreviewErrorBoundary>
      );
      expect(screen.getByText(/Preview crashed/i)).toBeTruthy();
      const ds = Array.from(useDiagnosticsStore.getState().diagnostics.values());
      expect(ds).toHaveLength(1);
      expect(ds[0]!.category).toBe("render");
      expect(ds[0]!.code).toBe("preview-threw");
      expect(ds[0]!.message).toContain("boom");
    } finally {
      console.error = original;
    }
  });

  it("attaches the current tick to the diagnostic", () => {
    const original = console.error;
    console.error = () => {};
    try {
      render(<PreviewErrorBoundary tick={7}><Boom /></PreviewErrorBoundary>);
      const ds = Array.from(useDiagnosticsStore.getState().diagnostics.values());
      expect(ds).toHaveLength(1);
      expect(ds[0]!.tick).toBe(7);
    } finally {
      console.error = original;
    }
  });

  it("clears the error when resetKey changes", () => {
    const original = console.error;
    console.error = () => {};
    try {
      const { rerender } = render(
        <PreviewErrorBoundary resetKey="a"><Boom /></PreviewErrorBoundary>,
      );
      expect(screen.queryByText(/Preview crashed/i)).toBeTruthy();
      // resetKey changes AND children stop throwing → fallback should disappear.
      rerender(<PreviewErrorBoundary resetKey="b"><div>ok</div></PreviewErrorBoundary>);
      expect(screen.queryByText(/Preview crashed/i)).toBeNull();
      expect(screen.getByText("ok")).toBeTruthy();
    } finally {
      console.error = original;
    }
  });
});
