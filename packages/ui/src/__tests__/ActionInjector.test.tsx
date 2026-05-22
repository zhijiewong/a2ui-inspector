import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionInjector } from "../components/ActionInjector.js";

describe("ActionInjector", () => {
  it("calls onInject with the assembled action", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "btn" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "tap" } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).toHaveBeenCalledWith({ surfaceId: "main", componentId: "btn", kind: "tap" });
  });

  it("includes a parsed JSON payload when provided", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "field" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "textChange" } });
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: '{"text":"hi"}' } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).toHaveBeenCalledWith({
      surfaceId: "main", componentId: "field", kind: "textChange", payload: { text: "hi" },
    });
  });

  it("does not call onInject when surface or component is empty", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).not.toHaveBeenCalled();
  });

  it("shows an error and does not inject when the payload is invalid JSON", () => {
    const onInject = vi.fn();
    render(<ActionInjector onInject={onInject} />);
    fireEvent.change(screen.getByLabelText(/surface/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/component/i), { target: { value: "btn" } });
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: "tap" } });
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: "{bad" } });
    fireEvent.click(screen.getByRole("button", { name: /inject|fire/i }));
    expect(onInject).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid json/i)).toBeTruthy();
  });
});
