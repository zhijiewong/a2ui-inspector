import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
  test: { environment: "jsdom", globals: false, setupFiles: ["./src/__tests__/setup.ts"] },
});
