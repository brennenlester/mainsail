import { getCreatureDefinition } from "../creatures/catalog";
import { rareHueShift } from "./rareVariant";
import {
  formatShareDay,
  SHARE_BOND_MAX,
  type ShareCreature,
  type ShareSnapshot,
} from "./shareCode";
import { BOND_TIER_NAMES } from "../companions/bond";
import type { SpriteCrop, SpriteLookup } from "./spriteSource";

/**
 * Companion Card renderer (#368). Draws on an offscreen 2D canvas — no DOM
 * insertion, and every string goes through fillText (never HTML).
 * 1080×1350 (4:5) reads well in phone feeds and chat previews.
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const NAVY_DEEP = "#0d1a2e";
const NAVY = "#1a3048";
const CREAM = "#fff8ec";
const CREAM_MUTED = "#e8d8c0";
const GOLD = "#f0c878";
const TEAL = "#6eb8a8";
const RARE = "#d4b0ff";
const SERIF = 'Fraunces, Georgia, "Times New Roman", serif';
const SANS = '"Source Sans 3", "Helvetica Neue", Arial, sans-serif';

const BOND_HEARTS = SHARE_BOND_MAX;

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) {
    chars.pop();
  }
  return `${chars.join("")}…`;
}

function creatureName(id: string): string {
  try {
    return getCreatureDefinition(id).name;
  } catch {
    return "Unknown";
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

/** Hue-rotate a sprite for the rare variant; falls back to a hue blend. */
function rareSprite(crop: SpriteCrop, creatureId: string): CanvasImageSource {
  const canvas = makeCanvas(crop.sw, crop.sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return crop.image;
  }
  const shift = rareHueShift(creatureId);
  const filter = `hue-rotate(${shift}deg) saturate(1.25)`;
  ctx.filter = filter;
  if (ctx.filter === filter) {
    ctx.drawImage(crop.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
    return canvas;
  }
  // Safari < 18 lacks ctx.filter: paint a uniform hue over the art instead.
  ctx.filter = "none";
  ctx.drawImage(crop.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
  ctx.globalCompositeOperation = "hue";
  ctx.fillStyle = `hsl(${shift}, 70%, 55%)`;
  ctx.fillRect(0, 0, crop.sw, crop.sh);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(crop.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
  return canvas;
}

const trimCache = new WeakMap<CanvasImageSource, Map<string, SpriteCrop>>();

/**
 * Crop transparent padding so every companion fills its slot evenly (atlas
 * frames carry generous margins). Falls back to the raw crop if the pixels
 * cannot be read.
 */
function trimCrop(crop: SpriteCrop): SpriteCrop {
  const key = `${crop.sx},${crop.sy},${crop.sw},${crop.sh}`;
  let perImage = trimCache.get(crop.image);
  const cached = perImage?.get(key);
  if (cached) return cached;
  let result = crop;
  try {
    const canvas = makeCanvas(crop.sw, crop.sh);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(crop.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[(y * width + x) * 4 + 3] > 12) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        result = {
          image: canvas,
          sx: minX,
          sy: minY,
          sw: maxX - minX + 1,
          sh: maxY - minY + 1,
        };
      }
    }
  } catch {
    result = crop;
  }
  if (!perImage) {
    perImage = new Map();
    trimCache.set(crop.image, perImage);
  }
  perImage.set(key, result);
  return result;
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, filled: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 20, s / 20);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-10, -2, -6, -11, 0, -5);
  ctx.bezierCurveTo(6, -11, 10, -2, 0, 6);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = "#f08a8a";
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(255, 248, 236, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Bond hearts (real bond tier from #367). v1 links carry no bond: draw nothing. */
function drawBond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hearts: number | null, align: "left" | "center"): void {
  if (hearts === null) {
    return;
  }
  const gap = size * 1.25;
  const total = gap * (BOND_HEARTS - 1);
  const start = align === "center" ? x - total / 2 : x + size / 2;
  for (let i = 0; i < BOND_HEARTS; i += 1) {
    drawHeart(ctx, start + i * gap, y, size, i < hearts);
  }
}

/** Tier name for a heart count (hearts = tier + 1), e.g. 4 → "Devoted". */
export function bondLabel(hearts: number | null): string {
  if (hearts === null || hearts < 1) {
    return "";
  }
  return BOND_TIER_NAMES[Math.min(BOND_TIER_NAMES.length, hearts) - 1] ?? "";
}

/** Pill tags for rare / evolved / presence, left- or centre-aligned. */
function drawTags(
  ctx: CanvasRenderingContext2D,
  creature: ShareCreature,
  x: number,
  y: number,
  fontSize: number,
  align: "left" | "center",
): void {
  const tags: { label: string; color: string }[] = [];
  if (creature.rare) tags.push({ label: "✦ Rare", color: RARE });
  if (creature.evolved) tags.push({ label: "Evolved", color: GOLD });
  if (creature.presence) tags.push({ label: "Presence", color: TEAL });
  if (tags.length === 0) return;
  ctx.font = `700 ${fontSize}px ${SANS}`;
  const padX = fontSize * 0.7;
  const h = fontSize * 1.7;
  const gap = fontSize * 0.5;
  const widths = tags.map((t) => ctx.measureText(t.label).width + padX * 2);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (tags.length - 1);
  let cx = align === "center" ? x - total / 2 : x;
  tags.forEach((tag, i) => {
    roundRect(ctx, cx, y - h / 2, widths[i], h, h / 2);
    ctx.fillStyle = "rgba(13, 26, 46, 0.55)";
    ctx.fill();
    ctx.strokeStyle = tag.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = tag.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tag.label, cx + padX, y + 1);
    cx += widths[i] + gap;
  });
}

