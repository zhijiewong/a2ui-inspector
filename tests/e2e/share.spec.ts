import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE = resolve(process.cwd(), "examples/recordings/restaurant-finder-happy-path.jsonl");

test("share a loaded session and reopen it from the link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // Load the fixture session.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });

  // Open the Share dialog and read the generated link.
  await page.getByRole("button", { name: /Share/ }).click();
  const linkField = page.getByLabel(/share link/i);
  await expect(linkField).toBeVisible({ timeout: 5000 });
  const link = await linkField.inputValue();
  expect(link).toContain("#share=");

  // Open the share link in a fresh navigation. Navigate away first so that
  // goto(link) is a full document load (a hash-only change would not reboot
  // the app and re-run its #share= decode effect).
  await page.goto("about:blank");
  await page.goto(link);
  await expect(page.getByText(/Viewing a shared session/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByTestId("preview-pane").getByText("Hello world"),
  ).toBeVisible({ timeout: 5000 });
});

test("a corrupt share link shows an error and falls through to normal startup", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("/#share=this-is-not-a-valid-fragment");
  // The corrupt-link error strip is shown.
  await expect(page.getByText(/corrupt or invalid/i)).toBeVisible({ timeout: 5000 });
  // Normal startup still happened — the app is usable, not stuck in shared view.
  await expect(page.getByText("A2UI Inspector")).toBeVisible();
  await expect(page.getByText(/Viewing a shared session/)).toHaveCount(0);
});

test("a bookmarked tick + note survives share round-trip", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A2UI Inspector")).toBeVisible();

  // Load the fixture session.
  page.once("dialog", (d) => d.accept(FIXTURE));
  await page.getByRole("button", { name: /Load file/ }).click();
  await expect(page.getByText(/createSurface/)).toBeVisible({ timeout: 5000 });

  // Bookmark tick 0 via its star button.
  await page.getByRole("button", { name: /Bookmark tick 0/ }).click();

  // Shift-click the same star to open the editor.
  await page.getByRole("button", { name: /Bookmark tick 0/ }).click({ modifiers: ["Shift"] });
  const noteField = page.getByLabel(/bookmark note/i);
  await expect(noteField).toBeVisible({ timeout: 5000 });
  await noteField.fill("broke here");
  // Scope Save to the popover dialog to avoid the toolbar's Save.
  await page.getByRole("dialog").getByRole("button", { name: /^Save$/ }).click();

  // Note text renders under the bookmarked row.
  await expect(page.getByText("broke here")).toBeVisible();

  // Generate a share link.
  await page.getByRole("button", { name: /Share/ }).click();
  const linkField = page.getByLabel(/share link/i);
  await expect(linkField).toBeVisible({ timeout: 5000 });
  const link = await linkField.inputValue();
  expect(link).toContain("#share=");

  // Open the link in a fresh document (hash-only nav doesn't re-mount).
  await page.goto("about:blank");
  await page.goto(link);

  // Banner + bookmark + note all survived.
  await expect(page.getByText(/Viewing a shared session/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("broke here")).toBeVisible({ timeout: 5000 });
});
