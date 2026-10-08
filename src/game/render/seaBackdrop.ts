import Phaser from "phaser";
import { IMAGINE_ATLAS_KEY, hasImagineFrame } from "./imagineAssets";
import { TILE_HEIGHT, TILE_WIDTH } from "../isometric";
import { EFFECTS_CHANGED_EVENT, effectsEnabled, prefersReducedMotion } from "./fx/fxSettings";

/**
 * Open sea + Archipelago horizon (#412). Drawn in world space on the main
 * camera, so the day/night colour matrix (render/fx) tints it like the tiles.
 */

/** Deep-water frame tiled under and around Harbor / Archipelago tiles. */
export const SEA_BACKDROP_KEY = "tile-sea-deep-v0";
/** Rendered ocean tiles are 192 px for one 48 px grid cell. */
const OCEAN_TILE_PX = 192;
/** World px of sky + sea haze shown north of the Archipelago's first row. */
export const HORIZON_HEIGHT = 300;
/** Horizon line, world px above the first row (rest of HORIZON_HEIGHT is sky). */
const HORIZON_OFFSET = 150;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Deep water past the drawn tiles, aligned to the grid so its repeats fall on
 * tile seams (the ocean variants share their border detail). False when the
 * ocean frame is not packed, so callers keep their old backdrop.
 */
export function drawSeaBackdrop(
  scene: Phaser.Scene,
  bounds: Bounds,
  origin: { x: number; y: number },
  pad = 900,
): boolean {
  if (!hasImagineFrame(scene, SEA_BACKDROP_KEY)) {
    return false;
  }
  const x0 = origin.x - Math.ceil((origin.x - bounds.minX + pad) / TILE_WIDTH) * TILE_WIDTH;
  const y0 = origin.y - Math.ceil((origin.y - bounds.minY + pad) / TILE_HEIGHT) * TILE_HEIGHT;
  // A TileSprite allocates a blank canvas texture of its own size (#410): the
  // Archipelago backdrop would be ~6.6k px square (~45 MPx). Build it at 1/8
  // size and scale up; the tiles on screen are the same.
  const shrink = 8;
  scene.add
    .tileSprite(
      x0,
      y0,
      Math.ceil((bounds.maxX + pad - x0) / shrink),
      Math.ceil((bounds.maxY + pad - y0) / shrink),
      IMAGINE_ATLAS_KEY,
      SEA_BACKDROP_KEY,
    )
    .setOrigin(0, 0)
    .setScale(shrink)
    .setTileScale(TILE_WIDTH / OCEAN_TILE_PX / shrink)
    .setDepth(-1000);
  return true;
}

function lerpColor(a: number, b: number, t: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 1, t);
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

