import { expect, test, type Page } from "@playwright/test";

/**
 * Eclipse Trials (#420), end to end on the dev server: a post-finale save
 * walks onto the Eclipse Gate, plays five rounds through the trial screens
 * (real input for the first move; rounds are then settled through the dev
 * handle on the live BattleScene), picks boons, and shares the result. Also:
 * reload mid-trial and a `?trial=` link both leave the save untouched.
 */

type Scenes = { isActive(key: string): boolean; getScene(key: string): unknown };
type Win = Window & { __game?: { scene: Scenes } };
const SAVE_KEY = "ivyward-save-v1";
const SHOTS = process.env.TRIAL_SHOTS ?? "";

const active = (page: Page, key: string): Promise<boolean> =>
  page.evaluate((k) => Boolean((window as Win).__game?.scene.isActive(k)), key);

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
}

/** New save, finale done, three Lv 12 companions; persisted. */
async function seedPostFinale(page: Page): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Finn");
  await page.locator("#name-intro-submit").click();
  await expect.poll(() => active(page, "IsometricScene"), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const party = await import("/src/game/creatures/party.ts");
    party.playerParty.creatures.length = 0;
    party.playerParty.activeInstanceIds = [];
    // Named companions: no "give it a nickname" prompt over the shrine.
    party.addToParty("bramblewarden", 12).nickname = "Bramble";
    party.addToParty("hearthflame", 12).nickname = "Ember";
    party.addToParty("brook-nymph", 12).nickname = "Rill";
    const quests = await import("/src/game/story/questProgress.ts");
    const { QUEST_ORDER } = await import("/src/game/story/quests.ts");
    const progress = quests.createEmptyQuestProgress();
    for (const id of QUEST_ORDER) {
      progress[id] = "complete";
    }
    quests.restoreQuestProgress(progress);
    const { worldState } = await import("/src/game/world/worldState.ts");
    worldState.storyFinaleCardShown = true;
    const save = await import("/src/game/world/worldSave.ts");
    save.persistHostSave();
    // A real post-finale save has no opening caption or naming prompt up.
    (await import("/src/game/ui/nicknamePrompt.ts")).dismissAmbientNicknamePrompt();
    (await import("/src/game/opening/openingCaption.ts")).hideOpeningCaption();
  });
}

/** Stand next to the Eclipse Gate in the Moon Shrine. */
async function walkToGate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as {
      playerGridX: number;
      playerGridY: number;
      loadZone(zone: string): void;
      syncPlayerToGrid(): void;
    };
    iso.playerGridX = 5;
    iso.playerGridY = 3;
    iso.loadZone("shrine");
    iso.syncPlayerToGrid();
  });
  await page.waitForTimeout(600);
}

type Battle = {
  wild: { currentHp: number };
  player: { currentHp: number; moves: unknown[] };
  waitingForPlayer: boolean;
  refreshHp(): void;
  endBattle(won: boolean): void;
};

