/**
 * Bond meter (#367). Points live on the creature instance (`bond`); tiers are
 * derived. Pure math here — the state helpers that mutate party members and
 * queue tier-up celebrations sit at the bottom and touch nothing but the
 * creature passed in plus a module-level queue.
 */
import type { CreatureInstance } from "../creatures/types";
import {
  personalityBondMultiplier,
  type BondSource,
  type PersonalityId,
} from "./personality";

export type BondTier = 0 | 1 | 2 | 3 | 4;

/** Minimum points for each tier (index = tier). */
export const BOND_TIER_THRESHOLDS: readonly number[] = [0, 20, 50, 100, 180];
export const BOND_MAX = 240;

export const BOND_TIER_NAMES: readonly string[] = [
  "Wary",
  "Friendly",
  "Close",
  "Devoted",
  "Kindred",
];

/**
 * Base points per source before personality multipliers (#418 tuning: a
 * typical ~20 minute arc ends Close on the lead, Friendly on the rest; see
 * the "typical arc" test in companions.test.ts and the README table).
 * Anti-farm: story wins and evolutions are one-shot (story rematches roll
 * back), abilities pay on first claim only, gifts cost materials + cooldown.
 */
export const BOND_GAIN = {
  /** Fighter in a won spar. */
  battleFighter: 5,
  /** Active bench member in a won spar. */
  battleBench: 2,
  /** Favorite material gift. */
  gift: 8,
  /** Overworld ability use (first claim of a site only). */
  ability: 6,
  /** Every active companion, on the first win of a rival / boss beat. */
  storyWin: 10,
  /** The companion that evolves (once per evolution). */
  evolution: 12,
} as const;

/**
 * Anti-grind (#417): wild-spar gain is halved once a creature is past Close
 * (tier 2), and spar + gift bond per creature is capped per local day.
 * Story wins, evolutions and ability first-claims are exempt: they are one-shots.
 * The day key is the local date, so changing the system clock restores the
 * allowance; that is acceptable for a single-player game.
 */
export const BOND_HALVED_ABOVE_TIER: BondTier = 2;
export const BOND_DAILY_CAP = 60;

/** Outgoing damage multiplier per tier (small: flavor, not a power spike). */
const BOND_DAMAGE_SCALE: readonly number[] = [1, 1.02, 1.04, 1.06, 1.08];

export function clampBond(points: number): number {
  if (!Number.isFinite(points)) {
    return 0;
  }
  return Math.max(0, Math.min(BOND_MAX, Math.floor(points)));
}

export function bondTier(points: number | undefined): BondTier {
  const p = clampBond(points ?? 0);
  let tier = 0;
  for (let i = 0; i < BOND_TIER_THRESHOLDS.length; i += 1) {
    if (p >= BOND_TIER_THRESHOLDS[i]!) {
      tier = i;
    }
  }
  return tier as BondTier;
}

export function bondTierName(tier: BondTier): string {
  return BOND_TIER_NAMES[tier]!;
}

/** 0..1 progress through the current tier (1 at max tier). */
export function bondTierProgress(points: number | undefined): number {
  const p = clampBond(points ?? 0);
  const tier = bondTier(p);
  if (tier >= BOND_TIER_THRESHOLDS.length - 1) {
    return 1;
  }
  const lo = BOND_TIER_THRESHOLDS[tier]!;
  const hi = BOND_TIER_THRESHOLDS[tier + 1]!;
  return (p - lo) / (hi - lo);
}

/** Points a tick adds after the personality multiplier (always ≥ 1 for base ≥ 1). */
export function bondGainFor(
  base: number,
  source: BondSource,
  personality: PersonalityId | undefined,
): number {
  if (base <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(base * personalityBondMultiplier(personality, source)));
}

export type BondBattleBonus = {
  tier: BondTier;
  /** Multiply into `BattleCombatant.damageScale` for the player side. */
  damageScale: number;
};

/**
 * Pure battle payoff for a bond level. Battle integration point: when the
 * player combatant is built from a party member (BattleScene
 * `combatantFromPartyIndex`), call `applyBondToCombatant` (below) — it only
 * uses the existing `damageScale` extension on BattleCombatant.
 */