/** Deterministic 0..1 sequence (no Math.random: same horizon every visit). */
function seq(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Soft horizon north of the map: sea haze fading in from row 0, a warm-to-
 * blue sky, distant islet silhouettes (with faint reflections) and clouds.
 * Islets and clouds use a horizontal scroll factor < 1 (parallax, like the
 * title diorama); clouds drift slowly unless Effects are off or the player
 * prefers reduced motion.
 */
export function drawHorizon(scene: Phaser.Scene, originY: number, minX: number, maxX: number): void {
  teardownHorizon();
  const left = minX - 1200;
  const width = maxX - minX + 2400;
  const horizonY = originY - HORIZON_OFFSET;
  const top = originY - HORIZON_HEIGHT - 400;

  const sky = scene.add.graphics().setDepth(-999);
  // Sky: deep blue up top, warm haze at the horizon (stepped bands = toon).
  const skySteps = 24;
  for (let i = 0; i < skySteps; i += 1) {
    const y0 = top + ((horizonY - top) * i) / skySteps;
    const y1 = top + ((horizonY - top) * (i + 1)) / skySteps;
    const t = Math.pow(i / (skySteps - 1), 1.8);
    sky.fillStyle(lerpColor(0x8cc3e4, 0xf3e7cc, t), 1);
    sky.fillRect(left, y0, width, y1 - y0 + 1);
  }
  // Sea haze: transparent at row 0, pale at the horizon line.
  const seaSteps = 18;
  for (let i = 0; i < seaSteps; i += 1) {
    const t = (i + 1) / seaSteps;
    const y1 = originY - ((originY - horizonY) * i) / seaSteps;
    const y0 = originY - ((originY - horizonY) * (i + 1)) / seaSteps;
    sky.fillStyle(lerpColor(0x5f9fc8, 0xb4d8e6, t), 0.12 + 0.88 * Math.pow(t, 1.6));
    sky.fillRect(left, y0, width, y1 - y0);
  }

  const far = scene.add.graphics().setDepth(-998.5).setScrollFactor(0.86, 1);
  const near = scene.add.graphics().setDepth(-998).setScrollFactor(0.93, 1);
  const islet = (g: Phaser.GameObjects.Graphics, cx: number, w: number, h: number, color: number, i: number) => {
    // Flat base on the horizon, lumpy top (a few tree / rock bumps).
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    const n = 18;
    for (let k = 0; k <= n; k += 1) {
      const a = Math.PI - (Math.PI * k) / n;
      const bump = 1 + 0.18 * Math.sin(k * 1.7 + i) * Math.sin(k * 0.9 + i * 2);
      pts.push({ x: cx + Math.cos(a) * w * 0.5, y: horizonY - Math.sin(a) * h * bump });
    }
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
    // Faint reflection under the line.
    g.fillStyle(color, 0.22);
    g.fillEllipse(cx, horizonY + h * 0.18, w * 0.9, h * 0.36);
  };
  let i = 0;
  for (let x = left + 200; x < left + width - 200; i += 1) {
    const big = seq(i, 1) > 0.55;
    islet(
      big ? near : far,
      x,
      big ? 180 + seq(i, 2) * 220 : 90 + seq(i, 3) * 120,
      big ? 26 + seq(i, 4) * 26 : 12 + seq(i, 5) * 12,
      big ? 0x6f9fb2 : 0x9cc3d2,
      i,
    );
    x += 260 + seq(i, 6) * 520;
  }
  // Bright horizon line over the islet bases.
  sky.fillStyle(0xfff4dc, 0.55);
  sky.fillRect(left, horizonY - 1, width, 3);

  const clouds = scene.add.graphics().setDepth(-997.5).setScrollFactor(0.8, 1);
  let c = 0;
  for (let x = left + 120; x < left + width - 120; c += 1) {
    const y = top + 260 + seq(c, 7) * (horizonY - top - 320);
    const s = 0.7 + seq(c, 8) * 0.7;
    clouds.fillStyle(0xdfe8f0, 0.75);
    clouds.fillEllipse(x, y + 8 * s, 150 * s, 22 * s);
    clouds.fillStyle(0xfffbf0, 0.9);
    for (let k = 0; k < 4; k += 1) {
      clouds.fillEllipse(x + (k - 1.5) * 34 * s, y - seq(c * 4 + k, 9) * 14 * s, (54 + seq(c * 4 + k, 10) * 30) * s, (30 + seq(c, 11) * 12) * s);
    }
    x += 420 + seq(c, 12) * 600;
  }
  if (!prefersReducedMotion()) {
    const tween = scene.tweens.add({
      targets: clouds,
      x: "+=90",
      duration: 26_000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      paused: !effectsEnabled(),
    });
    // The Effects toggle starts / stops the drift live.
    const onToggle = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail) tween.resume();
      else tween.pause();
    };
    window.addEventListener(EFFECTS_CHANGED_EVENT, onToggle);
    horizonTeardown = () => {
      window.removeEventListener(EFFECTS_CHANGED_EVENT, onToggle);
      tween.remove();
    };
  }
}

let horizonTeardown: (() => void) | undefined;

/**
 * Stop the horizon's cloud drift and its Effects listener. Call before a zone
 * reload: `children.removeAll(true)` drops display objects without destroying
 * them, so the infinite tween would otherwise outlive the zone.
 */
export function teardownHorizon(): void {
  horizonTeardown?.();
  horizonTeardown = undefined;
}
