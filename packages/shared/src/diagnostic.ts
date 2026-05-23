import { z } from "zod";

/**
 * A failure or noteworthy event surfaced by the inspector.
 * - `ts`: epoch milliseconds (Date.now())
 * - `tick`: session tick index this diagnostic relates to, when applicable
 *   (omitted for events that happen outside any tick — e.g. transport
 *   connect attempts before the first message)
 * - `detail`: arbitrary JSON-serialisable payload; emitters MUST keep it
 *   serialisable since it travels over the bridge WS
 */
export const DiagnosticSchema = z.object({
  tick: z.number().int().nonnegative().optional(),
  ts: z.number().finite().nonnegative(),
  category: z.enum(["schema", "protocol", "transport", "render"]),
  severity: z.enum(["error", "warn"]),
  code: z.string(),
  message: z.string(),
  detail: z.unknown().optional(),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export type DiagnosticCategory = Diagnostic["category"];
export type DiagnosticSeverity = Diagnostic["severity"];
