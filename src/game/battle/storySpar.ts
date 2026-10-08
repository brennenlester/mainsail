import type Phaser from "phaser";
import { getEffectiveMaxHp, playerParty } from "../creatures/party";
import { addItem, addMaterial } from "../inventory/playerInventory";
import { MAX_LEVEL } from "../progression/leveling";
import {
  getPartyAverageLevel,
  setScriptedWildLevel,
} from "../progression/wildLevel";
import {
  getActiveQuestId,
  questProgress,
  recordQuestEvent,
} from "../story/questProgress";
import type { StorySparId } from "../story/questTypes";
import {
  getStorySpar,
  storySparRoundLevel,
  type StorySparRound,
} from "../story/storySpars";
import { getItemName, getMaterialName } from "../inventory/materials";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";
import { getSparWinsForSpecies } from "../world/sparWins";
import { UNARMED_WANDERER } from "./wandererWeapons";

/**
 * Story spar adapter (#369): runs a rival / boss party as consecutive rounds
 * of the existing BattleScene spar (no BattleScene changes — Battle v1 #375 is
 * in flight). A round is won when that species' spar-win counter ticks.
 */

type ActiveStorySpar = {
  id: StorySparId;
  roundIndex: number;
  /** Beat already complete — repeat challenge (no first-win reward). */
  rematch: boolean;
};

export type StorySparOutcome = {
  result: "won" | "lost";
  /** First win: the quest beat completed and the reward was granted. */
  firstWin: boolean;
  rewardText: string | null;
};

export type StorySparRoundResult = "next-round" | "won" | "lost";

let active: ActiveStorySpar | null = null;
const lastOutcome = new Map<StorySparId, StorySparOutcome>();

export function beginStorySpar(id: StorySparId): boolean {
  if (isVisitorMode()) {
    return false;
  }
  active = { id, roundIndex: 0, rematch: questProgress[id] === "complete" };
  lastOutcome.delete(id);
  return true;
}

export function getActiveStorySpar(): Readonly<ActiveStorySpar> | null {
  return active;
}

export function getCurrentStorySparRound(): {
  round: StorySparRound;
  level: number;
  roundNumber: number;
  roundCount: number;
} | null {
  if (!active) {
    return null;
  }
  const def = getStorySpar(active.id);
  const round = def.rounds[active.roundIndex];
  if (!round) {
    return null;
  }
  return {
    round,
    level: storySparRoundLevel(
      round,
      getPartyAverageLevel(),
      active.rematch,
      def.rematchLevelBonus,
      MAX_LEVEL,
    ),
    roundNumber: active.roundIndex + 1,
    roundCount: def.rounds.length,
  };
}

// ponytail: a lost story spar fully restores the party (cheap failure for a
// Hybrid session); revisit if it becomes a free-heal loop.
function restorePartyAfterLoss(): void {
  for (const creature of playerParty.creatures) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
  notifyWorldChanged();
}

function grantFirstWinReward(id: StorySparId): string | null {
  const gifts = getStorySpar(id).firstWinReward;
  if (gifts.length === 0) {
    return null;
  }
  for (const gift of gifts) {
    if (gift.kind === "material") {
      addMaterial(gift.id, gift.amount);
    } else {
      addItem(gift.id, gift.amount);
    }
  }
  return gifts
    .map(
      (gift) =>
        `${gift.kind === "material" ? getMaterialName(gift.id) : getItemName(gift.id)}×${gift.amount}`,
    )
    .join(", ");
}

/** Advance after one BattleScene round ends. Null when no story spar is running. */
export function resolveStorySparRound(
  won: boolean,
): StorySparRoundResult | null {
  if (!active) {
    return null;
  }
  const def = getStorySpar(active.id);
  if (won && active.roundIndex < def.rounds.length - 1) {
    active.roundIndex += 1;
    return "next-round";
  }
  const id = active.id;
  active = null;
  if (!won) {
    restorePartyAfterLoss();
    lastOutcome.set(id, { result: "lost", firstWin: false, rewardText: null });
    return "lost";
  }
  const firstWin = getActiveQuestId() === id;
  const rewardText = firstWin ? grantFirstWinReward(id) : null;
  lastOutcome.set(id, { result: "won", firstWin, rewardText });
  if (firstWin) {
    recordQuestEvent({ type: "win_story_spar", sparId: id });
  }
  notifyWorldChanged();
  return "won";
}

/** Walking away between rounds forfeits (same cheap failure as a loss). */
export function forfeitStorySpar(): void {
  if (active) {
    resolveStorySparRound(false);
  }
}

/** Banter hook: the latest finished outcome for this spar, read once. */
export function consumeStorySparOutcome(
  id: StorySparId,
): StorySparOutcome | null {
  const outcome = lastOutcome.get(id) ?? null;
  lastOutcome.delete(id);
  return outcome;
}

/**
 * Launch the current round on the existing spar entry point. `onRoundEnd`
 * runs when BattleScene shuts down (it resumes IsometricScene itself).
 */
export function launchStorySparRound(
  scene: Phaser.Scene,
  onRoundEnd: (result: StorySparRoundResult | null) => void,
): boolean {
  const current = getCurrentStorySparRound();
  if (!current) {
    return false;
  }
  const { creatureId } = current.round;
  setScriptedWildLevel(creatureId, current.level);
  const winsBefore = getSparWinsForSpecies(creatureId);
  scene.scene.get("BattleScene").events.once("shutdown", () => {
    setScriptedWildLevel(creatureId, null);
    const won = getSparWinsForSpecies(creatureId) > winsBefore;
    onRoundEnd(resolveStorySparRound(won));
  });
  scene.scene.launch("BattleScene", {
    wildCreatureId: creatureId,
    wandererPartner: UNARMED_WANDERER,
  });
  return true;
}

/** Test-only reset. */
export function resetStorySparForTest(): void {
  active = null;
  lastOutcome.clear();
}
