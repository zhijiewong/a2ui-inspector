import { A2uiSurface } from "@a2ui/react/v0_9";
import type { PreviewRenderer } from "./types.js";

export const reactRenderer: PreviewRenderer = {
  id: "react",
  label: "React renderer",
  Surface: ({ surface }) => <A2uiSurface surface={surface as never} />,
};
