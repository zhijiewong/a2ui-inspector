import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ComponentTree } from "../panels/ComponentTree.js";
import { useSessionStore } from "../store/session.js";
import { useTimelineStore } from "../store/timeline.js";
import { useSelectionStore } from "../store/selection.js";

beforeEach(() => {
  useSessionStore.getState().reset();
  useTimelineStore.getState().setScrubTick("head");
  useSelectionStore.setState({ surfaceId: undefined, componentId: undefined });
  const ev = (tick: number, message: unknown) =>
    useSessionStore.getState().applyEvent({ kind: "messageReceived", tick, ts: tick, message: message as never });
  ev(0, { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "x" } });
  ev(1, { version: "v0.9", updateComponents: { surfaceId: "main", components: [
    { id: "root", component: "Column", children: ["title"] },
    { id: "title", component: "Text" },
  ] } });
  ev(2, { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { title: "Hi" } } });
});

describe("ComponentTree", () => {
  it("renders component ids and types for the active surface", () => {
    render(<ComponentTree />);
    expect(screen.getByText(/root/)).toBeTruthy();
    expect(screen.getByText(/Column/)).toBeTruthy();
    expect(screen.getByText(/title/)).toBeTruthy();
    expect(screen.getByText(/Text/)).toBeTruthy();
  });

  it("clicking a node selects it", () => {
    render(<ComponentTree />);
    fireEvent.click(screen.getByText(/root/));
    expect(useSelectionStore.getState().componentId).toBe("root");
  });

  it("shows the prop inspector for the selected node", () => {
    useSelectionStore.getState().selectComponent("main", "title");
    render(<ComponentTree />);
    expect(screen.getByText(/component: Text/)).toBeTruthy();
  });
});
