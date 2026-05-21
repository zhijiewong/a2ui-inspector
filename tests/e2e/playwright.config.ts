import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const repoRoot = resolve(__dirname, "../..");

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8765",
    headless: true,
  },
  webServer: [
    {
      command:
        "pnpm --filter @a2ui-inspector/ui build && pnpm --filter a2ui-inspector build && node packages/sidecar/dist/bin.js",
      cwd: repoRoot,
      port: 8765,
      env: { A2UI_INSPECTOR_HOST: "127.0.0.1", A2UI_INSPECTOR_PORT: "8765" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
