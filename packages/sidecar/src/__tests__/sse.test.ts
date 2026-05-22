import { describe, expect, it } from "vitest";
import { SseDecoder } from "../adapters/sse.js";

describe("SseDecoder", () => {
  it("emits the data payload of a complete event", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it("buffers an event split across two chunks", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a"')).toEqual([]);
    expect(d.push(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it("emits multiple events from one chunk", () => {
    const d = new SseDecoder();
    expect(d.push("data: one\n\ndata: two\n\n")).toEqual(["one", "two"]);
  });

  it("joins multi-line data fields with newlines", () => {
    const d = new SseDecoder();
    expect(d.push("data: line1\ndata: line2\n\n")).toEqual(["line1\nline2"]);
  });

  it("ignores comment lines and non-data fields", () => {
    const d = new SseDecoder();
    expect(d.push(": keep-alive\nevent: update\ndata: payload\n\n")).toEqual(["payload"]);
  });

  it("normalizes CRLF line endings", () => {
    const d = new SseDecoder();
    expect(d.push("data: x\r\n\r\n")).toEqual(["x"]);
  });

  it("skips events that have no data field", () => {
    const d = new SseDecoder();
    expect(d.push(": just a comment\n\n")).toEqual([]);
  });
});
