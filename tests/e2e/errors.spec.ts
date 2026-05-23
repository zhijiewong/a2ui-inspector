import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/with-unknown-surface.jsonl");

test("unknown-surface fixture shows red dot, panel entry, and jump-to-tick works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // Load the bad fixture via the toolbar's Load File button (matches share.spec.ts pattern).
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();

  // Wait for the entry row to appear so we know loadEntries (and the protocol-derive seed) ran.
  await expect(page.getByTestId("timeline-row-0")).toBeVisible({ timeout: 5000 });

  // The Timeline row should now show the red diagnostic dot.
  await expect(
    page.getByTestId("timeline-row-0").locator('[data-testid="diagnostic-dot"]')
  ).toBeVisible();

  // The Errors tab should show a count badge.
  await expect(page.getByRole("button", { name: /Errors\s*\(1\)/ })).toBeVisible();

  // Click the Errors tab and verify the row is listed.
  await page.getByRole("button", { name: /Errors/ }).click();
  await expect(page.getByText("unknown-surface")).toBeVisible();

  // Click the row → timeline scrubber jumps. Use the row's aria-label "tick #0 unknown-surface".
  await page.getByRole("button", { name: /tick #0 unknown-surface/ }).click();

  // Verify focus moved to tick 0 by checking that the Timeline row now has the active emerald class.
  // The Timeline marks the active row with "border-emerald-400" — confirm via class string match.
  await expect(page.getByTestId("timeline-row-0")).toHaveClass(/border-emerald-400/);
});
