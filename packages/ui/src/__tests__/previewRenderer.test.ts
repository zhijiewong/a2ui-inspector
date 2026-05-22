import { describe, expect, it, beforeEach } from "vitest";
import { usePreviewRendererStore } from "../store/previewRenderer.js";
import { PREVIEW_RENDERERS, getRenderer } from "../renderers/index.js";

beforeEach(() => usePreviewRendererStore.setState({ rendererId: "react" }));

describe("preview renderer store", () => {
  it("defaults to the react renderer", () => {
    expect(usePreviewRendererStore.getState().rendererId).toBe("react");
  });

  it("setRendererId changes the selection", () => {
    usePreviewRendererStore.getState().setRendererId("json");
    expect(usePreviewRendererStore.getState().rendererId).toBe("json");
  });
});

describe("renderer registry", () => {
  it("ships a react and a json renderer", () => {
    const ids = PREVIEW_RENDERERS.map((r) => r.id);
    expect(ids).toContain("react");
    expect(ids).toContain("json");
  });

  it("every renderer has an id, a label, and a Surface component", () => {
    for (const r of PREVIEW_RENDERERS) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.label).toBe("string");
      expect(typeof r.Surface).toBe("function");
    }
  });

  it("getRenderer returns the matching renderer, or the first as fallback", () => {
    expect(getRenderer("json").id).toBe("json");
    expect(getRenderer("does-not-exist").id).toBe(PREVIEW_RENDERERS[0]!.id);
  });
});
