import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures } from "../creatures/party";
import { getMaterialForCreature, getMaterialName } from "../inventory/materials";
import { addMaterial } from "../inventory/playerInventory";
import { grantSparXp, XP_PER_SPAR_WIN } from "../progression/leveling";
import { isDefeatScalingExcluded } from "../progression/wildLevel";
import { recordSparWin } from "../world/sparWins";
import { recordQuestEvent } from "../story/questProgress";

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
};

/**
 * Split total XP across `recipientCount` actives.
 * Floor equal shares; leftover XP goes to the fighter (index `fighterIndex`).
 */
export function splitSparXp(
  totalXp: number,
  recipientCount: number,
  fighterIndex: number,
): number[] {
  if (recipientCount <= 0 || totalXp <= 0) {
    return [];
  }
  const base = Math.floor(totalXp / recipientCount);
  const remainder = totalXp - base * recipientCount;
  const shares = Array.from({ length: recipientCount }, () => base);
  const fighter = Math.min(Math.max(fighterIndex, 0), recipientCount - 1);
  shares[fighter] += remainder;
  return shares;
}

/** Pinned #266/#267 spar-win table: +1 Folklore Dust (plus +1 species material, +70 XP). */
export const SPAR_WIN_DUST_GAIN = 1;

export function grantSparRewards(
  wildCreatureId: string,
  activePartyIndex: number,
): SparRewardSummary {
  const summary: SparRewardSummary = {
    dustGained: SPAR_WIN_DUST_GAIN,
    xpGained: 0,
    leveledUp: false,
    xpShares: [],
  };

  addMaterial("folklore-dust", SPAR_WIN_DUST_GAIN);

  const matId = getMaterialForCreature(wildCreatureId);
  if (matId) {
    addMaterial(matId, 1);
    summary.materialId = matId;
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
  return parts.join(" ");
}
