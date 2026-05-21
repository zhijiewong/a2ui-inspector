import { describe, expect, it } from "vitest";
import { A2UIMessageSchema } from "../a2ui.js";

describe("A2UIMessageSchema", () => {
  it("parses createSurface v0.9", () => {
    const msg = {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json" }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses updateComponents v0.9", () => {
    const msg = {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Column", children: ["a", "b"] }]
      }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses updateDataModel v0.9", () => {
    const msg = {
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/", value: { title: "x" } }
    };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("parses deleteSurface v0.9", () => {
    const msg = { version: "v0.9", deleteSurface: { surfaceId: "main" } };
    expect(() => A2UIMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejects unknown version", () => {
    expect(() => A2UIMessageSchema.parse({ version: "v0.7", createSurface: { surfaceId: "x" } })).toThrow();
  });

  it("rejects missing surfaceId", () => {
    expect(() => A2UIMessageSchema.parse({ version: "v0.9", createSurface: {} })).toThrow();
  });
});
