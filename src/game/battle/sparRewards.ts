import { playLevelUpSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures, getEffectiveMaxHp } from "../creatures/party";
import { getMaterialForCreature, getMaterialName } from "../inventory/materials";
import { addMaterial } from "../inventory/playerInventory";
import { grantSparXp, XP_PER_SPAR_WIN } from "../progression/leveling";
import { bondRoomToday, tickBattleBond } from "../companions/bond";
import { isDefeatScalingExcluded } from "../progression/wildLevel";
import { recordSparWin } from "../world/sparWins";
import { recordQuestEvent } from "../story/questProgress";
import { getActiveStorySpar } from "./storySpar";

export type SparXpShareEntry = {
  creatureName: string;
  xpGained: number;
  leveledUp: boolean;
  newLevel?: number;
};

export type SparRewardSummary = {
  materialId?: string;
  dustGained: number;
  /** Total XP granted across the active party. */
  xpGained: number;
  leveledUp: boolean;
  newLevel?: number;
  creatureName?: string;
  /** Per-active shares (empty when no active party fighter). */
  xpShares: SparXpShareEntry[];
  /** Variance drop rolled on top of the guaranteed rewards, if any. */
  bonusDrop?: { label: string; materialId: string; amount: number };
  /** HP the standing actives got back after the win (#390). */
  hpRestored: number;
  /** Actives whose spar + gift bond allowance is used up for today (#417). */
  bondFullNames?: string[];
};

/**
 * Soft overworld (#390): a won wild spar gives standing actives a breather.
 * Tuned with sparSim: an equal-level 1v1 win leaves ~31-40% HP on average
 * (max-damage / skilled), so +20% of max returns under a third of what a win
 * costs and the next fight still starts hurt. Fainted actives stay down.
 */
export const SPAR_WIN_HEAL_FRACTION = 0.2;

/**
 * Restore `fraction` of max HP to every standing active. Never during a story
 * spar: its rounds, rematches and rollbacks keep their own HP rules (#369/#382).
 */
export function healAfterSparWin(fraction = SPAR_WIN_HEAL_FRACTION): number {
  if (getActiveStorySpar() !== null) {
    return 0;
  }
  let restored = 0;
  for (const creature of getActiveCreatures()) {
    if (creature.currentHp <= 0) {
      continue;
    }
    const maxHp = getEffectiveMaxHp(creature);
    const next = Math.min(
      maxHp,
      creature.currentHp + Math.max(1, Math.round(maxHp * fraction)),
    );
    restored += next - creature.currentHp;
    creature.currentHp = next;
  }
  return restored;
}

/** Fraction of the spar XP pool the active fighter takes when others are benched. */
export const FIGHTER_XP_SHARE = 0.5;

/**
 * Split total XP across `recipientCount` actives. The fighter (index
 * `fighterIndex`) takes `FIGHTER_XP_SHARE` of the pool; benched actives split
 * the rest evenly, with leftover points going one each to the first benched
 * actives in party order. A lone
 * fighter takes the whole pool.
 */
export function splitSparXp(
  totalXp: number,
  recipientCount: number,
  fighterIndex: number,
): number[] {
  if (recipientCount <= 0 || totalXp <= 0) {
    return [];
  }
  const fighter = Math.min(Math.max(fighterIndex, 0), recipientCount - 1);
  if (recipientCount === 1) {
    return [totalXp];
  }
  const benchCount = recipientCount - 1;
  const fighterXp = Math.ceil(totalXp * FIGHTER_XP_SHARE);
  const benchPool = totalXp - fighterXp;
  const benchEach = Math.floor(benchPool / benchCount);
  let leftover = benchPool - benchEach * benchCount;
  return Array.from({ length: recipientCount }, (_, i) => {
    if (i === fighter) {
      return fighterXp;
    }
    return benchEach + (leftover-- > 0 ? 1 : 0);
  });
}

/** Pinned #266/#267 spar-win floor: +1 Folklore Dust (plus +1 species material, +70 XP pool). */
export const SPAR_WIN_DUST_GAIN = 1;

export type SparBonusDrop = {
  /** Cumulative roll threshold in [0, 1); first entry with roll < upTo wins. */
  upTo: number;
  label: string;
  /** "species" resolves to the defeated creature's material. */
  materialId: "species" | "folklore-dust";
  amount: number;
};

/**
 * Bonus drops on top of the guaranteed Dust + species material (#370).
 * Rolls past the last threshold drop nothing extra (~55% of wins).
 */
export const SPAR_BONUS_DROPS: readonly SparBonusDrop[] = [
  { upTo: 0.05, label: "Moonlit find", materialId: "folklore-dust", amount: 3 },
  { upTo: 0.2, label: "Lucky scrap", materialId: "folklore-dust", amount: 1 },
  { upTo: 0.45, label: "Bonus haul", materialId: "species", amount: 1 },
];

