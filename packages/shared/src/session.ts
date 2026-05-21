import { z } from "zod";
import { A2UIActionSchema, A2UIMessageSchema } from "./a2ui.js";

export const SessionEntrySchema = z
  .object({
    tick: z.number().int().nonnegative(),
    ts: z.number().finite().nonnegative(),
    direction: z.enum(["agent->client", "client->agent"]),
    message: A2UIMessageSchema.optional(),
    action: A2UIActionSchema.optional(),
  })
  .refine(
    (e) => (e.message ? 1 : 0) + (e.action ? 1 : 0) === 1,
    { message: "exactly one of message or action must be present" }
  );

export type SessionEntry = z.infer<typeof SessionEntrySchema>;
