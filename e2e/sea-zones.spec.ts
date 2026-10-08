import { expect, test, type Page } from "@playwright/test";

/**
 * Harbor / Archipelago ocean (#412): zone reloads must not leak the stream
 * sprite registry, baked islands or the horizon cloud tween, and the
 * Archipelago's drawn window must cover the camera at wide and short stages.
 * Dev-server only (uses `window.__game` and the app's own modules).
 */

type Iso = {
  playerGridX: number;
  playerGridY: number;
  loadZone(zone: string): void;
  streamSprites: Set<unknown>;
  islandBakes: { size: number };
  archipelagoVisualWin: { xMin: number; xMax: number; yMin: number; yMax: number };
  worldOrigin: { x: number; y: number };
  cameras: { main: { worldView: { x: number; y: number; right: number; bottom: number } } };
  tweens: { getTweens(): { data?: { duration: number }[]; targets: { type: string }[] }[] };
};
type Win = Window & {
  __game?: {
    scene: { isActive(k: string): boolean; getScene(k: string): unknown };
    textures: { getTextureKeys(): string[] };
  };
  __liveGlTextures?: () => number;
};

async function start(page: Page): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Finn");
  await page.locator("#name-intro-submit").click();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as Win).__game?.scene.isActive("IsometricScene"))), { timeout: 20_000 })
    .toBe(true);
  await page.waitForTimeout(800);
}

async function warp(page: Page, zone: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    async ([z, gx, gy]) => {
      const boat = await import("/src/game/world/dockBoat.ts");
      boat.setSailing(z === "archipelago");
      if (z === "archipelago") {
        const arch = await import("/src/game/world/archipelagoStream.ts");
        arch.prepareArchipelagoForPosition(gx as number);
      }
      const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
      iso.playerGridX = gx as number;
      iso.playerGridY = gy as number;
      iso.loadZone(z as string);
    },
    [zone, x, y] as const,
  );
  await page.waitForTimeout(400);
}

const stats = (page: Page) =>
  page.evaluate(() => {
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
    return {
      sprites: iso.streamSprites.size,
      bakes: iso.islandBakes.size,
      // Phaser 3.90 keeps the per-property duration on `data[0]` (the tween's
      // own `duration` is a huge repeat-forever total), so match on that.
      clouds: iso.tweens.getTweens().filter((t) => t.data?.[0]?.duration === 26_000 && t.targets[0]?.type === "Graphics").length,
    };
  });

test("zone reloads free stream sprites, island bakes and the cloud tween", async ({ page }) => {
  await start(page);
  await warp(page, "harbor", 10, 6);
  const harbor = await stats(page);
  for (let i = 0; i < 4; i += 1) {
    await warp(page, "archipelago", 14, 21);
    const sea = await stats(page);
    expect(sea.clouds).toBe(1);
    expect(sea.bakes).toBeGreaterThan(0);
    await warp(page, "harbor", 10, 6);
  }
  const after = await stats(page);
  expect(after.sprites).toBe(harbor.sprites);
  expect(after.bakes).toBe(0);
  expect(after.clouds).toBe(0);
});

test("20 Harbor <-> Archipelago round trips keep texture keys and GL textures flat (#417)", async ({ page }) => {
  test.setTimeout(90_000);
  // Count live WebGL texture objects (create minus delete, by identity) so a
  // leaked canvas texture shows up whether or not the manager still lists it.
  await page.addInitScript(() => {
    const live = new Set<unknown>();
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const create = C.prototype.createTexture;
      const del = C.prototype.deleteTexture;
      C.prototype.createTexture = function (this: WebGLRenderingContext) {
        const t = create.call(this);
        live.add(t);
        return t;
      };
      C.prototype.deleteTexture = function (this: WebGLRenderingContext, t: WebGLTexture | null) {
        live.delete(t);
        del.call(this, t);
      };
    }
    (window as Win).__liveGlTextures = () => live.size;
  });
  await start(page);
  const counts = () =>
    page.evaluate(() => ({
      keys: (window as Win).__game!.textures.getTextureKeys().length,
      gl: (window as Win).__liveGlTextures!(),
    }));
  // First round trip warms lazily created textures (world art, anims).
  await warp(page, "archipelago", 14, 21);
  await warp(page, "harbor", 10, 6);
  const base = await counts();
  for (let i = 0; i < 20; i += 1) {
    await warp(page, "archipelago", 14, 21, 120);
    await warp(page, "harbor", 10, 6, 120);
  }
  const after = await counts();
  // Before the fix this grew ~4 keys per trip (+108 over 20 trips); a toast or two may appear.
  expect(after.keys - base.keys).toBeLessThanOrEqual(2);
  // Before the fix this grew ~7 GL textures per trip (+146 over 20 trips).
  expect(after.gl - base.gl).toBeLessThanOrEqual(4);
});

for (const vp of [
  { width: 3440, height: 1440 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`Archipelago window covers the camera at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await start(page);
    for (const [x, y] of [
      [1, 50],
      [50, 50],
      [98, 2],
      [50, 98],
    ]) {
      await warp(page, "archipelago", x, y);
      const gap = await page.evaluate(() => {
        const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
        const v = iso.cameras.main.worldView;
        const w = iso.archipelagoVisualWin;
        const o = iso.worldOrigin;
        const cell = 48;
        // Positive = camera sees past the drawn window on that side (inside the map).
        return {
          left: w.xMin > 3 ? o.x + w.xMin * cell - v.x : 0,
          right: w.xMax < 100 ? v.right - (o.x + w.xMax * cell) : 0,
          top: w.yMin > 0 ? o.y + w.yMin * cell - v.y : 0,
          bottom: w.yMax < 100 ? v.bottom - (o.y + w.yMax * cell) : 0,
        };
      });
      for (const [side, px] of Object.entries(gap)) {
        expect(px, `${x},${y} ${side}`).toBeLessThanOrEqual(0);
      }
    }
  });
}
