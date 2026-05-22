import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@a2ui-inspector/shared";
import { encodeSession, decodeSession, ShareDecodeError, MAX_FRAGMENT_BYTES } from "../codec.js";

const entry = (tick: number): SessionEntry => ({
  tick,
  ts: 1000 + tick,
  direction: "agent->client",
  message: { version: "v0.9", createSurface: { surfaceId: `s${tick}` } } as never,
});

describe("session codec", () => {
  it("round-trips a session: encode then decode preserves entries", async () => {
    const entries = [entry(0), entry(1), entry(2)];
    const res = await encodeSession(entries);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const decoded = await decodeSession(res.fragment);
    expect(decoded).toEqual(entries);
  });

  it("round-trips an empty session", async () => {
    const res = await encodeSession([]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await decodeSession(res.fragment)).toEqual([]);
  });

  it("returns too-large when the encoded blob exceeds the cap", async () => {
    const res = await encodeSession([entry(0)], 1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("too-large");
    expect(res.bytes).toBeGreaterThan(1);
  });

  it("exports a 256 KiB default cap", () => {
    expect(MAX_FRAGMENT_BYTES).toBe(256 * 1024);
  });

  it("throws ShareDecodeError on a non-base64url fragment", async () => {
    await expect(decodeSession("!!!not base64!!!")).rejects.toBeInstanceOf(ShareDecodeError);
  });

  it("throws ShareDecodeError on base64url that is not gzip", async () => {
    await expect(decodeSession("aGVsbG8")).rejects.toBeInstanceOf(ShareDecodeError);
  });

  it("throws ShareDecodeError when a decoded line is not a valid SessionEntry", async () => {
    const { _gzipToFragment } = await import("../codec.js");
    const badFragment = await _gzipToFragment(JSON.stringify({ tick: 0 }) + "\n");
    await expect(decodeSession(badFragment)).rejects.toBeInstanceOf(ShareDecodeError);
  });
});
