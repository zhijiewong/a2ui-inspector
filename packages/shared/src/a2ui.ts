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

export const A2UIMessageSchema = z
  .object({
    version: z.literal("v0.9"),
  })
  .and(
    z.union([
      z.object({ createSurface: CreateSurface }).passthrough(),
      z.object({ updateComponents: UpdateComponents }).passthrough(),
      z.object({ updateDataModel: UpdateDataModel }).passthrough(),
      z.object({ deleteSurface: DeleteSurface }).passthrough(),
    ])
  )
  .refine(
    (m) => {
      const keys = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const;
      return keys.filter((k) => k in m).length === 1;
    },
    { message: "A2UI message must contain exactly one of createSurface/updateComponents/updateDataModel/deleteSurface" }
  );

export type A2UIMessage = z.infer<typeof A2UIMessageSchema>;

export const A2UIActionSchema = z.object({
  surfaceId: z.string(),
  componentId: z.string(),
  kind: z.string(),
  payload: z.unknown().optional(),
});

export type A2UIAction = z.infer<typeof A2UIActionSchema>;
