import { reactRenderer } from "./reactRenderer.js";
import { jsonRenderer } from "./jsonRenderer.js";
import type { PreviewRenderer } from "./types.js";

export type { PreviewRenderer } from "./types.js";

export const PREVIEW_RENDERERS: PreviewRenderer[] = [reactRenderer, jsonRenderer];

/** Look up a renderer by id; falls back to the first registered renderer. */
export function getRenderer(id: string): PreviewRenderer {
  return PREVIEW_RENDERERS.find((r) => r.id === id) ?? PREVIEW_RENDERERS[0]!;
}
