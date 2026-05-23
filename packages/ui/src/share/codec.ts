import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";
import type { Bookmark } from "../store/bookmarks.js";

/** Maximum size, in bytes, of the encoded fragment. Larger sessions fall back to file export. */
export const MAX_FRAGMENT_BYTES = 256 * 1024;

/** Thrown by decodeSession when a fragment is malformed, corrupt, or schema-invalid. */
export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

export type EncodeResult =
  | { ok: true; fragment: string }
  | { ok: false; reason: "too-large"; bytes: number };

export interface DecodedSession {
  entries: SessionEntry[];
  bookmarks: Bookmark[];
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new ShareDecodeError("fragment is not valid base64url");
  }
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new ShareDecodeError("fragment is not valid base64url");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pumpThrough(
  input: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer
    .write(input)
    .then(() => writer.close())
    .catch(() => {
      /* surfaced via the readable side below */
    });
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
}

async function gzip(text: string): Promise<Uint8Array> {
  return pumpThrough(new TextEncoder().encode(text), new CompressionStream("gzip"));
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new TextDecoder().decode(await pumpThrough(bytes, new DecompressionStream("gzip")));
}

/** Test-only helper: gzip+base64url arbitrary text through the real pipeline. */
export async function _gzipToFragment(text: string): Promise<string> {
  return bytesToBase64url(await gzip(text));
}

function isBookmarkLine(parsed: unknown): parsed is { bookmark: unknown } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "bookmark" in parsed &&
    Object.keys(parsed as object).length === 1
  );
}

function parseBookmark(raw: unknown): Bookmark {
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { tick?: unknown }).tick === "number" &&
    Number.isFinite((raw as { tick: number }).tick) &&
    typeof (raw as { note?: unknown }).note === "string"
  ) {
    const r = raw as { tick: number; note: string };
    return { tick: r.tick, note: r.note };
  }
  throw new ShareDecodeError("fragment contains a malformed bookmark");
}

/**
 * Encode a session (and optional bookmarks) into a URL-fragment-safe string.
 * Bookmarks are interleaved as `{ bookmark: ... }` lines in the JSONL stream.
 */
export async function encodeSession(
  entries: SessionEntry[],
  bookmarks: Bookmark[] = [],
  maxBytes: number = MAX_FRAGMENT_BYTES,
): Promise<EncodeResult> {
  const entryLines = entries.map((e) => JSON.stringify(e));
  const bookmarkLines = bookmarks.map((b) => JSON.stringify({ bookmark: b }));
  const jsonl = [...entryLines, ...bookmarkLines].join("\n");
  const fragment = bytesToBase64url(await gzip(jsonl));
  if (fragment.length > maxBytes) {
    return { ok: false, reason: "too-large", bytes: fragment.length };
  }
  return { ok: true, fragment };
}

/**
 * Decode a `#share=` fragment back into `{ entries, bookmarks }`. Backwards-
 * compatible with the pre-bookmarks codec: a fragment with no bookmark lines
 * decodes with `bookmarks: []`.
 */
export async function decodeSession(fragment: string): Promise<DecodedSession> {
  const bytes = base64urlToBytes(fragment);
  let jsonl: string;
  try {
    jsonl = await gunzip(bytes);
  } catch {
    throw new ShareDecodeError("fragment is not valid gzip data");
  }
  const entries: SessionEntry[] = [];
  const bookmarks: Bookmark[] = [];
  for (const raw of jsonl.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ShareDecodeError("fragment contains a malformed JSON line");
    }
    if (isBookmarkLine(parsed)) {
      bookmarks.push(parseBookmark(parsed.bookmark));
      continue;
    }
    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new ShareDecodeError("fragment contains a non-conforming session entry");
    }
    entries.push(result.data);
  }
  return { entries, bookmarks };
}
