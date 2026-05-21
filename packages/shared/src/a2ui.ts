import { z } from "zod";

const CreateSurface = z.object({
  surfaceId: z.string(),
  catalogId: z.string().optional(),
  sendDataModel: z.boolean().optional(),
});

const ComponentRef = z.object({
  id: z.string(),
  component: z.union([z.string(), z.record(z.unknown())]),
  children: z.array(z.string()).optional(),
}).passthrough();

const UpdateComponents = z.object({
  surfaceId: z.string(),
  components: z.array(ComponentRef),
});

const UpdateDataModel = z.object({
  surfaceId: z.string(),
  path: z.string().optional(),
  value: z.unknown(),
}).passthrough();

const DeleteSurface = z.object({
  surfaceId: z.string(),
});

export const A2UIMessageSchema = z.object({
  version: z.literal("v0.9"),
}).and(
  z.union([
    z.object({ createSurface: CreateSurface }),
    z.object({ updateComponents: UpdateComponents }),
    z.object({ updateDataModel: UpdateDataModel }),
    z.object({ deleteSurface: DeleteSurface }),
  ])
);

export type A2UIMessage = z.infer<typeof A2UIMessageSchema>;

export const A2UIActionSchema = z.object({
  surfaceId: z.string(),
  componentId: z.string(),
  kind: z.string(),
  payload: z.unknown().optional(),
});

export type A2UIAction = z.infer<typeof A2UIActionSchema>;
