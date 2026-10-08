import type Phaser from "phaser";
import {
  addToParty,
  getEffectiveMaxHp,
  hasLivingPartyMembers,
  playerParty,
} from "../creatures/party";
import { getCreatureDefinition } from "../creatures/catalog";
import type { CreatureInstance } from "../creatures/types";
import { drainBondTierUps } from "../companions/bond";
import {
  addItem,
  addMaterial,
  playerInventory,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { MAX_LEVEL } from "../progression/leveling";
import { getPartyAverageLevel } from "../progression/wildLevel";
import {
  getActiveQuestId,
  questProgress,
  recordQuestEvent,
} from "../story/questProgress";
import type { StorySparId } from "../story/questTypes";
import {
  getStorySpar,
  storySparRoster,
  storySparRoundLevel,
  storySparSpecies,
} from "../story/storySpars";
import { getItemName, getMaterialName } from "../inventory/materials";
import { refreshQuestHud } from "../ui/questHud";
import {
  flushPendingHostSave,
  notifyWorldChanged,
  resumeHostPersist,
  suspendHostPersist,
} from "../world/worldSaveSchedule";
import { markCreatureDiscovered } from "../world/worldState";
import { isVisitorMode } from "../world/worldSession";
import { setSparWinsBySpecies, sparWinsBySpecies } from "../world/sparWins";
import { UNARMED_WANDERER } from "./wandererWeapons";

/**
 * Story spar adapter (#369, #385): runs the rival / boss challenge as ONE
 * BattleScene battle (explicit `story` init data; battle/boss/storyBattle.ts
 * drives Wren's lineup and the Matriarch's forms). BattleScene reports the
 * result with `reportStoryBattleResult` before it closes.
 *
 * Economy rules (no farming): every side effect of the battle's reward path
 * (XP, levels, bond, Dust, materials, spar-win counts) is kept only on the
 * first win of the active beat. Every other ending — loss, forfeit, rematch,
 * a battle that never started — restores the pre-spar snapshot. Host
 * persistence is suspended while a story spar runs, so closing the tab
 * mid-spar reloads the pre-spar save. The party is healed only on the first
 * real loss of each beat (persisted in the save); otherwise HP returns to its
 * pre-spar value — never better than you started.
 */

type PreSparSnapshot = {
  party: CreatureInstance[];
  materials: Record<string, number>;
  items: Record<string, number>;
  sparWins: Record<string, number>;
};

type ActiveStorySpar = {
  id: StorySparId;
  /** Beat already complete — repeat challenge (no rewards, no heal). */
  rematch: boolean;
  before: PreSparSnapshot;
};

export type StorySparOutcome = {
  result: "won" | "lost";
  /** First win: the quest beat completed and the reward was granted. */
  firstWin: boolean;
  /** Real loss of the active beat healed the party (once per beat). */
  healed: boolean;
  rewardText: string | null;
};

export type StorySparResult = "won" | "lost";

/** Init data BattleScene receives for a story battle. */
export type StoryBattleInit = { sparId: StorySparId; rematch: boolean };

/** How long BattleScene may take to come up before the save pause is released. */
export const STORY_BATTLE_START_TIMEOUT_MS = 5000;

let active: ActiveStorySpar | null = null;
const lastOutcome = new Map<StorySparId, StorySparOutcome>();
/**
 * Beats lost at least once (persisted in the save): only the first loss of a
 * beat heals, even across reloads.
 */
const lostBeats = new Set<StorySparId>();
/** Set by BattleScene when a story battle ends (null = no verdict = loss). */
let reportedResult: { id: StorySparId; won: boolean } | null = null;

const STORY_SPAR_IDS: readonly StorySparId[] = ["rival-wren", "cinder-matriarch"];

export function isStorySparId(value: unknown): value is StorySparId {
  return STORY_SPAR_IDS.includes(value as StorySparId);
}

export function getStorySparLosses(): StorySparId[] {
  return STORY_SPAR_IDS.filter((id) => lostBeats.has(id));
}

/** Restore persisted losses; unknown ids (older / newer saves) are ignored. */
export function setStorySparLosses(ids: readonly string[]): void {
  lostBeats.clear();
  for (const id of ids) {
    if (isStorySparId(id)) {
      lostBeats.add(id);
    }
  }
}

function takeSnapshot(): PreSparSnapshot {
  return {
    party: structuredClone(playerParty.creatures),
    materials: { ...playerInventory.materials },
    items: { ...playerInventory.items },
    sparWins: { ...sparWinsBySpecies },
  };
}

/**
 * Undo every spar side effect (XP, levels, bond, Dust, materials, spar-win
 * counts, queued bond tier-ups). HP keeps its current value (clamped);
 * callers choose the HP policy afterwards.
 */
function rollBackRewards(before: PreSparSnapshot): void {
  setInventoryFromSnapshot(before.materials, before.items);
  setSparWinsBySpecies(before.sparWins, false);
  drainBondTierUps();
  for (const saved of before.party) {
    const creature = playerParty.creatures.find(
      (c) => c.instanceId === saved.instanceId,
    );
    if (creature) {
      const hp = creature.currentHp;
      // Exact restore: drop fields the spar added (e.g. a first `bond`).
      for (const key of Object.keys(creature)) {
        if (!(key in saved)) {
          delete (creature as Record<string, unknown>)[key];
        }
      }
      Object.assign(creature, structuredClone(saved));
      creature.currentHp = Math.min(hp, getEffectiveMaxHp(creature));
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
  const rematch = questProgress[id] === "complete";
  // Codex first, so a codex-complete reward is part of the snapshot and
  // survives a rollback (#382 review).
  for (const creatureId of storySparSpecies(getStorySpar(id), rematch)) {
    if (!getCreatureDefinition(creatureId).excludeFromCodex) {
      markCreatureDiscovered(creatureId);
    }
  }
  // Persist the pre-spar world now, then hold persistence until the spar
  // resolves: a reload mid-spar restores this state (no reward farm).
  flushPendingHostSave();
  suspendHostPersist();
  active = { id, rematch, before: takeSnapshot() };
  reportedResult = null;
  lastOutcome.delete(id);
  return true;
}

/** Resolution commits: release persistence and save the settled state. */
function endActiveSpar(): void {
  active = null;
  reportedResult = null;
  resumeHostPersist();
  notifyWorldChanged();
}

export function getActiveStorySpar(): Readonly<
  Pick<ActiveStorySpar, "id" | "rematch">
> | null {
  return active;
}

export function hasLostStorySpar(id: StorySparId): boolean {
  return lostBeats.has(id);
}

/** "Lantern Fox (Lv 6), then Rootwalker (Lv 7)" for the challenge dialogue. */
export function describeStorySparLineup(id: StorySparId): string {
  const def = getStorySpar(id);
  const rematch = questProgress[id] === "complete";
  const average = getPartyAverageLevel();
  if (def.boss) {
    const level = storySparRoundLevel(def.boss, average, false, 0, MAX_LEVEL);
    return `${def.name} (Lv ${level})`;
  }
  return storySparRoster(def, rematch)
    .map(
      (round) =>
        `${getCreatureDefinition(round.creatureId).name} (Lv ${storySparRoundLevel(round, average, rematch, def.rematchLevelBonus, MAX_LEVEL)})`,
    )
    .join(", then ");
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

/**
 * Wren's coverage companion (#385): joins once the party has nothing of the
 * gift's type. Returns the reward text, or null when not needed / visitor.
 */
export function grantCoverageGift(id: StorySparId): string | null {
  const gift = getStorySpar(id).coverageGift;
  if (!gift || isVisitorMode()) {
    return null;
  }
  const covered = playerParty.creatures.some(
    (c) => getCreatureDefinition(c.definitionId).folkloreType === gift.type,
  );
  if (covered) {
    return null;
  }
  const creature = addToParty(gift.creatureId, getPartyAverageLevel());
  creature.nickname = gift.nickname;
  return `${gift.nickname} the ${getCreatureDefinition(gift.creatureId).name}`;
}

function finishLoss(spar: ActiveStorySpar, forfeit: boolean): void {
  rollBackRewards(spar.before);
  const realLoss =
    !forfeit && getActiveQuestId() === spar.id && !lostBeats.has(spar.id);
  if (realLoss) {
    // ponytail: one cheap-failure heal per beat (Hybrid session).
    healParty();
  } else {
    restorePreSparHp(spar.before);
  }
  if (!forfeit) {
    lostBeats.add(spar.id);
  }
  lastOutcome.set(spar.id, {
    result: "lost",
    firstWin: false,
    healed: realLoss,
    rewardText: null,
  });
}

/** Settle the running story spar after its battle. Null when none is running. */
export function resolveStorySpar(won: boolean): StorySparResult | null {
  if (!active) {
    return null;
  }
  const spar = active;
  if (!won) {
    finishLoss(spar, false);
    endActiveSpar();
    refreshQuestHud();
    return "lost";
  }
  const firstWin = getActiveQuestId() === spar.id;
  if (!firstWin) {
    // Rematch: bragging rights only — no XP / Dust farm.
    rollBackRewards(spar.before);
  }
  const companion = firstWin ? grantCoverageGift(spar.id) : null;
  const items = firstWin ? grantFirstWinReward(spar.id) : null;
  const rewardText = [items, companion].filter(Boolean).join(", and ") || null;
  lastOutcome.set(spar.id, { result: "won", firstWin, healed: false, rewardText });
  if (firstWin) {
    recordQuestEvent({ type: "win_story_spar", sparId: spar.id });
  }
  endActiveSpar();
  refreshQuestHud();
  return "won";
}

/**
 * Walking away (or a battle that never came up): back to exactly the
 * pre-spar state (HP, rewards) — never a heal, never a reward.
 */
export function forfeitStorySpar(): void {
  if (!active) {
    return;
  }
  const spar = active;
  finishLoss(spar, true);
  endActiveSpar();
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

/** HUD line for the rival beat after a loss (#369 review). */
export function getStorySparNpcLine(): string | null {
  if (getActiveQuestId() !== "rival-wren" || active) {
    return null;
  }
  if (lostBeats.has("rival-wren")) {
    return "Wren: Not bad for a first try. Come back when you want a rematch.";
  }
  return null;
}

/** BattleScene's verdict for the running story battle (called before it closes). */
export function reportStoryBattleResult(id: StorySparId, won: boolean): void {
  if (active?.id === id) {
    reportedResult = { id, won };
  }
}

/** Init data for the running story battle (BattleScene `story`). */
export function getStoryBattleInit(): StoryBattleInit | null {
  return active ? { sparId: active.id, rematch: active.rematch } : null;
}

/**
 * Launch the story battle. `onEnd` runs when BattleScene shuts down (it
 * resumes IsometricScene itself) with the settled result. If BattleScene
 * throws on create or never starts, the watchdog forfeits (releasing the
 * save pause) and calls `onEnd(null)`.
 */
export function launchStorySpar(
  scene: Phaser.Scene,
  onEnd: (result: StorySparResult | null) => void,
  timeoutMs = STORY_BATTLE_START_TIMEOUT_MS,
): boolean {
  const story = getStoryBattleInit();
  if (!story) {
    return false;
  }
  const def = getStorySpar(story.sparId);
  const battle = scene.scene.get("BattleScene");
  let started = false;
  let settled = false;
  const watchdog = setTimeout(() => {
    if (started || settled) {
      return;
    }
    settled = true;
    battle.events.off("shutdown", onShutdown);
    forfeitStorySpar();
    onEnd(null);
  }, timeoutMs);
  const onCreate = (): void => {
    started = true;
    clearTimeout(watchdog);
  };
  const onShutdown = (): void => {
    battle.events.off("create", onCreate);
    clearTimeout(watchdog);
    if (settled) {
      return;
    }
    settled = true;
    const verdict = reportedResult?.id === story.sparId ? reportedResult.won : false;
    onEnd(resolveStorySpar(verdict));
  };
  battle.events.once("create", onCreate);
  battle.events.once("shutdown", onShutdown);
  scene.scene.launch("BattleScene", {
    wildCreatureId: def.boss?.spriteCreatureId ?? storySparRoster(def, story.rematch)[0]!.creatureId,
    wandererPartner: UNARMED_WANDERER,
    story,
  });
  return true;
}

/** Test-only reset. */
export function resetStorySparForTest(): void {
  if (active) {
    resumeHostPersist();
  }
  active = null;
  reportedResult = null;
  lastOutcome.clear();
  lostBeats.clear();
}
