/**
 * Eclipse boons (#420): a seeded 1-of-3 pick between rounds. `mend` acts at
 * once on the trial's HP; every other boon shapes the NEXT round only, so
 * each pick is a read of what is coming (the next round's modifiers are
 * shown on the same screen).
 */
export type BoonId =
  | "mend"
  | "swift-swap"
  | "quickened"
  | "moon-shield"
  | "pure-light"
  | "keen-edge";

export type BoonDefinition = {
  id: BoonId;
  name: string;
  summary: string;
  glyph: string;
  color: string;
};

/** Mend: share of max HP restored to every companion (fainted ones get up). */
export const MEND_FRACTION = 0.3;
/** Keen Edge: outgoing damage multiplier next round. */
export const KEEN_EDGE_DAMAGE = 1.1;
/** Moon Shield: share of incoming damage that still lands next round. */
export const MOON_SHIELD_TAKEN = 0.85;

export const BOONS: Readonly<Record<BoonId, BoonDefinition>> = {
  mend: {
    id: "mend",
    name: "Moonlit Mend",
    summary: `Heal every companion ${Math.round(MEND_FRACTION * 100)}% max HP — the fainted get back up.`,
    glyph: "+",
    color: "#9af0b0",
  },
  "swift-swap": {
    id: "swift-swap",
    name: "Swift Swap",
    summary: "Next round: one extra free switch (2 in all).",
    glyph: "⇄",
    color: "#8fd3f0",
  },
  quickened: {
    id: "quickened",
    name: "Quickened",
    summary: "Next round: your finishers start ready (cooldown refund).",
    glyph: "!",
    color: "#ff7a5c",
  },
  "moon-shield": {
    id: "moon-shield",
    name: "Moon Shield",
    summary: `Next round: your companions take ${Math.round((1 - MOON_SHIELD_TAKEN) * 100)}% less damage.`,
    glyph: "◈",
    color: "#7ec8e8",
  },
  "pure-light": {
    id: "pure-light",
    name: "Pure Light",
    summary: "Next round: no entry statuses for you, and you shed statuses after each turn.",
    glyph: "✧",
    color: "#fff0b0",
  },
  "keen-edge": {
    id: "keen-edge",
    name: "Keen Edge",
    summary: `Next round: your companions deal +${Math.round((KEEN_EDGE_DAMAGE - 1) * 100)}% damage.`,
    glyph: "↑",
    color: "#ffd27a",
  },
};

export const BOON_IDS = Object.keys(BOONS) as BoonId[];

export function isBoonId(value: unknown): value is BoonId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BOONS, value);
}

/**
 * A boon as the round it shapes describes it (#423): the pick screen says
 * "Next round: ...", the round itself just says what it does.
 */
export function boonThisRoundText(id: BoonId): string {
  const text = BOONS[id].summary.replace(/^Next round:\s*/, "");
  return `${BOONS[id].name}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