function drawCreatureArt(
  ctx: CanvasRenderingContext2D,
  creature: ShareCreature,
  lookup: SpriteLookup,
  cx: number,
  baseY: number,
  box: number,
  rng: () => number,
): void {
  // Moonlit glow pool behind the companion.
  const glow = ctx.createRadialGradient(cx, baseY - box * 0.45, 0, cx, baseY - box * 0.45, box * 0.7);
  glow.addColorStop(0, creature.rare ? "rgba(212, 176, 255, 0.35)" : "rgba(240, 200, 120, 0.22)");
  glow.addColorStop(1, "rgba(240, 200, 120, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - box, baseY - box * 1.2, box * 2, box * 1.4);

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 4, box * 0.34, box * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  const raw = lookup(creature.id);
  const crop = raw ? trimCrop(raw) : null;
  if (!crop) {
    ctx.fillStyle = "rgba(255, 248, 236, 0.2)";
    ctx.beginPath();
    ctx.arc(cx, baseY - box / 2, box * 0.32, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const scale = Math.min(box / crop.sw, box / crop.sh);
  const w = crop.sw * scale;
  const h = crop.sh * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (creature.rare) {
    ctx.drawImage(rareSprite(crop, creature.id), cx - w / 2, baseY - h, w, h);
    for (let i = 0; i < 5; i += 1) {
      const sx = cx + (rng() - 0.5) * box * 0.95;
      const sy = baseY - h * (0.2 + rng() * 0.85);
      drawSparkle(ctx, sx, sy, box * (0.03 + rng() * 0.035), i % 2 ? CREAM : RARE);
    }
  } else {
    ctx.drawImage(crop.image, crop.sx, crop.sy, crop.sw, crop.sh, cx - w / 2, baseY - h, w, h);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bg.addColorStop(0, NAVY);
  bg.addColorStop(1, NAVY_DEEP);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Moon halo, top right.
  const moon = ctx.createRadialGradient(900, 150, 10, 900, 150, 420);
  moon.addColorStop(0, "rgba(255, 248, 236, 0.16)");
  moon.addColorStop(1, "rgba(255, 248, 236, 0)");
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  for (let i = 0; i < 90; i += 1) {
    const x = rng() * CARD_WIDTH;
    const y = rng() * CARD_HEIGHT;
    ctx.fillStyle = `rgba(255, 248, 236, ${0.15 + rng() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rng() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ivy silhouette along the bottom.
  ctx.fillStyle = "rgba(110, 184, 168, 0.10)";
  for (let i = 0; i < 26; i += 1) {
    const x = (i / 25) * CARD_WIDTH;
    const r = 30 + rng() * 50;
    ctx.beginPath();
    ctx.ellipse(x, CARD_HEIGHT + 10, r, r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Double gold frame.
  ctx.strokeStyle = "rgba(240, 200, 120, 0.85)";
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48, 28);
  ctx.stroke();
  ctx.strokeStyle = "rgba(240, 200, 120, 0.3)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 36, 36, CARD_WIDTH - 72, CARD_HEIGHT - 72, 20);
  ctx.stroke();
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rare: boolean): void {
  roundRect(ctx, x, y, w, h, 22);
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, "rgba(255, 248, 236, 0.09)");
  fill.addColorStop(1, "rgba(255, 248, 236, 0.03)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rare ? "rgba(212, 176, 255, 0.7)" : "rgba(240, 200, 120, 0.28)";
  ctx.lineWidth = rare ? 2.5 : 1.5;
  ctx.stroke();
}

function drawHero(ctx: CanvasRenderingContext2D, creature: ShareCreature, lookup: SpriteLookup, rng: () => number): void {
  const x = 64;
  const y = 236;
  const w = CARD_WIDTH - 128;
  const h = 390;
  drawPanel(ctx, x, y, w, h, creature.rare);
  drawCreatureArt(ctx, creature, lookup, x + 240, y + h - 36, 320, rng);

  const tx = x + 500;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText("LEAD COMPANION", tx, y + 76);
  ctx.fillStyle = CREAM;
  const name = creatureName(creature.id);
  let size = 56;
  do {
    ctx.font = `700 ${size}px ${SERIF}`;
    size -= 2;
  } while (size >= 36 && ctx.measureText(name).width > w - 470);
  ctx.fillText(fitText(ctx, name, w - 470), tx, y + 144);
  ctx.fillStyle = GOLD;
  ctx.font = `700 40px ${SERIF}`;
  ctx.fillText(`Lv ${creature.level}`, tx, y + 198);
  drawTags(ctx, creature, tx, y + 250, 22, "left");
  ctx.fillStyle = CREAM_MUTED;
  ctx.font = `600 20px ${SANS}`;
  if (creature.bond !== null) {
    ctx.fillText("BOND", tx, y + 318);
    drawBond(ctx, tx + 70, y + 312, 26, creature.bond, "left");
    const label = bondLabel(creature.bond);
    if (label) {
      ctx.fillStyle = CREAM_MUTED;
      ctx.font = `600 italic 22px ${SERIF}`;
      ctx.fillText(label, tx + 70 + 26 * 1.25 * (BOND_HEARTS - 1) + 48, y + 320);
    }
  }
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  creature: ShareCreature | undefined,
  lookup: SpriteLookup,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: () => number,
): void {
  if (!creature) {
    roundRect(ctx, x, y, w, h, 22);
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = "rgba(255, 248, 236, 0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 248, 236, 0.22)";
    ctx.font = `600 22px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("an open path", x + w / 2, y + h / 2);
    return;
  }
  drawPanel(ctx, x, y, w, h, creature.rare);
  const cx = x + w / 2;
  drawCreatureArt(ctx, creature, lookup, cx, y + 150, 132, rng);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CREAM;
  ctx.font = `700 28px ${SERIF}`;
  ctx.fillText(fitText(ctx, creatureName(creature.id), w - 28), cx, y + 188);
  // "Lv 9  ♥♥♡♡♡" on one line keeps room for tags below.
  ctx.font = `700 22px ${SANS}`;
  const lv = `Lv ${creature.level}`;
  const heart = 16;
  const lvWidth = ctx.measureText(lv).width;
  const bondWidth = creature.bond === null ? -14 : heart * 1.25 * (BOND_HEARTS - 1) + heart;
  const startX = cx - (lvWidth + 14 + bondWidth) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.fillText(lv, startX, y + 220);
  drawBond(ctx, startX + lvWidth + 14, y + 213, heart, creature.bond, "left");
  drawTags(ctx, creature, cx, y + 250, 15, "center");
}

/** Render the card to a fresh canvas. Fonts should be loaded first. */
export function renderCompanionCard(
  snapshot: ShareSnapshot,
  lookup: SpriteLookup,
  siteLabel: string,
): HTMLCanvasElement {
  const canvas = makeCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D unavailable");
  }
  const rng = seededRandom(`${snapshot.name}|${snapshot.day}|${snapshot.party.map((c) => c.id).join()}`);
  drawBackground(ctx, rng);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `700 26px ${SANS}`;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px";
  }
  ctx.fillText("IVYWARD", 72, 108);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  }
  ctx.textAlign = "right";
  ctx.fillStyle = CREAM_MUTED;
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText(formatShareDay(snapshot.day), CARD_WIDTH - 72, 106);

  ctx.textAlign = "left";
  ctx.fillStyle = CREAM;
  // Shrink long names to fit rather than truncating the heading.
  const heading = `${snapshot.name}'s companions`;
  let headingSize = 68;
  do {
    ctx.font = `700 ${headingSize}px ${SERIF}`;
    headingSize -= 2;
  } while (headingSize >= 34 && ctx.measureText(heading).width > CARD_WIDTH - 144);
  ctx.fillText(fitText(ctx, heading, CARD_WIDTH - 144), 70, 190);

  const [lead, ...rest] = snapshot.party;
  if (lead) {
    drawHero(ctx, lead, lookup, rng);
  }

  // Six follower slots (3×2); empty ones read as "an open path".
  const cols = 3;
  const gap = 20;
  const gx = 64;
  const gy = 650;
  const cw = (CARD_WIDTH - 128 - gap * (cols - 1)) / cols;
  const cellH = 278;
  for (let i = 0; i < cols * 2; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawSlot(ctx, rest[i], lookup, gx + col * (cw + gap), gy + row * (cellH + gap), cw, cellH, rng);
  }

  // Footer call to action.
  const footY = CARD_HEIGHT - 78;
  ctx.textAlign = "left";
  ctx.fillStyle = CREAM;
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText("Think you can beat my party?", 72, footY);
  ctx.textAlign = "right";
  ctx.fillStyle = TEAL;
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText(fitText(ctx, siteLabel, 420), CARD_WIDTH - 72, footY);
  return canvas;
}

/** Wait (briefly) for the brand fonts so the first card is not drawn in Georgia. */
export async function loadCardFonts(timeoutMs = 2500): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return;
  }
  const loads = Promise.all([
    document.fonts.load(`700 68px Fraunces`),
    document.fonts.load(`600 30px Fraunces`),
    document.fonts.load(`700 24px "Source Sans 3"`),
  ]).then(() => undefined);
  await Promise.race([
    loads.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Card export failed"));
      }
    }, "image/png");
  });
}
