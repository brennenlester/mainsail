/**
 * Victory screen model (#365). Pure: turns a pre-battle party snapshot, the
 * post-reward party and the spar reward into XP bars, loot lines, level-up
 * stat gains and an evolution-ready hint.
 */

import type { CreatureDefinition, CreatureInstance } from "../../creatures/types";
import { LEVEL_XP_THRESHOLDS, MAX_LEVEL, scaledStat } from "../../progression/leveling";
import { SHRINE_EFFECTS, effectKey } from "../../shrine/shrineEffects";
import type { SparRewardSummary } from "../sparRewards";
import { disambiguateNames } from "../../creatures/displayName";

export type PartySnapshotEntry = Pick<
  CreatureInstance,
  "instanceId" | "definitionId" | "level" | "xp"
>;

export type XpBarRow = {
  instanceId: string;
  name: string;
  xpGained: number;
  fromLevel: number;
  toLevel: number;
  /** Bar fill (0..1) within the starting level. */
  fromFill: number;
  /** Bar fill (0..1) within the ending level. */
  toFill: number;
  /** Stat gains when the level changed. */
  gains?: { hp: number; attack: number };
};

export type VictorySummary = {
  title: string;
  rows: XpBarRow[];
  loot: string[];
  /** e.g. "Mossling can evolve at the Moon Shrine (Moss Salve)." */
  evolutionHint?: string;
};

/** Fraction of the way from this level's XP threshold to the next. */
export function xpFill(xp: number, level: number): number {
  if (level >= MAX_LEVEL) {
    return 1;
  }
  const lo = LEVEL_XP_THRESHOLDS[level] ?? 0;
  const hi = LEVEL_XP_THRESHOLDS[level + 1] ?? lo + 1;
  return Math.max(0, Math.min(1, (xp - lo) / Math.max(1, hi - lo)));
}

/** First shrine evolution this creature now qualifies for and has not taken. */
export function evolutionReadyItem(creature: CreatureInstance): string | undefined {
  const effect = SHRINE_EFFECTS.find(
    (e) =>
      e.effectType === "evolution" &&
      e.creatureId === creature.definitionId &&
      creature.level >= e.minLevel &&
      !(creature.appliedEffects ?? []).includes(effectKey(e.creatureId, e.itemId)),
  );
  return effect?.itemId;
}

export type VictoryDeps = {
  definition: (id: string) => Pick<CreatureDefinition, "name" | "maxHp" | "attack">;
  materialName: (id: string) => string;
};

export function buildVictorySummary(
  before: readonly PartySnapshotEntry[],
  after: readonly CreatureInstance[],
  reward: SparRewardSummary,
  deps: VictoryDeps,
): VictorySummary {
  const rows: XpBarRow[] = [];
  let evolutionHint: string | undefined;
  for (const prev of before) {
    const now = after.find((c) => c.instanceId === prev.instanceId);
    if (!now || now.xp <= prev.xp) {
      continue;
    }
    const def = deps.definition(now.definitionId);
    const row: XpBarRow = {
      instanceId: now.instanceId,
      name: now.nickname ?? def.name,
      xpGained: now.xp - prev.xp,
      fromLevel: prev.level,
      toLevel: now.level,
      fromFill: xpFill(prev.xp, prev.level),
      toFill: xpFill(now.xp, now.level),
    };
    if (now.level > prev.level) {
      row.gains = {
        hp: scaledStat(def.maxHp, now.level) - scaledStat(def.maxHp, prev.level),
        attack: scaledStat(def.attack, now.level) - scaledStat(def.attack, prev.level),
      };
    }
    rows.push(row);
    const item = evolutionHint ? undefined : evolutionReadyItem(now);
    if (item) {
      evolutionHint = `${row.name} is ready to evolve at the Moon Shrine (${deps.materialName(item)}).`;
    }
  }

  const loot: string[] = [`+${reward.dustGained} ${deps.materialName("folklore-dust")}`];
  if (reward.materialId) {
    loot.unshift(`+1 ${deps.materialName(reward.materialId)}`);
  }
  if (reward.bonusDrop) {
    loot.push(
      `${reward.bonusDrop.label}: +${reward.bonusDrop.amount} ${deps.materialName(reward.bonusDrop.materialId)}`,
    );
  }

  if (reward.bondFullNames?.length) {
    // Capped spar bond pays +0: say so (#417).
    const [first, ...rest] = reward.bondFullNames;
    loot.push(`Bond full for today: ${first}${rest.length > 0 ? ` +${rest.length}` : ""}`);
  }

  // Two "Pip"s on one screen read "Pip" and "Pip ·2" (#423).
  disambiguateNames(rows.map((r) => r.name)).forEach((name, i) => {
    rows[i]!.name = name;
  });
  return { title: "Victory!", rows, loot, evolutionHint };
}

/**
 * Fill segments for animating one XP bar: within the old level up to full,
 * then (on level-up) from empty to the new fill. Each segment is [from, to].
 */
export function xpBarSegments(row: Pick<XpBarRow, "fromLevel" | "toLevel" | "fromFill" | "toFill">): Array<[number, number]> {
  if (row.toLevel <= row.fromLevel) {
    return [[row.fromFill, row.toFill]];
  }
  const segments: Array<[number, number]> = [[row.fromFill, 1]];
  for (let lv = row.fromLevel + 1; lv < row.toLevel; lv++) {
    segments.push([0, 1]);
  }
  segments.push([0, row.toFill]);
  return segments;
}
