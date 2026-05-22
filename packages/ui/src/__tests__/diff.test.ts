import { describe, expect, it } from "vitest";
import { diffSurfaceViews } from "../replay/diff.js";
import type { SurfaceView } from "../replay/surfaceView.js";

function view(components: Array<[string, string]>, dataModel: unknown): SurfaceView {
  const map = new Map(
    components.map(([id, type]) => [id, { id, type, childIds: [], props: {} }])
  );
  return { surfaceId: "main", rootId: components[0]?.[0], components: map, dataModel };
}

describe("diffSurfaceViews", () => {
  it("detects added and removed components", () => {
    const prev = view([["root", "Column"]], {});
    const curr = view([["root", "Column"], ["title", "Text"]], {});
    const d = diffSurfaceViews(prev, curr);
    expect(d.addedComponents).toContain("title");
    expect(d.removedComponents).toEqual([]);
  });

  it("detects changed component types", () => {
    const prev = view([["x", "Text"]], {});
    const curr = view([["x", "Button"]], {});
    const d = diffSurfaceViews(prev, curr);
    expect(d.changedComponents).toContain("x");
  });

  it("detects changed data-model paths", () => {
    const prev = view([], { title: "a", keep: 1 });
    const curr = view([], { title: "b", keep: 1 });
    const d = diffSurfaceViews(prev, curr);
    expect(d.changedPaths.has("/title")).toBe(true);
    expect(d.changedPaths.has("/keep")).toBe(false);
  });

  it("treats an undefined prev as everything added", () => {
    const curr = view([["root", "Column"]], { a: 1 });
    const d = diffSurfaceViews(undefined, curr);
    expect(d.addedComponents).toContain("root");
    expect(d.changedPaths.has("/a")).toBe(true);
  });
});