/** Settle the live trial battle through the dev handle, then Continue the result card. */
async function settleRound(page: Page, won: boolean): Promise<void> {
  await expect.poll(() => active(page, "BattleScene"), { timeout: 25_000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(() => ((window as Win).__game!.scene.getScene("BattleScene") as Battle).waitingForPlayer), {
      timeout: 15_000,
    })
    .toBe(true);
  await page.evaluate((w) => {
    const battle = (window as Win).__game!.scene.getScene("BattleScene") as Battle;
    if (w) {
      battle.wild.currentHp = 0;
    } else {
      battle.player.currentHp = 0;
    }
    battle.refreshHp();
    battle.endBattle(w);
  }, won);
  await expect
    .poll(
      async () => {
        if (await active(page, "BattleScene")) {
          await page.keyboard.press("Enter");
        }
        return active(page, "BattleScene");
      },
      { timeout: 20_000, intervals: [500] },
    )
    .toBe(false);
}

test("a full Eclipse Trial through the gate, boons and the share card", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedPostFinale(page);
  await walkToGate(page);
  await expect(page.locator("canvas")).toBeVisible();
  await shot(page, "01-gate");
  await page.keyboard.press("e");

  const overlay = page.locator("#trial-overlay");
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#trial-title")).toHaveText("ROUND 1");
  await expect(overlay.locator(".trial-mod").first()).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "02-round-banner");

  // Round 1: a real move from the keyboard, then settle.
  await page.keyboard.press("Enter");
  await expect.poll(() => active(page, "BattleScene"), { timeout: 15_000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(() => ((window as Win).__game!.scene.getScene("BattleScene") as Battle).waitingForPlayer), {
      timeout: 15_000,
    })
    .toBe(true);
  await page.keyboard.press("1");
  await page.waitForTimeout(2500);
  await shot(page, "03-battle-strip");
  await settleRound(page, true);

  for (let round = 2; round <= 5; round += 1) {
    // Boon screen: three cards, keyboard 1-3.
    await expect(overlay.locator(".trial-boon")).toHaveCount(3, { timeout: 15_000 });
    if (round === 2) {
      await page.waitForTimeout(500);
      await shot(page, "04-boons");
    }
    await page.keyboard.press(round === 3 ? "4" : "1");
    await expect(page.locator("#trial-title")).toHaveText(round === 5 ? "THE ECLIPSE SHADE" : `ROUND ${round}`);
    if (round === 5) {
      await page.waitForTimeout(500);
      await shot(page, "05-boss-preview");
    }
    await page.getByRole("button", { name: "Begin round" }).click();
    if (round === 5) {
      await expect.poll(() => active(page, "BattleScene"), { timeout: 25_000 }).toBe(true);
      await page.waitForTimeout(3500);
      await shot(page, "06-boss");
    }
    await settleRound(page, true);
  }

  await expect(page.locator(".trial-result-title")).toHaveText(/Eclipse/, { timeout: 15_000 });
  await expect(overlay.locator("img.trial-card-img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  await shot(page, "07-results");
  // The share sheet paints the 1080x1350 PNG.
  await page.getByRole("button", { name: "Share result" }).click();
  const sheet = page.locator("#share-overlay");
  await expect(sheet.locator("img.share-card-img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  const png = await sheet.locator("img.share-card-img").evaluate(async (img: HTMLImageElement) => {
    const blob = await (await fetch(img.src)).blob();
    const bitmap = await createImageBitmap(blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return { w: bitmap.width, h: bitmap.height, b64: btoa(bin) };
  });
  expect(png).toMatchObject({ w: 1080, h: 1350 });
  if (SHOTS) {
    const fs = await import("node:fs");
    fs.writeFileSync(`${SHOTS}/08-share-card.png`, Buffer.from(png.b64, "base64"));
  }
  await shot(page, "08-share-sheet");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => active(page, "IsometricScene"), { timeout: 10_000 }).toBe(true);
  await expect(overlay).toHaveCount(0);

  // The run is recorded and paid once; the party came back exactly.
  await page.waitForTimeout(2500);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), SAVE_KEY);
  expect(Object.values(saved.eclipseTrials?.best ?? {})[0]).toBeGreaterThan(6000);
  expect(saved.materials["folklore-dust"] ?? 0).toBeGreaterThanOrEqual(7);
  expect(saved.party.map((c: { level: number }) => c.level)).toEqual([12, 12, 12]);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("reloading mid-trial restores the pre-trial save with no rewards", async ({ page }) => {
  test.setTimeout(90_000);
  await seedPostFinale(page);
  await walkToGate(page);
  await page.keyboard.press("e");
  await expect(page.locator("#trial-overlay")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const before = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  await page.keyboard.press("Enter");
  await settleRound(page, true);
  await expect(page.locator(".trial-boon")).toHaveCount(3, { timeout: 15_000 });
  // Mid-trial changes (HP, a boon) and a pagehide flush must not reach the save.
  await page.keyboard.press("1");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.reload();
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(before);
  expect(JSON.parse(before ?? "{}").eclipseTrials).toBeUndefined();
});

test("a ?trial= link runs as practice and never touches an existing save", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedPostFinale(page);
  await page.waitForTimeout(2500);
  const before = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  const day = new Date().toISOString().slice(0, 10);
  const by = Buffer.from(
    JSON.stringify({ v: 1, n: '<img src=x onerror="window.__pwned=1">', s: 6420, r: 5, t: 4, p: ["mossling", "ember-wisp"] }),
  ).toString("base64url");
  await page.goto(`/?trial=${day}&by=${by}&new=1`);
  const preview = page.locator("#card-preview");
  await expect(preview).toBeVisible();
  await expect(page.locator("#card-preview-title")).toContainText("<img src=x");
  await expect(preview.locator("img.share-card-img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await shot(page, "09-link-preview");
  await page.getByRole("button", { name: "Try it" }).click();
  await expect(page.locator("#trial-overlay")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".trial-kicker")).toContainText("practice");
  await page.keyboard.press("Enter");
  await settleRound(page, true);
  await expect(page.locator(".trial-boon")).toHaveCount(3, { timeout: 15_000 });
  await page.keyboard.press("2");
  await page.getByRole("button", { name: "Begin round" }).click();
  await settleRound(page, false);
  await expect(page.locator(".trial-result-title")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(preview).toBeVisible();
  // Wipe paths are no-ops inside the sandbox too.
  await page.evaluate(async () => {
    const save = await import("/src/game/world/worldSave.ts");
    save.clearHostSave();
    save.persistHostSave();
  });
  await page.waitForTimeout(2500);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(before);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(errors, errors.join("\n")).toEqual([]);

  await page.goto("/?trial=2026-02-31");
  await expect(page.locator("#card-preview-title")).toHaveText("This trial link is broken");
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(before);
});

for (const size of [
  { width: 390, height: 844, name: "phone" },
  { width: 844, height: 390, name: "landscape" },
  { width: 320, height: 568, name: "small" },
  { width: 1280, height: 800, name: "desktop" },
]) {
  test(`trial screens fit ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await seedPostFinale(page);
    await walkToGate(page);
    await page.keyboard.press("e");
    const overlay = page.locator("#trial-overlay");
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(700);
    await shot(page, `10-${size.name}-preview`);
    const begin = page.getByRole("button", { name: "Begin round" });
    await begin.scrollIntoViewIfNeeded();
    const box = await begin.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // No horizontal scroll from the sheet.
    expect(await overlay.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await begin.click();
    await expect.poll(() => active(page, "BattleScene"), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(2500);
    await shot(page, `11-${size.name}-battle`);
    await settleRound(page, true);
    const cards = overlay.locator(".trial-boon");
    await expect(cards).toHaveCount(3, { timeout: 15_000 });
    await page.waitForTimeout(600);
    await shot(page, `12-${size.name}-boons`);
    for (let i = 0; i < 3; i += 1) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const b = await card.boundingBox();
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await overlay.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
}
