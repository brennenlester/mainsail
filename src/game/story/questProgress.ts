import {
  isFirstIslandLanded,
  setFirstIslandLanded,
  setOverworldUnlocked,
  setVillageGateUnlocked,
  worldState,
} from "../world/worldState";
import { isCodexComplete } from "../progression/achievements";
import { isVisitorMode } from "../world/worldSession";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { refreshQuestHud } from "../ui/questHud";
import { playerParty } from "../creatures/party";
import { hasClaimedMinigameWin } from "../minigames/progress";
import { getSideQuestStatuses } from "../world/npcState";
import { getMaterialName } from "../inventory/materials";
import { addMaterial, SOVEREIGN_SEAL_ID } from "../inventory/playerInventory";
import { QUEST_ORDER, QUESTS } from "./quests";
import type {
  QuestEvent,
  QuestId,
  QuestObjective,
  QuestStatus,
} from "./questTypes";
import { LEGACY_QUEST_IDS } from "./questTypes";

const VALID_QUEST_STATUSES = new Set<QuestStatus>([
  "locked",
  "active",
  "complete",
]);

export function createEmptyQuestProgress(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
}

export const questProgress: Record<QuestId, QuestStatus> =
  createEmptyQuestProgress();

let lastCompletionMessage: string | null = null;

export const STORY_QUEST_COUNT = QUEST_ORDER.length;

/** #270 second-act Want: Folklore Dust (accepted currency; not a parallel id). */
export const SECOND_ACT_WANT_MATERIAL_ID = "folklore-dust";

/** One-shot island-landing grant — enough for early Dust sinks without re-tuning spars. */
export const SECOND_ACT_WANT_AMOUNT = 5;

function isQuestStatus(value: unknown): value is QuestStatus {
  return (
    typeof value === "string" && VALID_QUEST_STATUSES.has(value as QuestStatus)
  );
}

/** Additive migration: legacy 4-step saves map into steps 1–4; missing ids lock. */
export function normalizeQuestProgress(
  saved: Partial<Record<QuestId, QuestStatus>> | Record<string, unknown>,
): Record<QuestId, QuestStatus> {
  const normalized = createEmptyQuestProgress();
  const source = saved as Record<string, unknown>;
  for (const id of QUEST_ORDER) {
    const status = source[id];
    if (isQuestStatus(status)) {
      normalized[id] = status;
    }
  }
  return normalized;
}

export function isLegacyQuestProgress(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const progress = value as Record<string, unknown>;
  const keys = Object.keys(progress);
  if (keys.length !== LEGACY_QUEST_IDS.length) {
    return false;
  }
  for (const id of LEGACY_QUEST_IDS) {
    if (!isQuestStatus(progress[id])) {
      return false;
    }
  }
  return true;
}

export function isFullQuestProgress(value: unknown): value is Record<
  QuestId,
  QuestStatus
> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const progress = value as Record<string, unknown>;
  for (const questId of QUEST_ORDER) {
    if (!isQuestStatus(progress[questId])) {
      return false;
    }
  }
  return true;
}

function ensureActiveQuest(): void {
  if (!QUEST_ORDER.some((id) => questProgress[id] === "active")) {
    const next = QUEST_ORDER.find((id) => questProgress[id] !== "complete");
    if (next) {
      questProgress[next] = "active";
    }
  }
}

export function initQuestProgress(): void {
  if (questProgress["first-befriend"] === "locked") {
    questProgress["first-befriend"] = "active";
  }
}

export function restoreQuestProgress(
  saved: Partial<Record<QuestId, QuestStatus>> | Record<string, unknown>,
): void {
  const normalized = normalizeQuestProgress(saved);
  for (const id of QUEST_ORDER) {
    questProgress[id] = normalized[id];
  }
  ensureActiveQuest();
  syncVillageGateForStoryQuest();
  syncMainQuestFromGameplay();
}

export function getActiveQuestId(): QuestId | null {
  return QUEST_ORDER.find((id) => questProgress[id] === "active") ?? null;
}

const POST_STORY_NEXT = {
  harbor: "Next: reach Moonwake Harbor",
  // Pre-boarding lines name the Want object (Folklore Dust), not place alone (#270 AC1).
  sail: "Next: sail east for Folklore Dust",
  islands: "Next: claim Folklore Dust ashore",
} as const;

