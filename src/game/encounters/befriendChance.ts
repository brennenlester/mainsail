/**
 * Befriend odds as a decision (#366). Pure: no Phaser, no game state.
 *
 * Additive percentage-point terms, clamped to [BEFRIEND_MIN, BEFRIEND_MAX].
 * Every non-zero term becomes one readable breakdown line, so the odds pill
 * and its tooltip always agree with the roll.
 */
import type { PersonalityId } from "../companions/personality";
import type { StatusId } from "../creatures/types";

export type BefriendOffering = "none" | "folk-seal" | "favorite-bait";

export const FOLK_SEAL_ID = "folk-seal";
export const FAVORITE_BAIT_ID = "favorite-bait";

export const BEFRIEND_BASE = 0.35;
/** Per rarity step (uncommon +1, rare +2 from `getRarityBias`). */
export const BEFRIEND_RARITY_PENALTY = 0.05;
/** Per level the wild sits above the lead. */
export const BEFRIEND_LEVEL_PENALTY = 0.04;
export const BEFRIEND_LEVEL_PENALTY_CAP = 0.2;
/** Per level the wild sits below the lead. */
export const BEFRIEND_LEVEL_BONUS = 0.02;
export const BEFRIEND_LEVEL_BONUS_CAP = 0.1;
/** Full weakening bonus at 0 HP; scales linearly with missing HP. */
export const BEFRIEND_WEAKEN_MAX = 0.45;
export const BEFRIEND_STATUS_BONUS: Readonly<Record<StatusId, number>> = {
  rooted: 0.12,
  dazed: 0.12,
  burn: 0.05,
  soaked: 0.05,
};
export const BEFRIEND_OFFERING_BONUS: Readonly<Record<BefriendOffering, number>> = {
  none: 0,
  "folk-seal": 0.15,
  "favorite-bait": 0.25,
};
export const BEFRIEND_BOND_PER_TIER = 0.02;
/** Lead personalities that put a wild at ease. */
export const BEFRIEND_PERSONALITY_BONUS: Partial<Record<PersonalityId, number>> = {
  curious: 0.05,
  gentle: 0.05,
  loyal: 0.05,
};
/** Shrine folklore habitats: a hunter in the party helps, a hunted one hurts. */
export const BEFRIEND_HABITAT_EDGE = 0.1;
export const BEFRIEND_MIN = 0.05;
export const BEFRIEND_MAX = 0.95;
/** Misses in one encounter before a wild slips away (soft: never a hard lock). */
export const BEFRIEND_FLEE_STREAK = 3;

export type BefriendInputs = {
  /** Sovereigns keep their own flat chance. */
  godChance?: number;
  rarityBias: number;
  /** Wild level minus lead level. */
  levelGap: number;
  /** Wild current / max HP, 0..1 (1 before a spar). */
  hpFraction: number;
  statuses: readonly StatusId[];
  offering: BefriendOffering;
  leadBondTier: number;
  leadPersonality?: PersonalityId;
  leadName?: string;
  /** -1 hunted, 0 none, +1 hunter (shrine folklore habitats only). */
  habitatEdge: -1 | 0 | 1;
};

export type BefriendTerm = { label: string; delta: number };

export type BefriendOdds = {
  chance: number;
  terms: BefriendTerm[];
};

const STATUS_LABEL: Readonly<Record<StatusId, string>> = {
  rooted: "Rooted",
  dazed: "Dazed",
  burn: "Burning",
  soaked: "Soaked",
};

const OFFERING_LABEL: Readonly<Record<BefriendOffering, string>> = {
  none: "",
  "folk-seal": "Folk Seal",
  "favorite-bait": "Favorite Bait",
};