export function rollSparBonusDrop(
  rng: () => number = Math.random,
): SparBonusDrop | undefined {
  const roll = rng();
  return SPAR_BONUS_DROPS.find((drop) => roll < drop.upTo);
}

export function grantSparRewards(
  wildCreatureId: string,
  activePartyIndex: number,
  rng: () => number = Math.random,
): SparRewardSummary {
  const summary: SparRewardSummary = {
    dustGained: SPAR_WIN_DUST_GAIN,
    xpGained: 0,
    leveledUp: false,
    xpShares: [],
    hpRestored: 0,
  };

  addMaterial("folklore-dust", SPAR_WIN_DUST_GAIN);

  const matId = getMaterialForCreature(wildCreatureId);
  if (matId) {
    addMaterial(matId, 1);
    summary.materialId = matId;
  }

  const bonus = rollSparBonusDrop(rng);
  if (bonus) {
    const bonusMaterial =
      bonus.materialId === "species" ? matId : bonus.materialId;
    if (bonusMaterial) {
      addMaterial(bonusMaterial, bonus.amount);
      summary.bonusDrop = {
        label: bonus.label,
        materialId: bonusMaterial,
        amount: bonus.amount,
      };
    }
  }

  const actives = getActiveCreatures();
  if (activePartyIndex >= 0 && actives[activePartyIndex]) {
    const shares = splitSparXp(
      XP_PER_SPAR_WIN,
      actives.length,
      activePartyIndex,
    );
    let anyLevelUp = false;

    for (let i = 0; i < actives.length; i++) {
      const creature = actives[i]!;
      const amount = shares[i] ?? 0;
      if (amount <= 0) {
        continue;
      }
      const prevLevel = creature.level;
      grantSparXp(creature, amount);
      const leveledUp = creature.level > prevLevel;
      if (leveledUp) {
        anyLevelUp = true;
      }
      summary.xpShares.push({
        creatureName: getCreatureDefinition(creature.definitionId).name,
        xpGained: amount,
        leveledUp,
        newLevel: leveledUp ? creature.level : undefined,
      });
      summary.xpGained += amount;
      if (i === activePartyIndex) {
        summary.creatureName = getCreatureDefinition(creature.definitionId).name;
        summary.leveledUp = leveledUp;
        if (leveledUp) {
          summary.newLevel = creature.level;
        }
      }
    }

    // Battling together builds bond (#367): fighter more than the bench.
    tickBattleBond(actives, activePartyIndex);
    const full = actives
      .filter((c) => bondRoomToday(c) <= 0)
      .map((c) => c.nickname ?? getCreatureDefinition(c.definitionId).name);
    if (full.length > 0) {
      summary.bondFullNames = full;
    }

    // Prefer fighter level-up flags on the summary; also note any party level-up.
    if (!summary.leveledUp && anyLevelUp) {
      const firstUp = summary.xpShares.find((s) => s.leveledUp);
      if (firstUp) {
        summary.leveledUp = true;
        summary.newLevel = firstUp.newLevel;
        summary.creatureName = firstUp.creatureName;
      }
    }
  }

  if (summary.leveledUp) {
    playLevelUpSfx(1400);
  }

  summary.hpRestored = healAfterSparWin();

  recordQuestEvent({ type: "win_spar" });

  if (!isDefeatScalingExcluded(wildCreatureId)) {
    recordSparWin(wildCreatureId);
  }

  return summary;
}

export function formatRewardMessage(reward: SparRewardSummary): string {
  const parts = ["You won the training spar!"];
  if (reward.materialId) {
    parts.push(`+1 ${getMaterialName(reward.materialId)}, +1 Folklore Dust.`);
  } else {
    parts.push(`+1 Folklore Dust.`);
  }
  if (reward.bonusDrop) {
    parts.push(
      `${reward.bonusDrop.label}! +${reward.bonusDrop.amount} ${getMaterialName(reward.bonusDrop.materialId)}.`,
    );
  }
  if (reward.xpShares.length > 1) {
    const shareText = reward.xpShares
      .map((s) => `${s.creatureName} +${s.xpGained}`)
      .join(", ");
    parts.push(`Shared XP: ${shareText}.`);
    const levelUps = reward.xpShares.filter((s) => s.leveledUp && s.newLevel);
    for (const up of levelUps) {
      parts.push(`${up.creatureName} leveled up to Lv.${up.newLevel}!`);
    }
  } else if (reward.xpGained > 0 && reward.creatureName) {
    parts.push(`${reward.creatureName} +${reward.xpGained} XP.`);
    if (reward.leveledUp && reward.newLevel) {
      parts.push(`Leveled up to Lv.${reward.newLevel}!`);
    }
  }
  if (reward.hpRestored > 0) {
    parts.push(`Your companions catch their breath (+${reward.hpRestored} HP).`);
  }
  return parts.join(" ");
}
