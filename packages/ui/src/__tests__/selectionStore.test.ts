import { describe, expect, it, beforeEach } from "vitest";
import { useSelectionStore } from "../store/selection.js";
import { useMainPaneStore } from "../store/mainPane.js";

beforeEach(() => {
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  useMainPaneStore.setState({ tab: "preview" });
});

describe("selection store", () => {
  it("defaults to no selection", () => {
    expect(useSelectionStore.getState().surfaceId).toBeUndefined();
    expect(useSelectionStore.getState().componentId).toBeUndefined();
  });

  it("selectSurface sets surface and clears component", () => {
    useSelectionStore.getState().selectComponent("main", "btn");
    useSelectionStore.getState().selectSurface("other");
    expect(useSelectionStore.getState().surfaceId).toBe("other");
    expect(useSelectionStore.getState().componentId).toBeUndefined();
  });

  it("selectComponent sets both", () => {
    useSelectionStore.getState().selectComponent("main", "root");
    expect(useSelectionStore.getState().surfaceId).toBe("main");
    expect(useSelectionStore.getState().componentId).toBe("root");
  });
});

describe("main pane store", () => {
  it("defaults to preview", () => {
    expect(useMainPaneStore.getState().tab).toBe("preview");
  });

  it("setTab switches", () => {
    useMainPaneStore.getState().setTab("tree");
    expect(useMainPaneStore.getState().tab).toBe("tree");
  });
});
