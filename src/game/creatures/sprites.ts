import { hasWorldTexture } from "../render/imagineAssets";
import { isLateImagePending } from "../render/lateAssets";
import Phaser from "phaser";
import { CREATURES } from "./catalog";

const SPRITE_WIDTH = 48;
const SPRITE_HEIGHT = 52;
const OUTLINE = 0x1a2838;

type CreatureDrawer = (
  g: Phaser.GameObjects.Graphics,
  color: number,
) => void;

function shade(color: number, delta: number): number {
  const clamp = (value: number) => Math.min(255, Math.max(0, value));
  const r = clamp(((color >> 16) & 0xff) + delta);
  const g = clamp(((color >> 8) & 0xff) + delta);
  const b = clamp((color & 0xff) + delta);
  return (r << 16) | (g << 8) | b;
}

function drawShadow(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(SPRITE_WIDTH / 2, SPRITE_HEIGHT - 4, 24, 6);
}

function drawEyes(
  g: Phaser.GameObjects.Graphics,
  leftX: number,
  rightX: number,
  y: number,
  radius = 3.5,
): void {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(leftX, y, radius);
  g.fillCircle(rightX, y, radius);
  g.fillStyle(0x1a2838, 1);
  g.fillCircle(leftX + 0.5, y + 0.5, radius * 0.45);
  g.fillCircle(rightX + 0.5, y + 0.5, radius * 0.45);
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(leftX - 1, y - 1, 1);
  g.fillCircle(rightX - 1, y - 1, 1);
}

function blob(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(x, y, w + 3, h + 3);
  g.fillStyle(fill, 1);
  g.fillEllipse(x, y, w, h);
}

function drawMossling(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 36, 20, 14, shade(color, -20));
  blob(g, 24, 28, 18, 16, color);
  blob(g, 24, 18, 20, 18, shade(color, 30));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(24, 4, 14, 18, 34, 18);
  g.fillStyle(0x7ad848, 1);
  g.fillTriangle(24, 6, 16, 17, 32, 17);
  g.fillStyle(0xc8f070, 0.85);
  g.fillCircle(20, 12, 4);
  g.fillCircle(28, 13, 3);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(17, 38, 5, 8, 2);
  g.fillRoundedRect(26, 38, 5, 8, 2);
  g.fillStyle(shade(color, -40), 1);
  g.fillRoundedRect(18, 39, 3, 6, 1);
  g.fillRoundedRect(27, 39, 3, 6, 1);
  drawEyes(g, 20, 28, 20);
}

function drawEmberWisp(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 50), 0.35);
  g.fillTriangle(24, 4, 8, 36, 40, 36);
  blob(g, 24, 24, 26, 26, color);
  g.fillStyle(shade(color, 45), 0.95);
  g.fillCircle(24, 20, 10);
  g.fillStyle(0xfff4b0, 0.95);
  g.fillCircle(24, 17, 5);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(24, 40, 16, 50, 32, 50);
  g.fillStyle(shade(color, -10), 0.85);
  g.fillTriangle(24, 40, 18, 48, 30, 48);
  drawEyes(g, 19, 29, 22, 3);
}

function drawBrookNymph(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.3);
  g.fillEllipse(24, 42, 24, 8);
  blob(g, 24, 30, 16, 22, color);
  blob(g, 24, 16, 18, 16, shade(color, 35));
  g.fillStyle(0xe8f8ff, 0.8);
  g.fillCircle(20, 14, 4);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(6, 28, 14, 36, 8, 46);
  g.fillTriangle(42, 28, 34, 36, 40, 46);
  g.fillStyle(shade(color, 50), 1);
  g.fillTriangle(8, 30, 13, 35, 9, 43);
  g.fillTriangle(40, 30, 35, 35, 39, 43);
  drawEyes(g, 20, 28, 17);
}

function drawStoneHound(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(13, 36, 8, 12, 2);
  g.fillRoundedRect(27, 36, 8, 12, 2);
  g.fillStyle(shade(color, -25), 1);
  g.fillRoundedRect(14, 37, 6, 10, 2);
  g.fillRoundedRect(28, 37, 6, 10, 2);
  blob(g, 24, 30, 26, 16, color);
  blob(g, 24, 18, 22, 20, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(12, 14, 16, 4, 22, 16);
  g.fillTriangle(36, 14, 32, 4, 26, 16);
  g.fillStyle(shade(color, -10), 1);
  g.fillTriangle(14, 14, 17, 7, 21, 15);
  g.fillTriangle(34, 14, 31, 7, 27, 15);
  g.lineStyle(2, shade(color, -40), 0.55);
  g.lineBetween(16, 28, 32, 30);
  drawEyes(g, 19, 29, 18);
}

function drawMistSerpent(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.3);
  g.fillCircle(10, 40, 8);
  g.fillCircle(38, 40, 8);
  blob(g, 22, 34, 26, 12, color);
  blob(g, 30, 24, 18, 14, shade(color, 15));
  blob(g, 36, 14, 16, 14, shade(color, 30));
  g.fillStyle(0xf0e8ff, 0.85);
  g.fillCircle(38, 12, 4);
  drawEyes(g, 34, 40, 13, 3);
}

