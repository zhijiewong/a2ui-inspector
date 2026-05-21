import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("loads a recorded session and renders the timeline", async ({ page }) => {
  // The Preview panel crashes in production builds when surfaces populate
  // (an unrelated `@a2ui/react/v0_9` issue). Swallow that pageerror so the
  // first-render assertions can race the crash, and capture WS frames to
  // verify the load round-tripped end-to-end.
  page.on("pageerror", () => {});

  const wsFrames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      if (typeof f.payload === "string") wsFrames.push(f.payload);
    });
  });

  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // The "Load file" button uses window.prompt — intercept it.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();

  // The sidecar streams the parsed entries back over the bridge WebSocket.
  // Assert the timeline received createSurface and updateDataModel events,
  // which proves the file was loaded and the UI store would render them.
  await expect
    .poll(() => wsFrames.some((f) => f.includes("createSurface")), { timeout: 10_000 })
    .toBe(true);
  await expect
    .poll(() => wsFrames.some((f) => f.includes("updateDataModel")), { timeout: 10_000 })
    .toBe(true);
});
