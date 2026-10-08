import { expect, test, type Page } from "@playwright/test";

/** Late-game art (#410): must never ride the boot / first-session payload. */
const LATE_ART = /creature-(tide|cairn|horizon|eclipse)-sovereign\.png|hearth-lots-board\.png/;

function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => urls.push(req.url()));
  return urls;
}

/** Flag any rendered game object drawing Phaser's missing texture. */
async function watchMissingTextures(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __game: {
        events: { on(e: string, cb: () => void): void };
        scene: { getScenes(active: boolean): { children: { list: { texture?: { key: string }; visible?: boolean }[] } }[] };
      };
      __missing?: string[];
    };
    w.__missing = [];
    w.__game.events.on("postrender", () => {
      for (const scene of w.__game.scene.getScenes(true)) {
        for (const obj of scene.children.list) {
          if (obj.visible !== false && obj.texture?.key === "__MISSING") {
            w.__missing!.push(String((obj as { type?: string }).type));
          }
        }
      }
    });
  });
}

const missing = (page: Page) =>
  page.evaluate(() => (window as unknown as { __missing?: string[] }).__missing ?? []);

const activeScenes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __game: { scene: { getScenes(a: boolean): { scene: { key: string } }[] } } }).__game.scene
      .getScenes(true)
      .map((s) => s.scene.key),
  );

test("cold boot skips late-game art; keys typed during world start reach the name form", async ({
  page,
}) => {
  const urls = trackRequests(page);
  await page.goto("/");
  await expect(async () => {
    await page.keyboard.press("x");
    await expect(page.locator("#title-menu")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20_000 });

  // New Game, then type straight away: nothing typed during the fade or the
  // world's first frame may be lost.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Te", { delay: 20 });
  // An IME composition mid-word must not drop what was typed around it.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "ß", selectionStart: 1, selectionEnd: 1 });
  await page.keyboard.type("ss", { delay: 20 });
  await expect(page.locator("#name-intro")).toBeVisible();
  await expect(page.locator("#name-intro-input")).toBeFocused();
  await expect(page.locator("#name-intro-input")).toHaveValue("Tess");
  await expect(page.locator("#loading-veil")).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.locator("#name-intro")).toBeHidden();
  await page.waitForTimeout(1000);

  expect(urls.filter((u) => LATE_ART.test(u))).toEqual([]);
  expect(urls.some((u) => u.includes("assets/atlas/imagine-0.png"))).toBe(true);
});

test("a sovereign encounter fetches its art on demand with no missing-texture frame", async ({
  page,
}) => {
  const urls = trackRequests(page);
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Tess");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  expect(urls.filter((u) => LATE_ART.test(u))).toEqual([]);

  await watchMissingTextures(page);
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { scene: { launch(k: string, d: unknown): void; pause(): void } } } } }).__game;
    const iso = g.scene.getScene("IsometricScene");
    iso.scene.launch("EncounterScene", { creatureId: "tide-sovereign" });
    iso.scene.pause();
  });
  await expect.poll(() => activeScenes(page)).toContain("EncounterScene");
  await page.waitForTimeout(800);
  expect(urls.filter((u) => /creature-tide-sovereign\.png/.test(u))).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __game: { textures: { exists(k: string): boolean } } }).__game.textures.exists(
        "creature-tide-sovereign",
      ),
    ),
  ).toBe(true);
  expect(await missing(page)).toEqual([]);
});

test("Hearth Lots fetches its painted board when the table opens", async ({ page }) => {
  const urls = trackRequests(page);
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Tess");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();

  await watchMissingTextures(page);
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: { getScene(k: string): { scene: { launch(k: string): void; pause(): void } } } } }).__game;
    const iso = g.scene.getScene("IsometricScene");
    iso.scene.pause();
    iso.scene.launch("HearthLotsScene");
  });
  await expect.poll(() => activeScenes(page)).toContain("HearthLotsScene");
  await page.waitForTimeout(500);
  expect(urls.filter((u) => /hearth-lots-board\.png/.test(u))).toHaveLength(1);
  // The board drew from the painted art, not the flat fallback cells.
  expect(
    await page.evaluate(() => {
      const g = (window as unknown as { __game: { scene: { getScene(k: string): { children: { list: { texture?: { key: string } }[] } } } } }).__game;
      const scene = g.scene.getScene("HearthLotsScene");
      const flat = (o: { list?: unknown[] }): unknown[] => [o, ...((o.list as { list?: unknown[] }[] | undefined) ?? []).flatMap(flat)];
      return scene.children.list
        .flatMap((o) => flat(o as { list?: unknown[] }))
        .some((o) => (o as { texture?: { key: string } }).texture?.key === "minigame-hearth-lots-board");
    }),
  ).toBe(true);
  expect(await missing(page)).toEqual([]);
});

test("two consumers share one in-flight sovereign fetch; the encounter waits for it", async ({ page }) => {
  const urls = trackRequests(page);
  // Hold the PNG so the prefetch is still in flight when the encounter opens.
  await page.route(/creature-horizon-sovereign\.png/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Tess");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  await watchMissingTextures(page);

  await page.evaluate(async () => {
    const late = await import("/src/game/render/lateAssets.ts");
    const g = (window as unknown as { __game: { textures: never; scene: { getScene(k: string): { scene: { launch(k: string, d: unknown): void; pause(): void } } } } }).__game;
    // Shrine-style silent prefetch, then an encounter before it lands.
    void late.fetchLateImage(g.textures, "creature-horizon-sovereign");
    const iso = g.scene.getScene("IsometricScene");
    iso.scene.launch("EncounterScene", { creatureId: "horizon-sovereign" });
    iso.scene.pause();
  });
  await expect.poll(() => activeScenes(page), { timeout: 15_000 }).toContain("EncounterScene");
  await page.waitForTimeout(600);
  expect(urls.filter((u) => /creature-horizon-sovereign\.png/.test(u))).toHaveLength(1);
  expect(await missing(page)).toEqual([]);
});