/** Post-story HUD Next while main quest is done and before first island landing. */
export function getPostStoryNext(): string | null {
  const done = QUEST_ORDER.every((id) => questProgress[id] === "complete");
  if (!done) {
    return null;
  }
  if (!worldState.discoveredZones.includes("harbor")) {
    return POST_STORY_NEXT.harbor;
  }
  if (!worldState.discoveredZones.includes("archipelago")) {
    return POST_STORY_NEXT.sail;
  }
  if (!isFirstIslandLanded()) {
    return POST_STORY_NEXT.islands;
  }
  return null;
}

/**
 * First on-foot island stand: deliver the named Want, clear the Next chain.
 * Returns true when Dust was granted (host only; visitors mark landed without grant).
 */
export function claimSecondActWantOnIslandLand(): boolean {
  if (isFirstIslandLanded()) {
    return false;
  }
  setFirstIslandLanded(true);
  if (isVisitorMode()) {
    return false;
  }
  addMaterial(SECOND_ACT_WANT_MATERIAL_ID, SECOND_ACT_WANT_AMOUNT);
  lastCompletionMessage = `Island bounty: ${getMaterialName(SECOND_ACT_WANT_MATERIAL_ID)}×${SECOND_ACT_WANT_AMOUNT}`;
  refreshQuestHud();
  return true;
}

export function getQuestSummary(): string {
  const activeId = getActiveQuestId();
  if (!activeId) {
    const post = getPostStoryNext();
    if (post) {
      return post;
    }
    const done = QUEST_ORDER.every((id) => questProgress[id] === "complete");
    return done ? "Story: complete" : "Story: —";
  }
  const index = QUEST_ORDER.indexOf(activeId) + 1;
  return `Story ${index}/${STORY_QUEST_COUNT}: ${QUESTS[activeId].title}`;
}

export function getQuestHint(): string {
  const activeId = getActiveQuestId();
  if (!activeId) {
    const done = QUEST_ORDER.every((id) => questProgress[id] === "complete");
    if (!done) {
      return "";
    }
    // While the post-story Next chain occupies the story slot, keep the hint empty.
    if (getPostStoryNext()) {
      return "";
    }
    // Subtle nudge only — the codex reward is never named before it is earned.
    if (isCodexComplete(worldState.discoveredCreatures)) {
      return "All story beats finished — explore freely. Eclipse Sovereign fusion remains a deeper mystery.";
    }
    return "All story beats finished — explore freely. Your codex still has blank pages.";
  }
  return `Next: ${QUESTS[activeId].hint}`;
}

export function peekQuestCompletionMessage(): string | null {
  return lastCompletionMessage;
}

export function consumeQuestToast(): string | null {
  const message = lastCompletionMessage;
  lastCompletionMessage = null;
  return message;
}

function objectiveMatches(
  objective: QuestObjective,
  event: QuestEvent,
): boolean {
  switch (objective.type) {
    case "enter_zone":
      return event.type === "enter_zone" && event.zoneId === objective.zoneId;
    case "befriend_creature":
      return event.type === "befriend_creature";
    case "win_spar":
      return event.type === "win_spar";
    case "craft_item":
      return event.type === "craft_item";
    case "evolve_creature":
      return (
        event.type === "evolve_creature" &&
        event.evolvesTo === objective.evolvesTo
      );
    case "unlock_village_gate":
      return event.type === "unlock_village_gate";
    case "party_size":
      return (
        event.type === "party_size" && event.count >= objective.count
      );
    case "complete_minigame":
      return (
        event.type === "complete_minigame" &&
        event.minigameId === objective.minigameId
      );
    case "discover_creatures":
      return (
        event.type === "discover_creatures" &&
        event.count >= objective.count
      );
    case "deliver_materials":
      return event.type === "deliver_materials";
    case "craft_item_id":
      return (
        event.type === "craft_item_id" && event.itemId === objective.itemId
      );
    case "obtain_creature":
      return (
        event.type === "obtain_creature" &&
        event.creatureId === objective.creatureId
      );
    case "fuse_horizon":
      return event.type === "fuse_horizon";
    default:
      return false;
  }
}

const VILLAGE_GATE_QUEST_INDEX = QUEST_ORDER.indexOf("open-village-gate");

function isAtOrPastVillageGateQuest(): boolean {
  for (let i = VILLAGE_GATE_QUEST_INDEX; i < QUEST_ORDER.length; i += 1) {
    const status = questProgress[QUEST_ORDER[i]];
    if (status === "active" || status === "complete") {
      return true;
    }
  }
  return false;
}