function drawRootwalker(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(15, 38, 7, 10, 2);
  g.fillRoundedRect(26, 38, 7, 10, 2);
  g.fillStyle(shade(color, -30), 1);
  g.fillRoundedRect(16, 39, 5, 8, 1);
  g.fillRoundedRect(27, 39, 5, 8, 1);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(16, 20, 16, 20, 4);
  g.fillStyle(color, 1);
  g.fillRoundedRect(17, 21, 14, 18, 3);
  blob(g, 24, 14, 18, 16, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(17, 8, 7);
  g.fillCircle(31, 10, 6);
  g.fillStyle(0x68c848, 1);
  g.fillCircle(17, 8, 5);
  g.fillCircle(31, 10, 4);
  g.fillStyle(0xc8f070, 0.7);
  g.fillCircle(16, 6, 2);
  drawEyes(g, 20, 28, 15);
}

function drawLanternFox(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(17, 38, 6, 10, 2);
  g.fillRoundedRect(27, 38, 6, 10, 2);
  g.fillStyle(shade(color, -30), 1);
  g.fillRoundedRect(18, 39, 4, 8, 1);
  g.fillRoundedRect(28, 39, 4, 8, 1);
  blob(g, 24, 30, 20, 14, color);
  blob(g, 32, 20, 16, 14, shade(color, 15));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(30, 10, 34, 2, 38, 12);
  g.fillTriangle(38, 18, 46, 16, 40, 26);
  g.fillStyle(shade(color, -5), 1);
  g.fillTriangle(31, 10, 34, 4, 36, 12);
  g.fillStyle(0xfff8c0, 1);
  g.fillCircle(40, 22, 5);
  g.fillStyle(0xfff880, 0.55);
  g.fillCircle(40, 22, 8);
  drawEyes(g, 28, 35, 18, 3);
}

function drawThunderFinch(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(8, 26, 18, 34, 10, 40);
  g.fillStyle(shade(color, -20), 1);
  g.fillTriangle(10, 28, 16, 33, 11, 38);
  blob(g, 24, 28, 18, 14, color);
  blob(g, 30, 18, 16, 14, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(34, 14, 4, 10, 1);
  g.fillTriangle(38, 18, 44, 24, 38, 28);
  g.fillStyle(0xffe84a, 1);
  g.fillRoundedRect(35, 15, 2, 8, 1);
  g.fillTriangle(38, 19, 42, 24, 38, 27);
  g.lineStyle(2, 0xffe84a, 0.9);
  g.lineBetween(36, 12, 42, 18);
  g.lineBetween(42, 18, 36, 24);
  drawEyes(g, 28, 34, 17, 3);
}

function drawBramblewarden(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(15, 38, 7, 10, 2);
  g.fillRoundedRect(26, 38, 7, 10, 2);
  g.fillStyle(shade(color, -25), 1);
  g.fillRoundedRect(16, 39, 5, 8, 1);
  g.fillRoundedRect(27, 39, 5, 8, 1);
  blob(g, 24, 30, 24, 16, color);
  blob(g, 24, 16, 22, 20, shade(color, 25));
  for (const [x, y] of [
    [15, 10],
    [33, 12],
    [24, 5],
    [18, 22],
    [30, 20],
  ]) {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(x, y, 4);
    g.fillStyle(0x5a9a40, 1);
    g.fillCircle(x, y, 3);
  }
  drawEyes(g, 20, 28, 17);
}

function drawHearthflame(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(15, 38, 8, 10, 2);
  g.fillRoundedRect(25, 38, 8, 10, 2);
  g.fillStyle(shade(color, -30), 1);
  g.fillRoundedRect(16, 39, 6, 8, 1);
  g.fillRoundedRect(26, 39, 6, 8, 1);
  blob(g, 24, 30, 24, 16, color);
  blob(g, 24, 16, 22, 20, shade(color, 30));
  g.fillStyle(0xfff0a0, 0.95);
  g.fillCircle(24, 12, 7);
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(22, 10, 3);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(24, 42, 14, 50, 34, 50);
  g.fillStyle(shade(color, -10), 0.8);
  g.fillTriangle(24, 42, 17, 48, 31, 48);
  drawEyes(g, 19, 29, 18);
}

function drawPeatSprite(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 28, 22, 18, color);
  blob(g, 24, 16, 16, 14, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(16, 10, 12, 2, 20, 8);
  g.fillTriangle(32, 10, 36, 2, 28, 8);
  g.fillStyle(shade(color, 35), 1);
  g.fillTriangle(16, 9, 13, 4, 19, 8);
  g.fillTriangle(32, 9, 35, 4, 29, 8);
  g.fillStyle(0xff9040, 0.7);
  g.fillCircle(18, 26, 2);
  g.fillCircle(30, 24, 2);
  drawEyes(g, 20, 22, 16, 2);
}

function drawCinderToad(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(16, 44, 10, 6);
  g.fillEllipse(32, 44, 10, 6);
  g.fillStyle(shade(color, -20), 1);
  g.fillEllipse(16, 43, 8, 4);
  g.fillEllipse(32, 43, 8, 4);
  blob(g, 24, 30, 28, 18, color);
  blob(g, 24, 18, 18, 14, shade(color, 25));
  g.fillStyle(0xffe080, 0.85);
  g.fillCircle(18, 16, 4);
  g.fillCircle(30, 16, 4);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(18, 16, 2);
  g.fillCircle(30, 16, 2);
  drawEyes(g, 20, 26, 16, 3);
}

function drawBogLantern(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(21, 34, 6, 12, 2);
  g.fillStyle(shade(color, -40), 1);
  g.fillRoundedRect(22, 35, 4, 10, 1);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(24, 20, 14);
  g.fillStyle(color, 1);
  g.fillCircle(24, 20, 12);
  g.fillStyle(0xfff8d0, 0.9);
  g.fillCircle(24, 18, 7);
  g.fillStyle(0xffffff, 0.65);
  g.fillCircle(22, 15, 3);
  g.fillStyle(color, 0.35);
  g.fillCircle(24, 20, 18);
  drawEyes(g, 20, 22, 16, 2);
}

function drawIsleFernling(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 34, 18, 12, shade(color, -25));
  blob(g, 24, 24, 16, 16, color);
  for (const [x, tipY] of [
    [16, 6],
    [24, 2],
    [32, 6],
  ] as const) {
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(x, tipY, x - 6, 22, x + 6, 22);
    g.fillStyle(shade(color, 35), 1);
    g.fillTriangle(x, tipY + 2, x - 4, 20, x + 4, 20);
  }
  g.fillStyle(0xa8e868, 0.85);
  g.fillCircle(20, 14, 3);
  g.fillCircle(28, 12, 2);
  drawEyes(g, 20, 28, 22);
}

function drawSaltScuttle(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(12, 40, 8, 5);
  g.fillEllipse(36, 40, 8, 5);
  g.fillStyle(shade(color, -30), 1);
  g.fillEllipse(12, 39, 6, 3);
  g.fillEllipse(36, 39, 6, 3);
  blob(g, 24, 30, 28, 16, color);
  blob(g, 24, 20, 20, 14, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(8, 18, 6, 14, 2);
  g.fillRoundedRect(34, 18, 6, 14, 2);
  g.fillStyle(shade(color, -15), 1);
  g.fillRoundedRect(9, 19, 4, 12, 1);
  g.fillRoundedRect(35, 19, 4, 12, 1);
  g.fillStyle(0xf0e8d0, 0.7);
  g.fillCircle(18, 26, 2);
  g.fillCircle(30, 28, 2);
  drawEyes(g, 20, 28, 18);
}

function drawShoalWisp(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.3);
  g.fillEllipse(24, 42, 26, 8);
  blob(g, 24, 26, 22, 22, color);
  g.fillStyle(shade(color, 50), 0.9);
  g.fillCircle(24, 22, 9);
  g.fillStyle(0xe8ffff, 0.95);
  g.fillCircle(24, 18, 5);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(14, 36, 10, 48, 20, 42);
  g.fillTriangle(34, 36, 38, 48, 28, 42);
  g.fillStyle(shade(color, 20), 0.85);
  g.fillTriangle(15, 37, 12, 46, 19, 41);
  g.fillTriangle(33, 37, 36, 46, 29, 41);
  drawEyes(g, 20, 28, 20, 3);
}

function drawTideUrchin(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 28, 18, 16, color);
  for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const rad = (angle * Math.PI) / 180;
    const x = 24 + Math.cos(rad) * 14;
    const y = 28 + Math.sin(rad) * 12;
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(24, 28, x - 2, y, x + 2, y);
    g.fillStyle(shade(color, 30), 1);
    g.fillTriangle(24, 28, x - 1, y - 1, x + 1, y - 1);
  }
  drawEyes(g, 20, 28, 26, 2.5);
}

