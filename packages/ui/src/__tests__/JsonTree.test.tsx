import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonTree } from "../components/JsonTree.js";

describe("JsonTree", () => {
  it("renders primitive values", () => {
    render(<JsonTree value={{ title: "Hello", count: 3, ok: true }} />);
    expect(screen.getByText(/"Hello"/)).toBeTruthy();
    expect(screen.getByText(/^3$/)).toBeTruthy();
    expect(screen.getByText(/true/)).toBeTruthy();
  });

  it("renders nested object keys", () => {
    render(<JsonTree value={{ user: { name: "Yvon" } }} />);
    expect(screen.getByText(/user/)).toBeTruthy();
    expect(screen.getByText(/name/)).toBeTruthy();
  });

  it("highlights changed paths passed via changedPaths", () => {
    render(<JsonTree value={{ a: 1, b: 2 }} changedPaths={new Set(["/b"])} />);
    const changed = screen.getByTestId("json-leaf-/b");
    expect(changed.className).toMatch(/emerald/);
  });
});
