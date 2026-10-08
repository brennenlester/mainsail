import {
  isFirstIslandLanded,
  setFirstIslandLanded,
  setMistwoodPathOpen,
  setOverworldUnlocked,
  setVillageGateUnlocked,
  worldState,
} from "../world/worldState";
import { isCodexComplete } from "../progression/achievements";
import { isVisitorMode } from "../world/worldSession";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { refreshQuestHud } from "../ui/questHud";
import { playerParty } from "../creatures/party";
import { getCreatureDefinition } from "../creatures/catalog";
import { SHRINE_EFFECTS } from "../shrine/shrineEffects";
import { getMaterialName } from "../inventory/materials";
import { addMaterial } from "../inventory/playerInventory";
import { formatCompanionJoinNote, QUEST_ORDER, QUESTS } from "./quests";
import { getSovereignVoyageHint } from "./sovereignVoyage";
import type {
  QuestEvent,
  QuestId,
  QuestObjective,
  QuestStatus,
} from "./questTypes";
import { LEGACY_QUEST_IDS, SPINE18_QUEST_IDS } from "./questTypes";

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

const CURRENT_QUEST_IDS = new Set<string>(QUEST_ORDER);

/** Ids only the pre-#369 registries wrote — their presence marks an old save. */
const RETIRED_QUEST_IDS = SPINE18_QUEST_IDS.filter(
  (id) => !CURRENT_QUEST_IDS.has(id),
);

function isRetiredQuestProgress(source: Record<string, unknown>): boolean {
  return RETIRED_QUEST_IDS.some((id) => id in source);
}

/**
 * Old 18-step (and 4-step legacy) step index → new beat index (#369).
 * Index = first old step that is not complete. Never regresses: every old
 * step at or past the first evolution lands on the rival beat with 1–4 done.
 */
export function mapRetiredStepToBeat(firstIncompleteOldIndex: number): number {
  const oldId = SPINE18_QUEST_IDS[firstIncompleteOldIndex];
  switch (oldId) {
    case "first-befriend":
      return QUEST_ORDER.indexOf("first-befriend");
    case "first-spar":
      return QUEST_ORDER.indexOf("first-spar");
    case "reach-village":
    case "shrine-craft":
      return QUEST_ORDER.indexOf("shrine-craft");
    case "evolve-bramblewarden":
      return QUEST_ORDER.indexOf("first-evolution");
    default:
      return QUEST_ORDER.indexOf("rival-wren");
  }
}

/** Map a pre-#369 save onto the 8-beat arc (one active, earlier beats complete). */
export function migrateRetiredQuestProgress(
  source: Record<string, unknown>,
): Record<QuestId, QuestStatus> {
  const migrated = createEmptyQuestProgress();
  const firstIncomplete = SPINE18_QUEST_IDS.findIndex(
    (id) => source[id] !== "complete",
  );
  if (firstIncomplete < 0) {
    for (const id of QUEST_ORDER) {
      migrated[id] = "complete";
    }
    return migrated;
  }
  const activeIndex = mapRetiredStepToBeat(firstIncomplete);
  QUEST_ORDER.forEach((id, index) => {
    if (index < activeIndex) {
      migrated[id] = "complete";
    } else if (index === activeIndex) {
      migrated[id] = "active";
    }
  });
  return migrated;
}