export function bondBattleBonus(points: number | undefined): BondBattleBonus {
  const tier = bondTier(points);
  return { tier, damageScale: BOND_DAMAGE_SCALE[tier]! };
}

/** Fold the bond bonus into an existing combatant's damage scale. */
export function applyBondToCombatant<T extends { damageScale?: number }>(
  combatant: T,
  creature: Pick<CreatureInstance, "bond">,
): T {
  const { damageScale } = bondBattleBonus(creature.bond);
  combatant.damageScale = (combatant.damageScale ?? 1) * damageScale;
  return combatant;
}

// ---- State helpers -------------------------------------------------------

export type BondTierUp = {
  instanceId: string;
  tier: BondTier;
};

const pendingTierUps: BondTierUp[] = [];

export type BondTickResult = { gained: number; tierUp?: BondTier };

export type BondTickOptions = {
  /** Count against (and respect) the per-day cap: wild spars and gifts. */
  capped?: boolean;
  /** Halve the gain when the creature is already above this tier. */
  halveAboveTier?: BondTier;
  /** Clock for the daily cap (tests). */
  now?: Date;
};

/** Local calendar date, e.g. "2026-10-08": the daily cap resets when it changes. */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Spar + gift points this creature can still earn today. */
export function bondRoomToday(
  creature: Pick<CreatureInstance, "bondToday">,
  now: Date = new Date(),
): number {
  const today = creature.bondToday;
  return today && today.day === localDay(now) ? Math.max(0, BOND_DAILY_CAP - today.points) : BOND_DAILY_CAP;
}

/**
 * Lenient load for the saved daily tally: a bad shape is dropped, points are
 * clamped into 0..BOND_DAILY_CAP.
 */
export function coerceBondToday(raw: unknown): { day: string; points: number } | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { day, points } = raw as { day?: unknown; points?: unknown };
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof points !== "number" || !Number.isFinite(points)) {
    return undefined;
  }
  return { day, points: Math.max(0, Math.min(BOND_DAILY_CAP, Math.floor(points))) };
}

/**
 * Add bond to a creature. Returns the points gained and the new tier when a
 * threshold was crossed (also queued for the overworld celebration).
 */
export function addBond(
  creature: CreatureInstance,
  base: number,
  source: BondSource,
  options: BondTickOptions = {},
): BondTickResult {
  const before = clampBond(creature.bond ?? 0);
  let gain = bondGainFor(base, source, creature.personality);
  if (options.halveAboveTier !== undefined && bondTier(before) > options.halveAboveTier) {
    gain = Math.max(1, Math.floor(gain / 2));
  }
  if (options.capped) {
    gain = Math.min(gain, bondRoomToday(creature, options.now));
  }
  const after = clampBond(before + gain);
  if (options.capped && after > before) {
    const day = localDay(options.now);
    const used = creature.bondToday?.day === day ? creature.bondToday.points : 0;
    creature.bondToday = { day, points: used + (after - before) };
  }
  creature.bond = after;
  const tierBefore = bondTier(before);
  const tierAfter = bondTier(after);
  if (tierAfter > tierBefore) {
    pendingTierUps.push({ instanceId: creature.instanceId, tier: tierAfter });
    return { gained: after - before, tierUp: tierAfter };
  }
  return { gained: after - before };
}

/** Bond ticks for a won spar: the fighter gets more than the active bench. */
export function tickBattleBond(
  actives: readonly CreatureInstance[],
  fighterIndex: number,
  now?: Date,
): void {
  actives.forEach((creature, i) => {
    addBond(
      creature,
      i === fighterIndex ? BOND_GAIN.battleFighter : BOND_GAIN.battleBench,
      "battle",
      { capped: true, halveAboveTier: BOND_HALVED_ABOVE_TIER, now },
    );
  });
}

/** First win of a story beat (rival / boss): every active companion shares it. */
export function tickStoryWinBond(actives: readonly CreatureInstance[]): void {
  for (const creature of actives) {
    addBond(creature, BOND_GAIN.storyWin, "battle");
  }
}

/** Drain queued tier-ups (overworld celebrates them on resume/next frame). */
export function drainBondTierUps(): BondTierUp[] {
  return pendingTierUps.splice(0, pendingTierUps.length);
}
