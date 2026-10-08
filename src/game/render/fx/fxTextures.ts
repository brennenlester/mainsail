import type Phaser from "phaser";
import type { EmoteKind } from "./followerMotion";

/**
 * Procedural FX textures (#362) — no new image assets. Generated once per
 * game (texture manager is global) and reused by every zone load.
 */

export const FX_TEX = {
  glow: "fx-glow",
  halo: "fx-halo",
  spark: "fx-spark",
  leaf: "fx-leaf",
  petal: "fx-petal",
  puff: "fx-puff",
  chip: "fx-chip",
  ring: "fx-ring",
} as const;

export function emoteTextureKey(kind: EmoteKind): string {
  return `fx-emote-${kind}`;
}

function radialTexture(
  scene: Phaser.Scene,
  key: string,
  size: number,
  stops: Array<[number, string]>,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) {
    return;
  }
  const ctx = tex.getContext();
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) {
    grad.addColorStop(at, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function graphicsTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function emoteBubble(
  scene: Phaser.Scene,
  kind: EmoteKind,
  drawIcon: (g: Phaser.GameObjects.Graphics) => void,
): void {
  graphicsTexture(scene, emoteTextureKey(kind), 30, 30, (g) => {
    g.fillStyle(0x2a2a3e, 0.25);
    g.fillRoundedRect(2, 3, 26, 22, 9);
    g.fillStyle(0xfffaf0, 1);
    g.fillRoundedRect(1, 1, 26, 22, 9);
    g.fillTriangle(10, 22, 17, 22, 12, 28);
    g.lineStyle(1.5, 0x7a6a58, 0.5);
    g.strokeRoundedRect(1, 1, 26, 22, 9);
    drawIcon(g);
  });
}

export function ensureFxTextures(scene: Phaser.Scene): void {
  radialTexture(scene, FX_TEX.glow, 32, [
    [0, "rgba(255,255,255,1)"],
    [0.25, "rgba(255,255,255,0.75)"],
    [0.6, "rgba(255,255,255,0.18)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  radialTexture(scene, FX_TEX.halo, 128, [
    [0, "rgba(255,255,255,0.9)"],
    [0.35, "rgba(255,255,255,0.4)"],
    [0.7, "rgba(255,255,255,0.1)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  radialTexture(scene, FX_TEX.puff, 24, [
    [0, "rgba(255,255,255,0.9)"],
    [0.55, "rgba(255,255,255,0.5)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  graphicsTexture(scene, FX_TEX.spark, 16, 16, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(8, 0, 9.6, 8, 6.4, 8);
    g.fillTriangle(8, 16, 9.6, 8, 6.4, 8);
    g.fillTriangle(0, 8, 8, 6.4, 8, 9.6);
    g.fillTriangle(16, 8, 8, 6.4, 8, 9.6);
    g.fillCircle(8, 8, 2.2);
  });
  graphicsTexture(scene, FX_TEX.leaf, 12, 8, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(6, 4, 11, 6);
    g.lineStyle(1, 0xcccccc, 1);
    g.lineBetween(1, 4, 11, 4);
  });
  graphicsTexture(scene, FX_TEX.petal, 8, 8, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(4, 4, 7, 5);
  });
  graphicsTexture(scene, FX_TEX.chip, 6, 6, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 6, 6);
  });
  graphicsTexture(scene, FX_TEX.ring, 64, 64, (g) => {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(32, 32, 29);
  });

  emoteBubble(scene, "heart", (g) => {
    g.fillStyle(0xe2566e, 1);
    g.fillCircle(10.5, 10, 4.2);
    g.fillCircle(17.5, 10, 4.2);
    g.fillTriangle(6.5, 11.5, 21.5, 11.5, 14, 19.5);
  });
  emoteBubble(scene, "note", (g) => {
    g.fillStyle(0x4a6fb0, 1);
    g.fillEllipse(11, 17, 7, 5);
    g.fillRect(13.2, 5, 2, 12);
    g.fillTriangle(15, 5, 20, 8, 15, 10);
  });
  emoteBubble(scene, "dots", (g) => {
    g.fillStyle(0x5a5a6e, 1);
    g.fillCircle(8, 12, 2.2);
    g.fillCircle(14, 12, 2.2);
    g.fillCircle(20, 12, 2.2);
  });
  emoteBubble(scene, "spark", (g) => {
    g.fillStyle(0xe8b030, 1);
    g.fillTriangle(14, 3, 16, 12, 12, 12);
    g.fillTriangle(14, 21, 16, 12, 12, 12);
    g.fillTriangle(5, 12, 14, 10, 14, 14);
    g.fillTriangle(23, 12, 14, 10, 14, 14);
  });
}