function drawCoralSkitter(g: Phaser.GameObjects.Graphics, color: number): void {
  for (const [x, y] of [
    [12, 38],
    [20, 40],
    [28, 40],
    [36, 38],
  ] as const) {
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(x, y, 5, 3);
    g.fillStyle(shade(color, -25), 1);
    g.fillEllipse(x, y - 1, 3, 2);
  }
  blob(g, 24, 26, 22, 14, color);
  g.fillStyle(shade(color, 40), 1);
  g.fillCircle(18, 22, 3);
  g.fillCircle(30, 20, 4);
  drawEyes(g, 20, 28, 24);
}

function drawDriftKelpie(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 30, 20, 16, shade(color, -20));
  blob(g, 24, 20, 16, 14, color);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(10, 18, 4, 34, 16, 28);
  g.fillTriangle(38, 18, 44, 34, 32, 28);
  g.fillStyle(shade(color, 25), 1);
  g.fillTriangle(11, 19, 7, 30, 15, 26);
  g.fillTriangle(37, 19, 41, 30, 33, 26);
  g.fillStyle(0xa8e8c0, 0.7);
  g.fillCircle(20, 16, 2);
  drawEyes(g, 20, 28, 18);
}

function drawDuneHermit(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(24, 34, 26, 16);
  g.fillStyle(color, 1);
  g.fillEllipse(24, 33, 22, 13);
  g.fillStyle(shade(color, 35), 1);
  g.fillEllipse(24, 30, 12, 8);
  blob(g, 24, 20, 14, 12, shade(color, -15));
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(14, 36, 4, 10, 1);
  g.fillRoundedRect(30, 36, 4, 10, 1);
  drawEyes(g, 20, 28, 18, 2.5);
}

