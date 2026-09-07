import { expect, test, type Page } from "@playwright/test";

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

test("fresh boot shows name intro, then Inventory and Party", async ({
  page,
}) => {
  const errors = await collectPageErrors(page);

  await page.goto("/?new=1");
  await expect(page.locator("#name-intro")).toBeVisible();

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