/** Restores current-arc saves as-is; migrates 4-step / 18-step saves (#369). */
export function normalizeQuestProgress(
  saved: Partial<Record<QuestId, QuestStatus>> | Record<string, unknown>,
): Record<QuestId, QuestStatus> {
  const source = saved as Record<string, unknown>;
  if (isRetiredQuestProgress(source)) {
    return migrateRetiredQuestProgress(source);
  }
  const normalized = createEmptyQuestProgress();
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

/** #312 18-step save shape (pre-#369). */
export function isSpine18QuestProgress(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const progress = value as Record<string, unknown>;
  return SPINE18_QUEST_IDS.every((id) => isQuestStatus(progress[id]));
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
  syncMistwoodPathForStoryQuest();
  // No gameplay catch-up here: party / zones may still be the previous
  // session's. applyWorldSnapshot runs syncStoryAfterWorldRestore() once they
  // are restored.
}

export function getActiveQuestId(): QuestId | null {
  return QUEST_ORDER.find((id) => questProgress[id] === "active") ?? null;
}

export function isMainStoryComplete(): boolean {
  return QUEST_ORDER.every((id) => questProgress[id] === "complete");
}

/** True when `questId` is the active beat or already complete. */
export function isQuestReached(questId: QuestId): boolean {
  const status = questProgress[questId];
  return status === "active" || status === "complete";
}

/**
 * First on-foot island stand: deliver the named Want once.
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
    return isMainStoryComplete() ? "Story: complete" : "Story: —";
  }
  const index = QUEST_ORDER.indexOf(activeId) + 1;
  return `Story ${index}/${STORY_QUEST_COUNT}: ${QUESTS[activeId].title}`;
}

export function getQuestNpcLine(): string | null {
  const activeId = getActiveQuestId();
  if (!activeId) {
    return null;
  }
  const line = QUESTS[activeId].npcLine;
  if (!line) {
    return null;
  }
  return `${line.speaker}: ${line.text}`;
}

export function getQuestHint(): string {
  const activeId = getActiveQuestId();
  if (!activeId) {
    if (!isMainStoryComplete()) {
      return "";
    }
    // Finale hook: the optional voyage toward Horizon / Eclipse fusion.
    const voyage = getSovereignVoyageHint();
    if (voyage) {
      return voyage;
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
        (objective.evolvesTo === undefined ||
          event.evolvesTo === objective.evolvesTo)
      );
    case "win_story_spar":
      return (
        event.type === "win_story_spar" && event.sparId === objective.sparId
      );
    case "story_finale":
      return event.type === "story_finale";
    default:
      return false;
  }
}

/** Cottage gate opens once the first-evolution beat starts (#349 Bryn gift). */
export function syncVillageGateForStoryQuest(): void {
  if (isVisitorMode() || !isQuestReached("first-evolution")) {
    return;
  }
  if (!worldState.villageGateUnlocked) {
    setVillageGateUnlocked(true);
  }
}

/**
 * Mistwood region gate (#369): open after the rival beat, or whenever the save
 * already walked Mistwood / Emberfen (pre-#369 saves never lose a path).
 */
export function syncMistwoodPathForStoryQuest(): void {
  setMistwoodPathOpen(
    questProgress["rival-wren"] === "complete" ||
      worldState.discoveredZones.includes("mistwood") ||
      worldState.discoveredZones.includes("emberfen"),
  );
}

const EVOLVED_FORM_IDS = new Set(
  SHRINE_EFFECTS.filter((effect) => effect.effectType === "evolution").map(
    (effect) => effect.evolvesTo,
  ),
);

function partyHasEvolvedForm(): boolean {
  return playerParty.creatures.some((creature) =>
    EVOLVED_FORM_IDS.has(creature.definitionId),
  );
}

/**
 * Catch-up for state reached before a beat became active — mainly migrated
 * saves: an evolved companion already counts for first-evolution, and a
 * walked Mistwood already counts for reach-mistwood. Optional side threads
 * (village asks, minigames, voyage) never feed the main arc.
 */
export function syncMainQuestFromGameplay(): void {
  if (isVisitorMode()) {
    return;
  }
  for (let pass = 0; pass < QUEST_ORDER.length; pass += 1) {
    const activeId = getActiveQuestId();
    let advanced = false;
    if (activeId === "first-evolution" && partyHasEvolvedForm()) {
      advanced = completeActiveQuest("first-evolution");
    } else if (
      activeId === "reach-mistwood" &&
      worldState.discoveredZones.includes("mistwood")
    ) {
      advanced = completeActiveQuest("reach-mistwood");
    }
    if (!advanced) {
      return;
    }
  }
}

/** After a snapshot restores party + zones (#369 migration catch-up). */
export function syncStoryAfterWorldRestore(): void {
  syncMistwoodPathForStoryQuest();
  syncMainQuestFromGameplay();
}

function completeActiveQuest(questId: QuestId, note?: string): boolean {
  if (getActiveQuestId() !== questId) {
    return false;
  }
  completeQuest(questId, note);
  return true;
}

function activateNextQuest(completedId: QuestId): void {
  const index = QUEST_ORDER.indexOf(completedId);
  const next = QUEST_ORDER[index + 1];
  if (next && questProgress[next] === "locked") {
    questProgress[next] = "active";
  }
  syncVillageGateForStoryQuest();
  syncMistwoodPathForStoryQuest();
  syncMainQuestFromGameplay();
}

function completeQuest(questId: QuestId, note?: string): void {
  const quest = QUESTS[questId];
  questProgress[questId] = "complete";
  lastCompletionMessage = `Quest complete: ${quest.title} — ${note ?? quest.payoff}`;

  if (quest.unlocksOverworld) {
    setOverworldUnlocked(true);
  }

  activateNextQuest(questId);
  notifyWorldChanged();
  refreshQuestHud();
}

function completionNote(event: QuestEvent): string | undefined {
  if (event.type === "befriend_creature" && event.creatureId) {
    const name = getCreatureDefinition(event.creatureId).name;
    return formatCompanionJoinNote(name, event.creatureId);
  }
  return undefined;
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

  completeQuest(activeId, completionNote(event));
  return true;
}

export function getGateStatusText(): string {
  const sparIndex = QUEST_ORDER.indexOf("first-spar") + 1;
  const rivalIndex = QUEST_ORDER.indexOf("rival-wren") + 1;
  const overworld =
    questProgress["first-spar"] === "complete"
      ? "Overworld: OPEN"
      : `Overworld: LOCKED (Story ${sparIndex}/${STORY_QUEST_COUNT})`;
  const village = worldState.villageGateUnlocked
    ? "Village: OPEN"
    : "Village: LOCKED (story)";
  const mistwood = worldState.mistwoodPathOpen
    ? "Mistwood: OPEN"
    : `Mistwood: LOCKED (Story ${rivalIndex}/${STORY_QUEST_COUNT})`;
  return `${overworld} · ${village} · ${mistwood}`;
}