function drawBrackishNewt(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 32, 24, 12, shade(color, -20));
  blob(g, 24, 24, 16, 14, color);
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(38, 30, 14, 6);
  g.fillStyle(shade(color, 10), 1);
  g.fillEllipse(37, 29, 11, 4);
  g.fillStyle(0x90b878, 0.8);
  g.fillCircle(18, 22, 2);
  g.fillCircle(26, 20, 2);
  drawEyes(g, 18, 26, 22, 2.5);
}

function drawPearlMoth(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(12, 22, 16, 22);
  g.fillEllipse(36, 22, 16, 22);
  g.fillStyle(color, 1);
  g.fillEllipse(12, 22, 13, 18);
  g.fillEllipse(36, 22, 13, 18);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(10, 18, 4);
  g.fillCircle(38, 18, 4);
  blob(g, 24, 28, 10, 14, shade(color, -40));
  drawEyes(g, 21, 27, 26, 2);
}

function drawReefSpinner(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 28, 20, 16, color);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(24, 26, 8);
  g.fillStyle(shade(color, 40), 1);
  g.fillCircle(24, 26, 6);
  g.fillStyle(0xe0ffff, 0.9);
  g.fillCircle(24, 24, 3);
  for (const [x, y] of [
    [10, 20],
    [38, 20],
    [12, 36],
    [36, 36],
  ] as const) {
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(24, 26, x, y - 3, x, y + 3);
  }
  drawEyes(g, 20, 28, 34, 2);
}

function drawMistAnemone(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 34, 18, 12, shade(color, -25));
  for (const [x, tipY] of [
    [14, 8],
    [24, 4],
    [34, 8],
    [18, 14],
    [30, 14],
  ] as const) {
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(x, tipY, x - 4, 30, x + 4, 30);
    g.fillStyle(shade(color, 30), 0.85);
    g.fillTriangle(x, tipY + 2, x - 3, 28, x + 3, 28);
  }
  drawEyes(g, 20, 28, 36, 2.5);
}

