import { expect, test, type Page } from "@playwright/test";

/**
 * Wow Pass bug sweep 2 (#409): cooldown feedback, ambient nickname prompt,
 * v3 card nicknames, challenge title, clean broken-card screen, move-card
 * titles, and the Inventory / Party panels.
 */
test.describe.configure({ timeout: 60_000 });

function toBase64Url(text: string): string {
  return Buffer.from(text).toString("base64url");
}

function cardCode(payload: unknown): string {
  return toBase64Url(JSON.stringify(payload));
}

async function newGame(page: Page, name = "Sweep"): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill(name);
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
}

async function waitForBattleTurn(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = (window as unknown as { __game?: { scene: { getScene(k: string): any } } }).__game;
          const scene = g?.scene.getScene("BattleScene");
          return Boolean(scene?.sys.isActive() && scene.waitingForPlayer && scene.moveCards?.length);
        }),
      { timeout: 25_000 },
    )
    .toBe(true);
}

async function startSpar(page: Page): Promise<void> {
  await newGame(page);
  await page.evaluate(async () => {
    const party = await import("/src/game/creatures/party.ts");
    party.addToParty("mossling", 6);
    const save = await import("/src/game/world/worldSaveSchedule.ts");
    save.notifyWorldChanged();
    save.flushPendingHostSave();
  });
  await page.goto("/?spar=mossling");
  await waitForBattleTurn(page);
}

const battle = (page: Page, fn: string) =>
  page.evaluate(`(() => { const s = window.__game.scene.getScene("BattleScene"); return (${fn})(s); })()`);

test("a broken ?card= link shows the clean error screen and never boots the world", async ({ page }) => {
  for (const code of [
    "not-a-real-card",
    // valid base64, invalid content: absurd level, wrong tuple size.
    toBase64Url('{"v":2,"n":"x","d":20733,"p":[["mossling",1e308,0,2]]}'),
    cardCode({ v: 2, n: "x", d: 20733, p: [["mossling", 1, 0, 2, "extra"]] }),
  ]) {
    await page.goto(`/?card=${code}`);
    await expect(page.locator("#card-preview-title")).toHaveText("This card link is broken");
    await expect(page.locator("#playfield")).toBeHidden();
    await expect(page.locator("#quest-hud")).toBeHidden();
    expect(await page.locator("canvas").count()).toBe(0);
  }
});

