import type { FC } from "react";

/** A pluggable Preview renderer. `surface` is the opaque @a2ui/web_core surface model. */
export interface PreviewRenderer {
  id: string;
  label: string;
  Surface: FC<{ surfaceId: string; surface: unknown }>;
}
