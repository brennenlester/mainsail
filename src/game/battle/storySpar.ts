import type Phaser from "phaser";
import {
  getEffectiveMaxHp,
  hasLivingPartyMembers,
  playerParty,
} from "../creatures/party";
import {
  addItem,
  addMaterial,
  playerInventory,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
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
import { refreshQuestHud } from "../ui/questHud";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";
import { getSparWinsForSpecies } from "../world/sparWins";
import { UNARMED_WANDERER } from "./wandererWeapons";

/**
 * Story spar adapter (#369): runs a rival / boss party as consecutive rounds
 * of the existing BattleScene spar (no BattleScene changes). A round is won
 * when that species' spar-win counter ticks (grantSparRewards → recordSparWin).
 *
 * Economy rules (no farming): per-round spar rewards (XP, Dust, materials) are
 * kept only on the first win of the active beat. Every other ending — loss,
 * forfeit, rematch — rolls them back to the pre-spar snapshot. The party is
 * healed only once per session, on a real loss of the active beat; a forfeit
 * or a later loss restores pre-spar HP instead (never better than you started).
 */

type PartyMemberSnapshot = {
  instanceId: string;
  currentHp: number;
  xp: number;
  level: number;
};

type PreSparSnapshot = {
  party: PartyMemberSnapshot[];
  materials: Record<string, number>;
  items: Record<string, number>;
};

type ActiveStorySpar = {
  id: StorySparId;
  roundIndex: number;
  /** Beat already complete — repeat challenge (no rewards, no heal). */
  rematch: boolean;
  before: PreSparSnapshot;
};

export type StorySparOutcome = {
  result: "won" | "lost";
  /** First win: the quest beat completed and the reward was granted. */
  firstWin: boolean;
  /** Real loss of the active beat healed the party (once per session). */
  healed: boolean;
  rewardText: string | null;
};

export type StorySparRoundResult = "next-round" | "won" | "lost";

let active: ActiveStorySpar | null = null;
const lastOutcome = new Map<StorySparId, StorySparOutcome>();
/** Beats already lost this session — later losses do not heal again. */
const lostThisSession = new Set<StorySparId>();

function takeSnapshot(): PreSparSnapshot {
  return {
    party: playerParty.creatures.map((c) => ({
      instanceId: c.instanceId,
      currentHp: c.currentHp,
      xp: c.xp,
      level: c.level,
    })),
    materials: { ...playerInventory.materials },
    items: { ...playerInventory.items },
  };
}

/** Undo per-round spar rewards (XP, levels, Dust, materials). */
function rollBackRewards(before: PreSparSnapshot): void {
  setInventoryFromSnapshot(before.materials, before.items);
  for (const saved of before.party) {
    const creature = playerParty.creatures.find(
      (c) => c.instanceId === saved.instanceId,
    );
    if (creature) {
      creature.xp = saved.xp;
      creature.level = saved.level;
      creature.currentHp = Math.min(creature.currentHp, getEffectiveMaxHp(creature));
    }
  }
}

function restorePreSparHp(before: PreSparSnapshot): void {
  for (const saved of before.party) {
    const creature = playerParty.creatures.find(
      (c) => c.instanceId === saved.instanceId,
    );
    if (creature) {
      creature.currentHp = Math.min(saved.currentHp, getEffectiveMaxHp(creature));
    }
  }
}

function healParty(): void {
  for (const creature of playerParty.creatures) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
}

/** Story spars need at least one standing companion (no fainted-party heal). */
export function canBeginStorySpar(): boolean {
  return !isVisitorMode() && hasLivingPartyMembers();
}

export function beginStorySpar(id: StorySparId): boolean {
  if (!canBeginStorySpar()) {
    return false;
  }
  active = {
    id,
    roundIndex: 0,
    rematch: questProgress[id] === "complete",
    before: takeSnapshot(),
  };
  lastOutcome.delete(id);
  return true;
}

export function getActiveStorySpar(): Readonly<
  Pick<ActiveStorySpar, "id" | "roundIndex" | "rematch">
> | null {
  return active;
}

export function hasLostStorySparThisSession(id: StorySparId): boolean {
  return lostThisSession.has(id);
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

function finishLoss(spar: ActiveStorySpar, forfeit: boolean): void {
  rollBackRewards(spar.before);
  const realLoss =
    !forfeit &&
    getActiveQuestId() === spar.id &&
    !lostThisSession.has(spar.id);
  if (realLoss) {
    // ponytail: one cheap-failure heal per beat per session (Hybrid session).
    healParty();
  } else {
    restorePreSparHp(spar.before);
  }
  if (!forfeit) {
    lostThisSession.add(spar.id);
  }
  lastOutcome.set(spar.id, {
    result: "lost",
    firstWin: false,
    healed: realLoss,
    rewardText: null,
  });
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
    refreshQuestHud();
    return "next-round";
  }
  const spar = active;
  active = null;
  if (!won) {
    finishLoss(spar, false);
    notifyWorldChanged();
    refreshQuestHud();
    return "lost";
  }
  const firstWin = getActiveQuestId() === spar.id;
  if (!firstWin) {
    // Rematch: bragging rights only — no XP / Dust farm.
    rollBackRewards(spar.before);
  }
  const rewardText = firstWin ? grantFirstWinReward(spar.id) : null;
  lastOutcome.set(spar.id, { result: "won", firstWin, healed: false, rewardText });
  if (firstWin) {
    recordQuestEvent({ type: "win_story_spar", sparId: spar.id });
  }
  notifyWorldChanged();
  refreshQuestHud();
  return "won";
}

/**
 * Walking away between rounds: back to exactly the pre-spar state (HP,
 * rewards) — never a heal, never a reward.
 */
export function forfeitStorySpar(): void {
  if (!active) {
    return;
  }
  const spar = active;
  active = null;
  finishLoss(spar, true);
  notifyWorldChanged();
  refreshQuestHud();
}

/** Banter hook: the latest finished outcome for this spar, read once. */
export function consumeStorySparOutcome(
  id: StorySparId,
): StorySparOutcome | null {
  const outcome = lastOutcome.get(id) ?? null;
  lastOutcome.delete(id);
  return outcome;
}

/** HUD line for the rival beat that tracks the fight (#369 review). */
export function getStorySparNpcLine(): string | null {
  if (getActiveQuestId() !== "rival-wren") {
    return null;
  }
  const current = active?.id === "rival-wren" ? getCurrentStorySparRound() : null;
  if (current) {
    return `Wren: Round ${current.roundNumber}/${current.roundCount}. Don't stop now.`;
  }
  if (lostThisSession.has("rival-wren")) {
    return "Wren: Not bad for a first try. Come back when you want a rematch.";
  }
  return null;
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
  lostThisSession.clear();
}
