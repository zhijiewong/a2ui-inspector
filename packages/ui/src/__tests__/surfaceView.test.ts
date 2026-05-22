import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { stateAtTick } from "../replay/processor.js";
import { toSurfaceView } from "../replay/surfaceView.js";

const e = (i: number, msg: unknown): SessionEntry => ({
  tick: i, ts: i, direction: "agent->client", message: msg as never,
});

const buildEntries = (): SessionEntry[] => [
  e(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } }),
  e(1, { version: "v0.9", updateComponents: { surfaceId: "main", components: [
    { id: "root", component: "Column", children: ["title"] },
    { id: "title", component: "Text" },
  ] } }),
  e(2, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hello" } } }),
];

describe("toSurfaceView", () => {
  it("exposes rootId, components map, and dataModel", () => {
    const { surfaces } = stateAtTick(buildEntries(), 2);
    const model = surfaces.get("main");
    expect(model).toBeDefined();
    const view = toSurfaceView("main", model);
    expect(view.surfaceId).toBe("main");
    expect(view.components.size).toBeGreaterThanOrEqual(2);
    expect(view.components.has("root")).toBe(true);
    expect(view.components.get("root")?.type).toBe("Column");
    expect(view.components.get("root")?.childIds).toContain("title");
    expect(view.dataModel).toEqual({ title: "Hello" });
  });

  it("returns an empty view for an undefined model", () => {
    const view = toSurfaceView("ghost", undefined);
    expect(view.surfaceId).toBe("ghost");
    expect(view.components.size).toBe(0);
    expect(view.rootId).toBeUndefined();
  });
});
