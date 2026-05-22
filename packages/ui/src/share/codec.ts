import { SessionEntrySchema, type SessionEntry } from "@a2ui-inspector/shared";

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

/**
 * Pump `input` through a (de)compression transform stream and return the result.
 * Avoids `Blob.prototype.stream`, which jsdom does not implement.
 *
 * The writer-side promise is intentionally swallowed: when decompression fails
 * (corrupt input) both the writer and the readable side reject; the readable
 * rejection is what callers observe, so the writer rejection must not surface
 * as an unhandled rejection.
 */
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

/** Encode a session into a URL-fragment-safe string. Over `maxBytes` -> too-large. */
export async function encodeSession(
  entries: SessionEntry[],
  maxBytes: number = MAX_FRAGMENT_BYTES,
): Promise<EncodeResult> {
  const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
  const fragment = bytesToBase64url(await gzip(jsonl));
  if (fragment.length > maxBytes) {
    return { ok: false, reason: "too-large", bytes: fragment.length };
  }
  return { ok: true, fragment };
}

/** Decode a `#share=` fragment back into validated session entries. */
export async function decodeSession(fragment: string): Promise<SessionEntry[]> {
  const bytes = base64urlToBytes(fragment);
  let jsonl: string;
  try {
    jsonl = await gunzip(bytes);
  } catch {
    throw new ShareDecodeError("fragment is not valid gzip data");
  }
  const entries: SessionEntry[] = [];
  for (const raw of jsonl.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ShareDecodeError("fragment contains a malformed JSON line");
    }
    const result = SessionEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new ShareDecodeError("fragment contains a non-conforming session entry");
    }
    entries.push(result.data);
  }
  return entries;
}