function drawBarnacleToad(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 34, 26, 14, shade(color, -20));
  blob(g, 24, 24, 22, 16, color);
  for (const [x, y] of [
    [16, 22],
    [24, 18],
    [32, 24],
  ] as const) {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(x, y, 4);
    g.fillStyle(shade(color, 25), 1);
    g.fillCircle(x, y, 2.5);
  }
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(14, 40, 8, 5);
  g.fillEllipse(34, 40, 8, 5);
  drawEyes(g, 18, 30, 28);
}

function drawGulfLantern(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(22, 34, 4, 12, 1);
  g.fillStyle(shade(color, -30), 1);
  g.fillRoundedRect(23, 35, 2, 10, 1);
  blob(g, 24, 20, 20, 20, color);
  g.fillStyle(0xfff0c0, 0.9);
  g.fillCircle(24, 18, 8);
  g.fillStyle(color, 0.35);
  g.fillCircle(24, 20, 16);
  drawEyes(g, 20, 28, 22, 2.5);
}

function drawSprayFinch(g: Phaser.GameObjects.Graphics, color: number): void {
  blob(g, 24, 28, 18, 14, color);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(34, 24, 44, 20, 34, 30);
  g.fillStyle(shade(color, 20), 1);
  g.fillTriangle(35, 24, 41, 21, 35, 28);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(18, 18, 24, 6, 30, 18);
  g.fillStyle(shade(color, 40), 1);
  g.fillTriangle(20, 17, 24, 9, 28, 17);
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(16, 36, 6, 4);
  g.fillEllipse(30, 36, 6, 4);
  drawEyes(g, 20, 26, 26, 2.5);
}

function drawLagoonHare(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(16, 10, 8, 18);
  g.fillEllipse(32, 10, 8, 18);
  g.fillStyle(shade(color, 20), 1);
  g.fillEllipse(16, 10, 5, 14);
  g.fillEllipse(32, 10, 5, 14);
  blob(g, 24, 30, 22, 16, color);
  blob(g, 24, 20, 16, 14, shade(color, 15));
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(14, 40, 6, 4);
  g.fillEllipse(34, 40, 6, 4);
  drawEyes(g, 20, 28, 20);
}

function drawAtollWisp(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.25);
  g.fillCircle(24, 26, 20);
  blob(g, 24, 26, 16, 16, color);
  g.fillStyle(0xe8ffff, 0.95);
  g.fillCircle(24, 22, 6);
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(24, 40, 18, 5);
  g.fillStyle(shade(color, 20), 0.7);
  g.fillEllipse(24, 39, 14, 3);
  drawEyes(g, 20, 28, 26, 2.5);
}

function drawTideSovereign(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 35), 0.25);
  g.fillCircle(24, 26, 22);
  blob(g, 24, 31, 27, 25, color);
  blob(g, 24, 22, 22, 19, shade(color, 18));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(10, 18, 16, 5, 21, 18);
  g.fillTriangle(19, 17, 24, 2, 29, 17);
  g.fillTriangle(27, 18, 34, 5, 39, 19);
  g.fillStyle(0x63e6dc, 1);
  g.fillCircle(16, 15, 2);
  g.fillCircle(24, 11, 2);
  g.fillCircle(34, 15, 2);
  g.fillStyle(shade(color, -28), 1);
  g.fillTriangle(13, 38, 5, 48, 19, 42);
  g.fillTriangle(35, 38, 43, 48, 29, 42);
  drawEyes(g, 19, 29, 25, 3);
}

function drawCairnSovereign(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 20), 0.22);
  g.fillEllipse(24, 46, 28, 8);
  blob(g, 24, 34, 26, 22, color);
  blob(g, 24, 22, 20, 16, shade(color, 18));
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(16, 6, 16, 10, 2);
  g.fillRoundedRect(19, 2, 10, 8, 2);
  g.fillStyle(shade(color, 30), 1);
  g.fillRoundedRect(17, 7, 14, 8, 1);
  g.fillStyle(0xc8d0b0, 0.85);
  g.fillCircle(20, 8, 1.5);
  g.fillCircle(28, 9, 1.5);
  g.fillStyle(0x5a8a48, 0.8);
  g.fillCircle(14, 28, 2);
  g.fillCircle(34, 30, 2);
  g.fillStyle(shade(color, -28), 1);
  g.fillTriangle(12, 40, 6, 50, 18, 44);
  g.fillTriangle(36, 40, 42, 50, 30, 44);
  drawEyes(g, 19, 29, 24, 3);
}

