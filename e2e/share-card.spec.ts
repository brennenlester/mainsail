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

test("an existing save stays byte-identical through card preview, Challenge, and New Game attempts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // Real host save first.
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Keeper");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("ivyward-save-v1")), { timeout: 10_000 })
    .not.toBeNull();
  await page.waitForTimeout(2500); // let debounced saves settle
  const before = await page.evaluate(() => localStorage.getItem("ivyward-save-v1"));

  const code = cardCode({ v: 2, n: "Rival", d: 20733, p: [["mossling", 3, 0, 2]] });
  await page.goto(`/?card=${code}&new=1`);
  await expect(page.locator("#card-preview")).toBeVisible();
  await expect(page.locator("#card-preview img.share-card-img")).toHaveAttribute("src", /^blob:/, {
    timeout: 20_000,
  });
  // Card links skip the title entirely, so its New Game can never be reached.
  // (Enter would activate the focused Play now button, so only poke the title key.)
  await page.keyboard.press("x");
  await page.waitForTimeout(1500);
  await expect(page.locator("#title-menu")).toHaveCount(0);

  await page.getByRole("button", { name: "Challenge" }).click();
  await expect(page.locator("#share-banner")).toContainText("Rival's ghost party", { timeout: 10_000 });
  await expect(page.locator("#title-new-game")).toHaveCount(0);

  // Even calling the wipe paths directly is a no-op inside the sandbox.
  await page.evaluate(async () => {
    const save = await import("/src/game/world/worldSave.ts");
    save.clearHostSave();
    save.resetHostGame();
  });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => localStorage.getItem("ivyward-save-v1"))).toBe(before);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a tampered share link shows the broken-card notice", async ({ page }) => {
  await page.goto("/?card=not-a-real-card");
  await expect(page.locator("#card-preview-title")).toHaveText("This card link is broken");
  await expect(page.getByRole("button", { name: "Play Ivyward" })).toBeVisible();
});
