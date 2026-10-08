import { drawCreatureArt, drawSparkle, fitText, roundRect, CARD_HEIGHT, CARD_WIDTH } from "../share/companionCard";
import type { ShareCreature } from "../share/shareCode";
import type { SpriteLookup } from "../share/spriteSource";
import { MODIFIERS, type ModifierId } from "./modifiers";
import { formatTrialDay, type TrialDay } from "./trialSeed";

/**
 * Trial Result card (#420): 1080x1350 PNG in the Companion Card's format —
 * offscreen canvas, every string through fillText. Date seed, score, title,
 * the five rounds with their modifier icons, and the party's sprites.
 */

export type TrialCardData = {
  name: string;
  day: TrialDay;
  score: number;
  title: string;
  roundsCleared: number;
  /** Every round's modifiers (all five; unreached rounds draw dim). */
  rounds: readonly (readonly ModifierId[])[];
  party: readonly { id: string; rare: boolean }[];
};

const INK = "#0b0714";
const VIOLET = "#b48cff";
const EMBER = "#ff9a4a";
const GOLD = "#ffd27a";
const CREAM = "#fff4e8";
const MUTED = "#d8c8e8";
const SERIF = 'Fraunces, Georgia, "Times New Roman", serif';
const SANS = '"Source Sans 3", "Helvetica Neue", Arial, sans-serif';

function rngFor(seed: string): () => number {
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

function spacing(ctx: CanvasRenderingContext2D, px: string): void {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = px;
  }
}

function drawSky(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bg.addColorStop(0, "#241238");
  bg.addColorStop(0.55, "#140a22");
  bg.addColorStop(1, INK);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(255, 244, 232, ${0.15 + rng() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rng() * CARD_WIDTH, rng() * CARD_HEIGHT * 0.7, 1 + rng() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The eclipse: ember corona, violet rim, a dark disc.
  const cx = 860;
  const cy = 250;
  const corona = ctx.createRadialGradient(cx, cy, 90, cx, cy, 300);
  corona.addColorStop(0, "rgba(255, 154, 74, 0.75)");
  corona.addColorStop(0.35, "rgba(200, 122, 255, 0.35)");
  corona.addColorStop(1, "rgba(180, 140, 255, 0)");
  ctx.fillStyle = corona;
  ctx.fillRect(cx - 320, cy - 320, 640, 640);
  ctx.fillStyle = "#07040c";
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 210, 122, 0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Round medallions with their modifier icons; the boss is the diamond. */
function drawRounds(ctx: CanvasRenderingContext2D, data: TrialCardData, top: number): void {
  const count = data.rounds.length;
  const gap = 34;
  const size = 150;
  const total = count * size + (count - 1) * gap;
  let x = (CARD_WIDTH - total) / 2;
  data.rounds.forEach((mods, i) => {
    const boss = i === count - 1;
    const cleared = i < data.roundsCleared;
    const fell = i === data.roundsCleared && data.roundsCleared < count;
    const cx = x + size / 2;
    const cy = top + 52;
    ctx.save();
    ctx.translate(cx, cy);
    if (boss) {
      ctx.rotate(Math.PI / 4);
    }
    roundRect(ctx, -42, -42, 84, 84, boss ? 12 : 42);
    ctx.fillStyle = cleared ? GOLD : fell ? "#7a2f3a" : "#3a2c52";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = cleared ? "#fff0c0" : fell ? EMBER : "#5a4a78";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = cleared ? INK : CREAM;
    ctx.font = `800 34px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(boss ? "★" : String(i + 1), cx, cy + 2);
    // Modifier icons under the medallion.
    const iconR = 20;
    const iconsW = mods.length * iconR * 2 + (mods.length - 1) * 8;
    let ix = cx - iconsW / 2 + iconR;
    for (const id of mods) {
      const def = MODIFIERS[id];
      ctx.globalAlpha = cleared || fell ? 1 : 0.45;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(ix, cy + 82, iconR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = `800 22px ${SANS}`;
      ctx.fillText(def.glyph, ix, cy + 84);
      ctx.globalAlpha = 1;
      ix += iconR * 2 + 8;
    }
    x += size + gap;
  });
  ctx.textBaseline = "alphabetic";
}

export function renderTrialCard(data: TrialCardData, lookup: SpriteLookup, siteLabel: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D unavailable");
  }
  const rng = rngFor(`${data.name}|${data.day}|${data.score}`);
  drawSky(ctx, rng);

  ctx.textAlign = "left";
  ctx.fillStyle = EMBER;
  ctx.font = `700 26px ${SANS}`;
  spacing(ctx, "8px");
  ctx.fillText("IVYWARD · ECLIPSE TRIAL", 72, 108);
  spacing(ctx, "0px");
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(formatTrialDay(data.day), 72, 156);

  ctx.fillStyle = GOLD;
  let size = 92;
  do {
    ctx.font = `700 ${size}px ${SERIF}`;
    size -= 4;
  } while (size > 48 && ctx.measureText(data.title).width > CARD_WIDTH - 144);
  ctx.fillText(fitText(ctx, data.title, CARD_WIDTH - 144), 70, 470);
  ctx.fillStyle = CREAM;
  ctx.font = `600 40px ${SERIF}`;
  ctx.fillText(fitText(ctx, `${data.name}'s run`, CARD_WIDTH - 144), 72, 536);

  ctx.font = `800 150px ${SANS}`;
  ctx.fillStyle = CREAM;
  ctx.fillText(data.score.toLocaleString("en-US"), 66, 700);
  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = VIOLET;
  const total = data.rounds.length;
  ctx.fillText(
    data.roundsCleared >= total ? "All five rounds cleared" : `${data.roundsCleared} of ${total} rounds cleared`,
    74,
    752,
  );
  for (let i = 0; i < 4; i += 1) {
    drawSparkle(ctx, 620 + rng() * 380, 560 + rng() * 160, 8 + rng() * 10, i % 2 ? GOLD : VIOLET);
  }

  drawRounds(ctx, data, 790);

  // The party that ran it.
  const party = data.party.slice(0, 5);
  const slot = 190;
  const baseY = 1200;
  const startX = (CARD_WIDTH - party.length * slot) / 2 + slot / 2;
  party.forEach((member, i) => {
    const creature: ShareCreature = { id: member.id, level: 1, rare: member.rare, evolved: false, presence: false, bond: null };
    drawCreatureArt(ctx, creature, lookup, startX + i * slot, baseY, slot - 20, rng);
  });

  const footY = CARD_HEIGHT - 56;
  ctx.textAlign = "left";
  ctx.fillStyle = CREAM;
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText("Beat my score on today's Eclipse Trial", 72, footY);
  ctx.textAlign = "right";
  ctx.fillStyle = VIOLET;
  ctx.font = `700 24px ${SANS}`;
  ctx.fillText(fitText(ctx, siteLabel, 300), CARD_WIDTH - 72, footY);
  return canvas;
}
