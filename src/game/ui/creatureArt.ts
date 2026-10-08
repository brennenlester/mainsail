import type Phaser from "phaser";
import { createSpriteLookup, type SpriteCrop } from "../share/spriteSource";

/**
 * DOM panels (Codex) show creatures with the same art the world uses by
 * copying frames out of the Phaser texture manager into small canvases
 * (#391) — no second copy of the art, and procedural fallbacks work too.
 */
let artGame: Phaser.Game | null = null;

export function bindCreatureArt(game: Phaser.Game): void {
  artGame = game;
}

/** Slot markup: a canvas that `fillCreatureArt` paints once textures are known. */
export function creatureArtSlot(
  creatureId: string,
  options: { silhouette?: boolean; size?: number } = {},
): string {
  const size = options.size ?? 56;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const px = Math.round(size * dpr);
  return `<canvas class="codex-art${options.silhouette ? " codex-art--silhouette" : ""}" data-creature="${creatureId}"${
    options.silhouette ? ' data-silhouette="1"' : ""
  } width="${px}" height="${px}" style="width:${size}px;height:${size}px" aria-hidden="true"></canvas>`;
}

/** Draw `crop` contained in the canvas; silhouettes keep only the shape. */
export function paintCreatureArt(
  canvas: HTMLCanvasElement,
  crop: SpriteCrop,
  silhouette: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const pad = Math.round(canvas.width * 0.04);
  const room = canvas.width - pad * 2;
  const scale = Math.min(room / crop.sw, room / crop.sh);
  const w = crop.sw * scale;
  const h = crop.sh * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    crop.image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    (canvas.width - w) / 2,
    canvas.height - pad - h,
    w,
    h,
  );
  if (silhouette) {
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#3b5666";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Paint every `canvas[data-creature]` under `root`. Safe to call before the game exists. */
export async function fillCreatureArt(root: ParentNode): Promise<void> {
  const game = artGame;
  const slots = root.querySelectorAll<HTMLCanvasElement>("canvas[data-creature]");
  if (!game || slots.length === 0) {
    return;
  }
  try {
    // Lazy: sprites.ts pulls in Phaser at runtime, which unit tests avoid.
    const { ensureCreatureTextures } = await import("../creatures/sprites");
    const scene = game.scene.getScenes(true)[0];
    if (scene) {
      ensureCreatureTextures(scene);
    }
    const lookup = createSpriteLookup(game);
    slots.forEach((canvas) => {
      const crop = lookup(canvas.dataset.creature ?? "");
      if (crop) {
        paintCreatureArt(canvas, crop, canvas.dataset.silhouette === "1");
      }
    });
  } catch {
    // Art is decoration; the codex text stands on its own.
  }
}
