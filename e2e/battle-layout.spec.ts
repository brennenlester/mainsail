import { expect, test, type Page } from "@playwright/test";

/**
 * Full-stage battle (#404): move cards are big enough to tap, sit on screen,
 * and the hit areas line up with what is drawn at four stage shapes; fixed
 * keyboard keys play the battle without stealing keys from DOM inputs.
 */

// Spars boot the world, seed a party, then reload: allow headless WebGL time.
test.describe.configure({ timeout: 60_000 });

const SIZES = [
  { name: "desktop 1280x800", width: 1280, height: 800 },
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "phone landscape 844x390", width: 844, height: 390 },
  { name: "small phone 320x568", width: 320, height: 568 },
] as const;

type Box = { x: number; y: number; w: number; h: number };

async function startSpar(page: Page): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Battle");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  // Seed a party through the dev server's module graph, then reload into a spar.
  await page.evaluate(async () => {
    const party = await import("/src/game/creatures/party.ts");
    party.addToParty("mossling", 6);
    party.addToParty("ember-wisp", 5);
    // 16-character nicknames: chrome must fit / ellipsize them.
    for (const creature of party.getActiveCreatures()) {
      creature.nickname = "Sir Mossington I";
    }
    const save = await import("/src/game/world/worldSaveSchedule.ts");
    save.notifyWorldChanged();
    save.flushPendingHostSave();
  });
  await page.goto("/?spar=mossling");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = (window as unknown as { __game?: { scene: { getScene(k: string): unknown } } }).__game;
          const scene = g?.scene.getScene("BattleScene") as
            | { waitingForPlayer?: boolean; moveCards?: unknown[]; sys: { isActive(): boolean } }
            | undefined;
          // The scene object exists (with defaults) before launch: wait for a live turn.
          return Boolean(scene?.sys.isActive() && scene.waitingForPlayer && scene.moveCards?.length);
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** Move-card boxes in CSS px (page coords), from the camera transform. */
async function moveCardBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: any }).__game;
    const scene = g.scene.getScene("BattleScene");
    const cam = scene.cameras.main;
    const canvas = g.canvas.getBoundingClientRect();
    const k = (cam.zoom * canvas.width) / g.scale.width;
    return scene.moveCards.map((card: any) => {
      // Containers are centred on their size box (graphics carry no bounds).
      const c = card.container;
      const w = c.width * c.scaleX;
      const h = c.height * c.scaleY;
      return {
        x: canvas.left + (c.x - w / 2 - cam.worldView.x) * k,
        y: canvas.top + (c.y - h / 2 - cam.worldView.y) * k,
        w: w * k,
        h: h * k,
      };
    });
  });
}