export function offeringLabel(offering: BefriendOffering): string {
  return OFFERING_LABEL[offering];
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

export function computeBefriendOdds(input: BefriendInputs): BefriendOdds {
  if (input.godChance !== undefined) {
    return {
      chance: input.godChance,
      terms: [{ label: "Sovereign", delta: input.godChance }],
    };
  }
  const terms: BefriendTerm[] = [{ label: "Base", delta: BEFRIEND_BASE }];
  const push = (label: string, delta: number): void => {
    if (Math.abs(delta) >= 0.005) {
      terms.push({ label, delta });
    }
  };

  if (input.rarityBias > 0) {
    push(input.rarityBias >= 2 ? "Rare" : "Uncommon", -BEFRIEND_RARITY_PENALTY * input.rarityBias);
  }
  if (input.levelGap > 0) {
    push(
      `Wild +${input.levelGap} Lv`,
      -Math.min(BEFRIEND_LEVEL_PENALTY_CAP, BEFRIEND_LEVEL_PENALTY * input.levelGap),
    );
  } else if (input.levelGap < 0) {
    push(
      `Wild ${input.levelGap} Lv`,
      Math.min(BEFRIEND_LEVEL_BONUS_CAP, BEFRIEND_LEVEL_BONUS * -input.levelGap),
    );
  }
  push("Weakened", BEFRIEND_WEAKEN_MAX * (1 - clamp01(input.hpFraction)));

  const best = [...input.statuses].sort(
    (a, b) => BEFRIEND_STATUS_BONUS[b] - BEFRIEND_STATUS_BONUS[a],
  )[0];
  if (best) {
    push(STATUS_LABEL[best], BEFRIEND_STATUS_BONUS[best]);
  }
  if (input.offering !== "none") {
    push(OFFERING_LABEL[input.offering], BEFRIEND_OFFERING_BONUS[input.offering]);
  }
  const lead = input.leadName ?? "Lead";
  if (input.leadBondTier > 0) {
    push(`${lead}'s bond`, BEFRIEND_BOND_PER_TIER * input.leadBondTier);
  }
  const trait = input.leadPersonality
    ? BEFRIEND_PERSONALITY_BONUS[input.leadPersonality]
    : undefined;
  if (trait && input.leadPersonality) {
    const name = input.leadPersonality[0]!.toUpperCase() + input.leadPersonality.slice(1);
    push(`${name} lead`, trait);
  }
  if (input.habitatEdge !== 0) {
    push(input.habitatEdge > 0 ? "Hunter in party" : "Hunted by it", BEFRIEND_HABITAT_EDGE * input.habitatEdge);
  }

  const raw = terms.reduce((sum, t) => sum + t.delta, 0);
  return {
    chance: Math.max(BEFRIEND_MIN, Math.min(BEFRIEND_MAX, raw)),
    terms,
  };
}

export function rollBefriendOdds(odds: BefriendOdds, rng: () => number): boolean {
  return rng() < odds.chance;
}

export function formatBefriendPercent(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

/** Button / pill label: "Befriend ~62%". */
export function formatBefriendOddsLabel(chance: number): string {
  return `Befriend ~${formatBefriendPercent(chance)}`;
}

/** Tooltip lines: "Base 35%", "Weakened +20%", "Rare −10%". */
export function formatBefriendBreakdown(odds: BefriendOdds): string[] {
  return odds.terms.map((term, i) => {
    const pct = Math.round(Math.abs(term.delta) * 100);
    if (i === 0) {
      return `${term.label} ${pct}%`;
    }
    return `${term.label} ${term.delta >= 0 ? "+" : "−"}${pct}%`;
  });
}

export type BefriendMissOutcome = {
  misses: number;
  /** The wild slipped away (streak reached). */
  fled: boolean;
};

export function afterBefriendMiss(
  misses: number,
  streak = BEFRIEND_FLEE_STREAK,
): BefriendMissOutcome {
  const next = misses + 1;
  return { misses: next, fled: next >= streak };
}

/** Readable miss feedback: what it cost and how close the wild is to leaving. */
export function befriendMissLine(
  wildName: string,
  outcome: BefriendMissOutcome,
  inBattle: boolean,
  streak = BEFRIEND_FLEE_STREAK,
): string {
  if (outcome.fled) {
    return `${wildName} slipped away into the brush.`;
  }
  const left = streak - outcome.misses;
  const warn = left === 1 ? "One more miss and it leaves." : `${left} more misses and it leaves.`;
  return inBattle
    ? `${wildName} shied away — it takes a free turn. ${warn}`
    : `${wildName} bristles — it will strike first if you spar. ${warn}`;
}