/** Story step 7+: east cottage gate opens without a code (#318). */
function syncVillageGateForStoryQuest(): void {
  if (isVisitorMode() || !isAtOrPastVillageGateQuest()) {
    return;
  }
  if (!worldState.villageGateUnlocked) {
    setVillageGateUnlocked(true);
  }
  if (getActiveQuestId() === "open-village-gate") {
    recordQuestEvent({ type: "unlock_village_gate" });
  }
}

/**
 * Bridge village side quests / minigames into the linear main quest (steps 8–13).
 * Loops so saves that finished content out-of-order catch up on load.
 */
export function syncMainQuestFromGameplay(): void {
  if (isVisitorMode()) {
    return;
  }
  const sideStatuses = getSideQuestStatuses();
  for (let pass = 0; pass < QUEST_ORDER.length; pass += 1) {
    const activeId = getActiveQuestId();
    if (!activeId) {
      return;
    }
    let advanced = false;
    switch (activeId) {
      case "odd-company":
        if (sideStatuses["odd-company"] === "complete") {
          advanced = recordQuestEvent({
            type: "party_size",
            count: playerParty.creatures.length,
          });
        }
        break;
      case "hearth-lots":
        if (hasClaimedMinigameWin("hearth-lots")) {
          advanced = recordQuestEvent({
            type: "complete_minigame",
            minigameId: "hearth-lots",
          });
        }
        break;
      case "bryn-ledger":
        if (sideStatuses["bryn-ledger"] === "complete") {
          advanced = recordQuestEvent({
            type: "discover_creatures",
            count: worldState.discoveredCreatures.length,
          });
        }
        break;
      case "ward-crossing":
        if (hasClaimedMinigameWin("ward-crossing")) {
          advanced = recordQuestEvent({
            type: "complete_minigame",
            minigameId: "ward-crossing",
          });
        }
        break;
      case "sable-thread":
        if (sideStatuses["sable-thread"] === "complete") {
          advanced = recordQuestEvent({ type: "deliver_materials" });
        }
        break;
      case "loom-pattern":
        if (hasClaimedMinigameWin("loom-pattern")) {
          advanced = recordQuestEvent({
            type: "complete_minigame",
            minigameId: "loom-pattern",
          });
        }
        break;
      default:
        return;
    }
    if (!advanced) {
      return;
    }
  }
}

function activateNextQuest(completedId: QuestId): void {
  const index = QUEST_ORDER.indexOf(completedId);
  const next = QUEST_ORDER[index + 1];
  if (next && questProgress[next] === "locked") {
    questProgress[next] = "active";
  }
  syncVillageGateForStoryQuest();
  syncMainQuestFromGameplay();
}

function completeQuest(questId: QuestId): void {
  const quest = QUESTS[questId];
  questProgress[questId] = "complete";
  lastCompletionMessage = `Quest complete: ${quest.title}`;

  if (quest.unlocksOverworld) {
    setOverworldUnlocked(true);
    lastCompletionMessage += " — Overworld gate opened!";
  }

  activateNextQuest(questId);
  notifyWorldChanged();
  refreshQuestHud();
}

export function recordCraftOutputQuestEvents(outputItemId: string): void {
  if (outputItemId === "boat") {
    recordQuestEvent({ type: "craft_item_id", itemId: "boat" });
  }
  if (outputItemId === SOVEREIGN_SEAL_ID) {
    recordQuestEvent({ type: "craft_item_id", itemId: SOVEREIGN_SEAL_ID });
  }
}

export function recordQuestEvent(event: QuestEvent): boolean {
  if (isVisitorMode()) {
    return false;
  }

  const activeId = getActiveQuestId();
  if (!activeId) {
    return false;
  }

  const quest = QUESTS[activeId];
  if (!objectiveMatches(quest.objective, event)) {
    return false;
  }

  completeQuest(activeId);
  return true;
}

export function getGateStatusText(): string {
  const sparIndex = QUEST_ORDER.indexOf("first-spar") + 1;
  const overworld =
    questProgress["first-spar"] === "complete"
      ? "Overworld: OPEN"
      : `Overworld: LOCKED (Story ${sparIndex}/${STORY_QUEST_COUNT})`;
  const village = worldState.villageGateUnlocked
    ? "Village: OPEN"
    : "Village: LOCKED (story)";
  return `${overworld} · ${village}`;
}
