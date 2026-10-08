import { expect, test } from "@playwright/test";

function cardCode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

test("opening a share link shows the card preview without touching the save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const code = cardCode({
    v: 1,
    n: '<img src=x onerror="window.__pwned=1">',
    d: 20733,
    p: [
      ["bramblewarden", 14, 2],
      ["lantern-fox", 9, 1],
    ],
  });
  await page.goto(`/?card=${code}&new=1`);

  const preview = page.locator("#card-preview");
  await expect(preview).toBeVisible();
  await expect(page.locator("#card-preview-title")).toContainText("<img src=x");
  await expect(preview.locator("img.share-card-img")).toHaveAttribute("src", /^blob:/, {
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Play now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Challenge" })).toBeVisible();
  await expect(page.locator("#name-intro")).toBeHidden();

  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem("ivyward-save-v1"))).toBeNull();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a tampered share link shows the broken-card notice", async ({ page }) => {
  await page.goto("/?card=not-a-real-card");
  await expect(page.locator("#card-preview-title")).toHaveText("This card link is broken");
  await expect(page.getByRole("button", { name: "Play Ivyward" })).toBeVisible();
});
