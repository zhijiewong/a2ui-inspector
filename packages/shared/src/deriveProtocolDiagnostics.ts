import type { Diagnostic } from "./diagnostic.js";
import type { SessionEntry } from "./session.js";

const EXPECTED_VERSION = "v0.9";

/**
 * Pure function. Walks the entries and emits protocol-level diagnostics:
 *   - unknown-surface: updateComponents for a surface never createSurface'd by end-of-stream
 *   - version-mismatch: any entry whose message.version !== "v0.9"
 *   - derive-crashed: meta — single diagnostic if the walk itself throws
 *
 * Out-of-order create/update is allowed: only diagnostics that are still
 * unresolved at end-of-stream are emitted.
 *
 * Uses runtime introspection rather than typed access so a single malformed
 * entry cannot kill derivation of the whole session.
 */
export function deriveProtocolDiagnostics(entries: SessionEntry[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  try {
    const createdSurfaces = new Set<string>();
    interface PendingSurfaceUse { tick: number; ts: number; surfaceId: string }
    const pendingSurfaceUses: PendingSurfaceUse[] = [];

    for (const entry of entries) {
      const m = entry.message as Record<string, unknown>;
      if (typeof m !== "object") continue;
      // Intentionally do NOT guard against null here — a null message is a
      // protocol violation; let the property access throw so the try/catch
      // surfaces a single `derive-crashed` diagnostic for the session.

      if (typeof m.version === "string" && m.version !== EXPECTED_VERSION) {
        out.push({
          ts: entry.ts,
          tick: entry.tick,
          category: "protocol",
          severity: "warn",
          code: "version-mismatch",
          message: `protocol version "${m.version}" (expected "${EXPECTED_VERSION}")`,
        });
      }

      const create = m.createSurface as { surfaceId?: unknown } | undefined;
      if (create && typeof create.surfaceId === "string") {
        createdSurfaces.add(create.surfaceId);
      }

      const update = m.updateComponents as { surfaceId?: unknown } | undefined;
      if (update && typeof update.surfaceId === "string") {
        pendingSurfaceUses.push({ tick: entry.tick, ts: entry.ts, surfaceId: update.surfaceId });
      }
    }

    for (const use of pendingSurfaceUses) {
      if (!createdSurfaces.has(use.surfaceId)) {
        out.push({
          ts: use.ts,
          tick: use.tick,
          category: "protocol",
          severity: "error",
          code: "unknown-surface",
          message: `updateComponents references surface "${use.surfaceId}" which was never created`,
        });
      }
    }

    return out;
  } catch (err) {
    return [{
      ts: Date.now(),
      category: "protocol",
      severity: "error",
      code: "derive-crashed",
      message: `protocol-diagnostic walker crashed: ${err instanceof Error ? err.message : String(err)}`,
    }];
  }
}
