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
  islandBakes: {
    size: number;
    baked: Map<number, { width: number; height: number }>;
    pool: { width: number; height: number; getData(k: string): string }[];
    job?: unknown;
  };
  sys: { sceneUpdate: (this: unknown, time: number, delta: number) => void };
  archipelagoVisualWin: { xMin: number; xMax: number; yMin: number; yMax: number };
  worldOrigin: { x: number; y: number };
  cameras: { main: { worldView: { x: number; y: number; right: number; bottom: number } } };
  tweens: { getTweens(): { data?: { duration: number }[]; targets: { type: string }[] }[] };
};
type Win = Window & {
  __game?: {
    scene: { isActive(k: string): boolean; getScene(k: string): unknown };
    textures: { getTextureKeys(): string[]; exists(k: string): boolean };
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
  // Harbor owns the smooth edge-vignette texture; other zones must not keep it.
  const hasVignette = () => page.evaluate(() => (window as Win).__game!.textures.exists("zone-edge-vignette"));
  expect(await hasVignette()).toBe(true);
  await warp(page, "archipelago", 14, 21, 120);
  expect(await hasVignette()).toBe(false);
});

/** Install per-frame probes: island bakes finished per frame, unbaked islands in view, slowest update. */
async function probeBakes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const arch = await import("/src/game/world/archipelagoStream.ts");
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
    const probe = { maxPerFrame: 0, unbakedInView: 0, slowestStepMs: 0, finished: 0 };
    (window as unknown as { __probe: typeof probe }).__probe = probe;
    const update = iso.sys.sceneUpdate;
    // Count islands finishing a bake (the map's size also drops as others are freed).
    let doneThisFrame = 0;
    const baked = iso.islandBakes.baked;
    const set = baked.set.bind(baked);
    baked.set = (key, value) => {
      doneThisFrame += 1;
      return set(key, value);
    };
    iso.sys.sceneUpdate = function (this: unknown, time: number, delta: number) {
      doneThisFrame = 0;
      const t = performance.now();
      update.call(this, time, delta);
      probe.slowestStepMs = Math.max(probe.slowestStepMs, performance.now() - t);
      probe.maxPerFrame = Math.max(probe.maxPerFrame, doneThisFrame);
      probe.finished += doneThisFrame;
    };
    (window as unknown as { __game: { events: { on(e: string, cb: () => void): void } } }).__game.events.on("postrender", () => {
      const v = iso.cameras.main.worldView;
      const o = iso.worldOrigin;
      for (const isl of arch.listIslandTemplates(arch.ARCHIPELAGO_MAX_WIDTH)) {
        const r = arch.islandBakeRegion(isl);
        const inView =
          o.x + r.x0 * 48 < v.right && o.x + r.x1 * 48 > v.x && o.y + r.y0 * 48 < v.bottom && o.y + r.y1 * 48 > v.y;
        if (inView && !iso.islandBakes.baked.has(isl.index)) probe.unbakedInView += 1;
      }
    });
  });
}

test("sailing bakes islands a frame or two at a time and none is ever missing in view (#417)", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page);
  // Down the open-water lane between island columns: rows 2 and 3 stream in.
  await warp(page, "archipelago", 26, 28, 800);
  await probeBakes(page);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(7000);
  await page.keyboard.up("ArrowDown");
  const probe = await page.evaluate(
    () => (window as unknown as { __probe: { maxPerFrame: number; unbakedInView: number; slowestStepMs: number; finished: number } }).__probe,
  );
  expect(probe.finished, "islands baked while sailing").toBeGreaterThan(0);
  expect(probe.maxPerFrame).toBeLessThanOrEqual(2);
  expect(probe.unbakedInView).toBe(0);
  // Before #417 one bake alone cost 35-120 ms in a single step.
  expect(probe.slowestStepMs).toBeLessThan(40);
});

test("a resize frees spare island textures of the old size and stays in budget (#417)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await warp(page, "archipelago", 26, 28, 800);
  const snap = () =>
    page.evaluate(() => {
      const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
      const b = iso.islandBakes;
      return {
        total: b.baked.size + b.pool.length + (b.job ? 1 : 0),
        poolSizes: [...new Set(b.pool.map((rt) => rt.getData("bakeSize")))],
      };
    });
  const before = await snap();
  expect(before.poolSizes).toHaveLength(1);
  // 1x -> 1.5x bake scale: the spare 528x576 textures can never be reused.
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(500);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(6000);
  await page.keyboard.up("ArrowDown");
  const after = await snap();
  expect(after.total).toBeLessThanOrEqual(12);
  expect(after.poolSizes.filter((k) => k === before.poolSizes[0])).toEqual([]);
});

test.describe("DPR 3 phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

  test("islands bake sharper than 1x within the texture budget (#417)", async ({ page }) => {
    await start(page);
    await warp(page, "archipelago", 50, 50, 800);
    const { scale, pixels, count } = await page.evaluate(() => {
      const iso = (window as Win).__game!.scene.getScene("IsometricScene") as Iso;
      const rts = [...iso.islandBakes.baked.values()];
      return {
        count: rts.length,
        // An 11 x 12 tile region is 528 x 576 world px.
        scale: rts[0]!.width / 528,
        pixels: rts.reduce((n, rt) => n + rt.width * rt.height, 0),
      };
    });
    expect(count).toBeGreaterThan(0);
    expect(scale).toBeGreaterThan(1);
    // 12 island textures (baked + spare) at this scale stay under the budget.
    expect((pixels / count) * 12).toBeLessThanOrEqual(9_000_000);
  });
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
