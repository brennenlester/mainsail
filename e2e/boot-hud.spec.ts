import { expect, test, type Page } from "@playwright/test";

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** "Press any key" on the title; retries until TitleScene is listening. */
async function openTitleMenu(page: Page): Promise<void> {
  await expect(async () => {
    await page.keyboard.press("x");
    await expect(page.locator("#title-menu")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20_000 });
}

test("?new=1 skips the title into the name intro, then Inventory and Party", async ({
  page,
}) => {
  const errors = await collectPageErrors(page);

  await page.goto("/?new=1");
  await expect(page.locator("#name-intro")).toBeVisible();
  await expect(page.locator("#title-menu")).toHaveCount(0);

  await page.locator("#name-intro-input").fill("Playwright");
  await page.locator("#name-intro-submit").click();

  await expect(page.locator("#name-intro")).toBeHidden();
  await expect(page.locator("#status-panel")).toBeVisible();

  await page.locator("#inventory-btn").click();
  await expect(page.locator("#inventory-overlay")).toBeVisible();
  await expect(page.locator("#inventory-title")).toHaveText("Inventory");
  await page.locator("#inventory-close").click();
  await expect(page.locator("#inventory-overlay")).toBeHidden();

  await page.locator("#party-btn").click();
  await expect(page.locator("#party-overlay")).toBeVisible();
  await expect(page.locator("#party-title")).toHaveText("Party");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("cold boot: title shows New Game only, New Game runs the name intro", async ({
  page,
}) => {
  const errors = await collectPageErrors(page);

  await page.goto("/");
  await openTitleMenu(page);
  await expect(page.locator("#title-continue")).toHaveCount(0);
  await expect(page.locator("#title-new-game")).toBeFocused();
  await expect(page.locator("#status-panel")).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(page.locator("#name-intro")).toBeVisible();
  await page.locator("#name-intro-input").fill("Tess");
  await page.keyboard.press("Enter");
  await expect(page.locator("#name-intro")).toBeHidden();
  await expect(page.locator("#status-panel")).toBeVisible();
  await expect(page.locator("#opening-caption")).toHaveText(/humming/);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("returning player: Continue is default focus and resumes the save", async ({
  page,
}) => {
  const errors = await collectPageErrors(page);

  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Mira");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();

  await page.goto("/");
  await openTitleMenu(page);
  await expect(page.locator("#title-continue")).toBeFocused();
  await expect(page.locator("#title-continue")).toContainText("Mira");

  // New Game over a save asks first; Keep returns to the menu.
  await page.locator("#title-new-game").click();
  await expect(page.locator("#title-confirm-text")).toBeVisible();
  await expect(page.locator("#title-confirm-cancel")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#title-continue")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#status-panel")).toBeVisible();
  await expect(page.locator("#name-intro")).toBeHidden();

  expect(errors, errors.join("\n")).toEqual([]);
});
