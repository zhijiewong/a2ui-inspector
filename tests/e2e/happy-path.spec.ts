import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("loads a recorded session and renders the timeline + preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();

  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/updateDataModel/)).toBeVisible();

  await expect(page.getByText("Hello world")).toBeVisible({ timeout: 5000 });
});