test("a v3 card shows nicknames in the challenge title, ghost plate and log", async ({ page }) => {
  const code = cardCode({
    v: 3,
    n: "Hollowmere",
    d: 20733,
    p: [["bramblewarden", 14, 2, 4, "Sir Mossington I"], ["lantern-fox", 9, 5, 1, ""]],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?card=${code}&new=1`);
  await page.getByRole("button", { name: "Challenge" }).click({ timeout: 40_000 });
  await waitForBattleTurn(page);
  const info = (await battle(
    page,
    `(s) => ({ title: s.titleOverride, wild: s.wild.name, log: s.logText.text })`,
  )) as { title: string; wild: string; log: string };
  expect(info.title).toBe("Hollowmere's ghost party · 1/2");
  expect(info.wild).toBe("Sir Mossington I");
  expect(info.log).toContain("Sir Mossington I");
  // The old DOM pill (which covered the title) is gone; the announcement is screen-reader only.
  await expect(page.locator("#share-banner")).toHaveClass(/visually-hidden/);
});

test("the player's creature starts fully on screen on phones", async ({ page }) => {
  for (const size of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await startSpar(page);
    const left = (await battle(
      page,
      `(s) => s.playerSprite.getBounds().left - s.cameras.main.worldView.x`,
    )) as number;
    // The sprite box carries transparent padding; the art keeps >= 20 design px clear.
    expect(left, `${size.width}x${size.height}`).toBeGreaterThanOrEqual(0);
  }
});

test("a cooling-down move shakes, toasts 'ready in N' and logs, by key and tap", async ({ page }) => {
  await startSpar(page);
  await page.waitForTimeout(1200);
  const idx = (await battle(page, `(s) => s.moveCards.findIndex((c) => !c.ready)`)) as number;
  expect(idx).toBeGreaterThanOrEqual(0);
  const restX = (await battle(page, `(s) => s.moveCards[${idx}].container.x`)) as number;

  await page.keyboard.press(String(idx + 1));
  await page.waitForTimeout(80);
  const keyed = (await battle(
    page,
    `(s) => ({ log: s.logText.text, toast: Boolean(s.blockedToast && s.blockedToast.active), shaking: s.tweens.getTweensOf(s.moveCards[${idx}].container).length > 0 })`,
  )) as { log: string; toast: boolean; shaking: boolean };
  expect(keyed.log).toMatch(/: ready in [0-9]+$/);
  expect(keyed.toast).toBe(true);
  expect(keyed.shaking).toBe(true);
  // The turn was not spent and the card returns to rest.
  expect(await battle(page, `(s) => s.waitingForPlayer`)).toBe(true);
  await expect.poll(() => battle(page, `(s) => s.moveCards[${idx}].container.x`), { timeout: 8000 }).toBe(restX);

  // Tap the dimmed card.
  const point = (await battle(
    page,
    `(s) => { const g = window.__game; const cam = s.cameras.main; const r = g.canvas.getBoundingClientRect(); const k = (cam.zoom * r.width) / g.scale.width; const c = s.moveCards[${idx}].container; return { x: r.left + (c.x - cam.worldView.x) * k, y: r.top + (c.y - cam.worldView.y) * k }; }`,
  )) as { x: number; y: number };
  await page.waitForTimeout(1200);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(80);
  expect(await battle(page, `(s) => Boolean(s.blockedToast && s.blockedToast.active)`)).toBe(true);
  expect(await battle(page, `(s) => s.waitingForPlayer`)).toBe(true);

  // Unavailable actions answer too (no Befriend in a plain spar, no bench to switch to).
  await page.keyboard.press("b");
  expect(await battle(page, `(s) => s.logText.text`)).toBe("Can't befriend this foe");
  await page.keyboard.press("s");
  expect(await battle(page, `(s) => s.logText.text`)).toBe("No one to switch to");
});

test("move card titles wrap instead of collapsing to 'Bar…' on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startSpar(page);
  const titles = (await battle(
    page,
    `(s) => s.moveCards.map((c) => c.container.list.filter((o) => o.type === "Text").map((o) => o.text))`,
  )) as string[][];
  const flat = titles.flat();
  expect(flat).toContain("Bark Hide");
  expect(flat).not.toContain("Bar…");
});

test("the just-joined nickname prompt does not steal WASD", async ({ page }) => {
  await newGame(page, "Walker");
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const party = await import("/src/game/creatures/party.ts");
    party.addToParty("ember-wisp", 3);
  });
  await expect(page.locator("#nickname-overlay")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#nickname-input")).not.toBeFocused();
  const start = await page.evaluate(() => {
    const s = (window as unknown as { __game: any }).__game.scene.getScene("IsometricScene");
    return s.playerGridX as number;
  });
  await page.keyboard.down("d");
  await page.waitForTimeout(600);
  await page.keyboard.up("d");
  const end = await page.evaluate(() => {
    const s = (window as unknown as { __game: any }).__game.scene.getScene("IsometricScene");
    return s.playerGridX as number;
  });
  expect(end).toBeGreaterThan(start);
  await expect(page.locator("#nickname-input")).toHaveValue("");
  // Still skippable.
  await page.locator("#nickname-skip").click();
  await expect(page.locator("#nickname-overlay")).toBeHidden();
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`Inventory tiles and Party cards (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await newGame(page);
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
      const party = await import("/src/game/creatures/party.ts");
      const inv = await import("/src/game/inventory/playerInventory.ts");
      party.addToParty("mossling", 6);
      party.addToParty("ember-wisp", 5);
      party.playerParty.creatures[0]!.nickname = "Sir Mossington I";
      inv.setInventoryFromSnapshot({ wood: 12, stone: 3, "folklore-dust": 7 }, { boat: 1 });
    });
    // Dismiss the docked nickname prompts so they do not sit over the panels.
    for (let i = 0; i < 4; i += 1) {
      await page.locator("#nickname-skip").click({ timeout: 1500 }).catch(() => undefined);
    }

    await page.locator("#inventory-btn").click();
    const tiles = page.locator(".inventory-tile");
    await expect(tiles).toHaveCount(4);
    for (const box of await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await tiles.first().focus();
    await expect(tiles.first().locator(".material-icon-name")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(tiles.nth(1)).toBeFocused();
    await page.screenshot({ path: `test-results/inventory-${size.width}.png` });
    await page.locator("#inventory-close").click();

    await page.locator("#party-btn").click();
    const cards = page.locator("#party-active-list .party-card");
    await expect(cards).toHaveCount(2);
    const first = cards.first();
    await expect(first.locator(".party-card-name")).toHaveText("Sir Mossington I");
    await expect(first.locator(".party-chip")).toHaveText("woodland");
    await expect(first.locator(".party-card-hp-bar")).toBeVisible();
    const rename = await first.locator(".party-card-rename").boundingBox();
    expect(rename?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(rename?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/party-${size.width}.png` });
    // Selecting then swapping still works through the action row.
    await first.locator(".party-creature-btn").click();
    await expect(page.locator("#party-demote")).toBeEnabled();
    await page.locator("#party-close").click();
  });
}