for (const size of SIZES) {
  test(`battle fills the stage with tappable move cards (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await startSpar(page);
    // The (inert) dock steps aside: the canvas takes the whole viewport.
    const canvas = await page.locator("#game canvas").boundingBox();
    expect(canvas?.width ?? 0).toBeGreaterThanOrEqual(size.width - 2);
    expect(canvas?.height ?? 0).toBeGreaterThanOrEqual(size.height - 2);

    const boxes = await moveCardBoxes(page);
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.w).toBeLessThanOrEqual(size.width + 1);
      expect(box.y + box.h).toBeLessThanOrEqual(size.height + 1);
    }

    // Tapping the drawn centre of card 1 plays that move (hit area lines up).
    const first = boxes[0]!;
    await page.mouse.click(first.x + first.w / 2, first.y + first.h / 2);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = (window as unknown as { __game: any }).__game.scene.getScene("BattleScene");
          return scene.waitingForPlayer;
        }),
      )
      .toBe(false);
  });
}

test("keyboard: S opens switch, Esc closes, 1 plays the first move; DOM inputs keep their keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startSpar(page);
  const scene = (expr: string) =>
    page.evaluate((e) => {
      const s = (window as unknown as { __game: any }).__game.scene.getScene("BattleScene");
      return new Function("s", `return ${e}`)(s);
    }, expr);

  // Typing in a DOM field never drives the battle — even when the field
  // closes on that very key (Phaser reads keys a frame late, after focus moved).
  const typeIntoClosingField = async (key: string): Promise<void> => {
    await page.evaluate(() => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      input.addEventListener("keydown", () => input.remove());
    });
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  };
  await typeIntoClosingField("1");
  await typeIntoClosingField("s");
  expect(await scene("s.waitingForPlayer")).toBe(true);
  expect(await scene("s.switchMenuOpen")).toBe(false);

  await page.keyboard.press("s");
  expect(await scene("s.switchMenuOpen")).toBe(true);
  await page.keyboard.press("Escape");
  expect(await scene("s.switchMenuOpen")).toBe(false);

  await page.keyboard.press("1");
  await expect.poll(() => scene("s.waitingForPlayer")).toBe(false);
});

test("encounter card: F flees whatever verbs are offered (keys never shift)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Card");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  await page.goto("/?encounter=mossling");
  const active = () =>
    page.evaluate(() => (window as unknown as { __game: any }).__game.scene.isActive("EncounterScene"));
  await expect.poll(active, { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(400);
  await page.keyboard.press("f");
  await expect.poll(active).toBe(false);
});

async function battleReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as { __game: any }).__game.scene.getScene("BattleScene");
          return Boolean(s?.sys.isActive() && s.waitingForPlayer && s.moveCards?.length);
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

for (const [label, won, key] of [
  ["victory + Enter", true, "Enter"],
  ["loss + Space", false, " "],
] as const) {
  test(`status dock and stage come back after a battle (${label})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startSpar(page);
    await expect(page.locator("#status-panel")).toBeHidden();
    await page.evaluate((playerWon) => {
      const s = (window as unknown as { __game: any }).__game.scene.getScene("BattleScene");
      (playerWon ? s.wild : s.player).currentHp = 0;
      s.endBattle(playerWon);
    }, won);
    // The result card arms its keys after a beat; wait for that (bounded),
    // then a single press must close it.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __game: any }).__game.scene.getScene("BattleScene").data.get("resultArmed") === true,
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.keyboard.press(key);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __game: any }).__game.scene.isActive("BattleScene")),
      )
      .toBe(false);
    await expect(page.locator("#status-panel")).toBeVisible();
    await expect
      .poll(async () => {
        const canvas = await page.locator("#game canvas").boundingBox();
        const dock = await page.locator("#status-panel").boundingBox();
        return canvas && dock ? Math.abs(canvas.height + dock.height - 844) <= 3 : false;
      })
      .toBe(true);
  });
}

test("boss fight at 320x568 keeps the Matriarch on screen and readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startSpar(page);
  await page.evaluate(() => {
    const g = (window as unknown as { __game: any }).__game;
    g.scene.stop("BattleScene");
    g.scene.getScene("IsometricScene").scene.launch("BattleScene", {
      wildCreatureId: "mossling",
      wandererPartner: { name: "W", maxHp: 24, attack: 6, defense: 4, moves: [] },
      story: { sparId: "cinder-matriarch", rematch: true, ward: 0.8, wardNextIn: 1 },
    });
  });
  await battleReady(page);
  const box = await page.evaluate(() => {
    const g = (window as unknown as { __game: any }).__game;
    const s = g.scene.getScene("BattleScene");
    const cam = s.cameras.main;
    const canvas = g.canvas.getBoundingClientRect();
    const k = (cam.zoom * canvas.width) / g.scale.width;
    const b = s.wildSprite.getBounds();
    return {
      x: canvas.left + (b.x - cam.worldView.x) * k,
      y: canvas.top + (b.y - cam.worldView.y) * k,
      w: b.width * k,
      h: b.height * k,
      arena: s.layout.arenaRegion.h * s.layout.unit,
      sheetTop: canvas.top + (s.layout.sheet.y - cam.worldView.y) * k,
      arenaTop: canvas.top + (s.layout.arenaRegion.y - cam.worldView.y) * k,
    };
  });
  expect(box.arena).toBeGreaterThanOrEqual(170);
  // Displayed boss art: big enough to read, and (with the boss scale in the
  // arena fit) not pushed past the right edge.
  expect(box.h).toBeGreaterThanOrEqual(100);
  expect(box.x).toBeGreaterThanOrEqual(-2);
  expect(box.x + box.w).toBeLessThanOrEqual(322);
  // Head below the plates / intent row (the boss scale is in the arena fit).
  expect(box.y).toBeGreaterThanOrEqual(box.arenaTop - 4);
  // Standing in the arena, above the command sheet.
  expect(box.y + box.h).toBeLessThanOrEqual(box.sheetTop + 2);
});
