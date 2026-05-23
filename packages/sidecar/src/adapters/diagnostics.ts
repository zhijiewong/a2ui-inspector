import { A2UIMessageSchema, type A2UIMessage } from "@a2ui-inspector/shared";
import type { SessionStore } from "../session/store.js";
import type { UpstreamStatus } from "./types.js";

const RAW_LIMIT = 1024;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Wraps an `onStatus` callback so every status change ALSO appends a transport
 * diagnostic to the store. Only `closed` and `error` statuses produce diagnostics —
 * `connecting` and `connected` are status, not errors, and would be noise in the
 * errors panel.
 */
export function makeStatusEmitter(
  store: SessionStore,
  onStatus: (s: UpstreamStatus) => void,
): (s: UpstreamStatus) => void {
  return (s) => {
    onStatus(s);
    if (s.status !== "closed" && s.status !== "error") return;
    store.appendDiagnostic({
      ts: Date.now(),
      category: "transport",
      severity: s.status === "error" ? "error" : "warn",
      code: `upstream-${s.status}`,
      message: s.detail ? `upstream-${s.status}: ${s.detail}` : `upstream-${s.status}`,
    });
  };
}

/**
 * Parses one raw inbound payload from an upstream adapter. Appends a
 * `schema/inbound-parse-failed` diagnostic to the store on any failure
 * (JSON parse or zod safeParse). Returns the validated message, or null
 * if the payload was rejected (caller should skip processing).
 */
export function parseInboundPayload(
  store: SessionStore,
  raw: string,
): A2UIMessage | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (err) {
    store.appendDiagnostic({
      ts: Date.now(),
      category: "schema",
      severity: "error",
      code: "inbound-parse-failed",
      message: `JSON parse failed: ${errorMessage(err)}`,
      detail: { raw: raw.slice(0, RAW_LIMIT) },
    });
    return null;
  }
  const result = A2UIMessageSchema.safeParse(parsed);
  if (result.success) return result.data;
  store.appendDiagnostic({
    ts: Date.now(),
    category: "schema",
    severity: "error",
    code: "inbound-parse-failed",
    message: result.error.issues.map((i) => i.message).join("; "),
    detail: { raw: raw.slice(0, RAW_LIMIT), issues: result.error.issues },
  });
  return null;
}
