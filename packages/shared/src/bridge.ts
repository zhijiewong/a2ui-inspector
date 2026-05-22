import { z } from "zod";
import { A2UIActionSchema, A2UIMessageSchema } from "./a2ui.js";

const UpstreamConfigSchema = z.discriminatedUnion("transport", [
  z.object({ transport: z.literal("websocket"), url: z.string().url() }),
  z.object({ transport: z.literal("sse"), url: z.string().url() }),
]);

export const CommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connectUpstream"), config: UpstreamConfigSchema }),
  z.object({ kind: z.literal("loadFile"), path: z.string() }),
  z.object({ kind: z.literal("saveSession"), path: z.string() }),
  z.object({ kind: z.literal("scrubTo"), tick: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("clear") }),
]);

export type Command = z.infer<typeof CommandSchema>;

const UpstreamStatus = z.enum(["connecting", "connected", "closed", "error"]);

export const EventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("messageReceived"),
    tick: z.number().int().nonnegative(),
    ts: z.number().finite().nonnegative(),
    message: A2UIMessageSchema,
  }),
  z.object({
    kind: z.literal("actionSent"),
    tick: z.number().int().nonnegative(),
    ts: z.number().finite().nonnegative(),
    action: A2UIActionSchema,
  }),
  z.object({
    kind: z.literal("upstreamStatus"),
    status: UpstreamStatus,
    detail: z.string().optional(),
  }),
  z.object({
    kind: z.literal("sessionLoaded"),
    tickCount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("diagnostic"),
    level: z.enum(["warn", "error"]),
    message: z.string(),
  }),
]);

export type Event = z.infer<typeof EventSchema>;