function drawHorizonSovereign(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.22);
  g.fillCircle(24, 26, 22);
  blob(g, 24, 32, 26, 22, color);
  blob(g, 24, 20, 20, 16, shade(color, 20));
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(12, 16, 18, 4, 24, 16);
  g.fillTriangle(24, 16, 30, 2, 36, 16);
  g.fillStyle(0x63e6dc, 0.85);
  g.fillCircle(16, 14, 2);
  g.fillStyle(0xc8d0b0, 0.85);
  g.fillCircle(32, 13, 2);
  g.fillStyle(shade(color, -24), 1);
  g.fillTriangle(10, 38, 4, 50, 18, 44);
  g.fillTriangle(38, 38, 44, 50, 30, 44);
  drawEyes(g, 19, 29, 22, 3);
}

function drawEclipseSovereign(g: Phaser.GameObjects.Graphics, color: number): void {
  g.fillStyle(shade(color, 40), 0.28);
  g.fillCircle(24, 26, 22);
  blob(g, 24, 32, 26, 22, color);
  blob(g, 24, 20, 20, 16, shade(color, 16));
  g.fillStyle(0xffedb0, 0.55);
  g.fillCircle(24, 18, 10);
  g.fillStyle(color, 1);
  g.fillCircle(28, 16, 9);
  g.fillStyle(OUTLINE, 1);
  g.fillTriangle(12, 16, 18, 4, 24, 16);
  g.fillTriangle(24, 16, 30, 2, 36, 16);
  g.fillStyle(0x63e6dc, 0.7);
  g.fillCircle(16, 14, 2);
  g.fillStyle(0xc8d0b0, 0.7);
  g.fillCircle(32, 13, 2);
  g.fillStyle(shade(color, -24), 1);
  g.fillTriangle(10, 38, 4, 50, 18, 44);
  g.fillTriangle(38, 38, 44, 50, 30, 44);
  drawEyes(g, 19, 29, 22, 3);
}

const CREATURE_DRAWERS: Record<string, CreatureDrawer> = {
  mossling: drawMossling,
  "ember-wisp": drawEmberWisp,
  "brook-nymph": drawBrookNymph,
  "stone-hound": drawStoneHound,
  "mist-serpent": drawMistSerpent,
  rootwalker: drawRootwalker,
  "lantern-fox": drawLanternFox,
  "thunder-finch": drawThunderFinch,
  bramblewarden: drawBramblewarden,
  hearthflame: drawHearthflame,
  "peat-sprite": drawPeatSprite,
  "cinder-toad": drawCinderToad,
  "bog-lantern": drawBogLantern,
  "isle-fernling": drawIsleFernling,
  "salt-scuttle": drawSaltScuttle,
  "shoal-wisp": drawShoalWisp,
  "tide-urchin": drawTideUrchin,
  "coral-skitter": drawCoralSkitter,
  "drift-kelpie": drawDriftKelpie,
  "dune-hermit": drawDuneHermit,
  "brackish-newt": drawBrackishNewt,
  "pearl-moth": drawPearlMoth,
  "reef-spinner": drawReefSpinner,
  "mist-anemone": drawMistAnemone,
  "barnacle-toad": drawBarnacleToad,
  "gulf-lantern": drawGulfLantern,
  "spray-finch": drawSprayFinch,
  "lagoon-hare": drawLagoonHare,
  "atoll-wisp": drawAtollWisp,
  "tide-sovereign": drawTideSovereign,
  "cairn-sovereign": drawCairnSovereign,
  "horizon-sovereign": drawHorizonSovereign,
  "eclipse-sovereign": drawEclipseSovereign,
};

export function ensureCreatureTextures(scene: Phaser.Scene): void {
  for (const creature of CREATURES) {
    // Prefer Imagine art (atlas frame or standalone PNG); procedural only as
    // fallback.
    if (hasWorldTexture(scene, creature.spriteKey)) {
      continue;
    }
    // Late-game PNG not fetched yet (#410): leave the key free so the scene
    // that shows it can still load the real art; a failed fetch draws here.
    if (isLateImagePending(scene.textures, creature.spriteKey)) {
      continue;
    }

    const g = scene.make.graphics({ x: 0, y: 0 });
    drawShadow(g);
    const draw = CREATURE_DRAWERS[creature.id];
    if (draw) {
      draw(g, creature.spriteColor);
    } else {
      g.fillStyle(creature.spriteColor, 1);
      g.fillCircle(SPRITE_WIDTH / 2, SPRITE_HEIGHT / 2 - 4, 14);
    }
    g.generateTexture(creature.spriteKey, SPRITE_WIDTH, SPRITE_HEIGHT);
    g.destroy();
  }
}
