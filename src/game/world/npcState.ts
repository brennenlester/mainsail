import {
  addItem,
  addMaterial,
  consumeMaterial,
  getMaterialCount,
} from "../inventory/playerInventory";
import { getItemName, getMaterialName } from "../inventory/materials";
import { addToParty, getEffectiveMaxHp, playerParty } from "../creatures/party";
import { getCreatureDefinition } from "../creatures/catalog";
import {
  getTideSovereignObtained,
  markCreatureDiscovered,
  type BrynGroveStarterId,
  worldState,
} from "./worldState";
import { notifyWorldChanged } from "./worldSaveSchedule";
import { isVisitorMode } from "./worldSession";
import { ALL_NPC_IDS, type NpcDefinition, type NpcGift } from "./npcs";
import {
  SIDE_QUEST_IDS,
  SIDE_QUESTS,
  getSideQuestForNpc,
  isSideQuestId,
  type SideQuestDefinition,
  type SideQuestId,
  type SideQuestStatus,
} from "./sideQuests";
import {
  converseDailyAsk,
  ensureDailyAsk,
  getDailyAskState,
  resetDailyAskForTest,
  setDailyAskState,
} from "./dailyAsk";
import { getActiveQuestId, questProgress, recordQuestEvent, syncMainQuestFromGameplay } from "../story/questProgress";
import { HERMIT_NPC_ID } from "./hermitIsland";

const giftsClaimed = new Set<string>();
const sideQuestStatus = new Map<SideQuestId, SideQuestStatus>();

const ODD_NPC_ID = "hearthkeep-odd";
const BRYN_NPC_ID = "warden-bryn";
const GROVE_STARTER_ORDER: readonly BrynGroveStarterId[] = [
  "mossling",
  "ember-wisp",
];
const GROVE_STARTER_LINE: Record<BrynGroveStarterId, readonly string[]> = {
  mossling: ["mossling", "bramblewarden"],
  "ember-wisp": ["ember-wisp", "hearthflame"],
};
const ODD_REST_MATERIALS = ["wood", "wild-fiber", "pebble"] as const;
export const ODD_REST_FIRST_COST = 20;
export const ODD_REST_REPEAT_COST = 5;

export type ConversationPrompt =
  | { kind: "advance" }
  | { kind: "confirm-rest" };

export type Conversation = {
  lines: string[];
  prompt: ConversationPrompt;
};

let oddRestPurchased = false;

function defaultSideQuestStatus(): Map<SideQuestId, SideQuestStatus> {
  const map = new Map<SideQuestId, SideQuestStatus>();
  for (const id of SIDE_QUEST_IDS) {
    map.set(id, "locked");
  }
  return map;
}

for (const [id, status] of defaultSideQuestStatus()) {
  sideQuestStatus.set(id, status);
}

export function hasClaimedNpcGift(npcId: string): boolean {
  return giftsClaimed.has(npcId);
}

export { getDailyAskState, setDailyAskState };

export function getClaimedNpcGifts(): string[] {
  return ALL_NPC_IDS.filter((id) => giftsClaimed.has(id));
}

export function setClaimedNpcGifts(ids: string[]): void {
  giftsClaimed.clear();
  for (const id of ids) {
    if (ALL_NPC_IDS.includes(id)) {
      giftsClaimed.add(id);
    }
  }
}

export function getSideQuestStatuses(): Record<SideQuestId, SideQuestStatus> {
  const out = {} as Record<SideQuestId, SideQuestStatus>;
  for (const id of SIDE_QUEST_IDS) {
    out[id] = sideQuestStatus.get(id) ?? "locked";
  }
  return out;
}

export function setSideQuestStatuses(
  statuses: Partial<Record<string, string>>,
): void {
  for (const id of SIDE_QUEST_IDS) {
    sideQuestStatus.set(id, "locked");
  }
  for (const [id, status] of Object.entries(statuses)) {
    if (!isSideQuestId(id)) {
      continue;
    }
    if (status === "locked" || status === "active" || status === "complete") {
      sideQuestStatus.set(id, status);
    }
  }
}

export function getSideQuestStatus(id: SideQuestId): SideQuestStatus {
  return sideQuestStatus.get(id) ?? "locked";
}

export function hasPurchasedOddRest(): boolean {
  return oddRestPurchased;
}

export function setOddRestPurchased(purchased: boolean): void {
  oddRestPurchased = purchased;
}

export function getOddRestCost(): number {
  return oddRestPurchased ? ODD_REST_REPEAT_COST : ODD_REST_FIRST_COST;
}

export function formatGift(gift: NpcGift): string {
  const name =
    gift.kind === "material" ? getMaterialName(gift.id) : getItemName(gift.id);
  return `${name}×${gift.amount}`;
}

function grantGift(gift: NpcGift): void {
  if (gift.kind === "material") {
    addMaterial(gift.id, gift.amount);
  } else {
    addItem(gift.id, gift.amount);
  }
}

/**
 * Hands over an NPC's gift the first time you speak to them. Returns the line
 * to append to the conversation, or null when there is nothing left to give.
 */
export function claimNpcGift(npc: NpcDefinition): string | null {
  if (isVisitorMode() || giftsClaimed.has(npc.id)) {
    return null;
  }

  giftsClaimed.add(npc.id);
  grantGift(npc.gift);
  notifyWorldChanged();
  return `Take this — ${formatGift(npc.gift)}.`;
}

export function isSideQuestObjectiveMet(quest: SideQuestDefinition): boolean {
  const objective = quest.objective;
  if (objective.type === "discover_creatures") {
    return worldState.discoveredCreatures.length >= objective.count;
  }
  if (objective.type === "party_size") {
    return playerParty.creatures.length >= objective.count;
  }
  return objective.materials.every(
    (need) => getMaterialCount(need.id) >= need.amount,
  );
}

/**
 * Consumes delivery materials only when every required stack is present.
 * Returns false without mutating inventory if anything is short.
 */
export function tryConsumeDelivery(quest: SideQuestDefinition): boolean {
  if (quest.objective.type !== "deliver_materials") {
    return true;
  }
  const needs = quest.objective.materials;
  if (needs.some((need) => getMaterialCount(need.id) < need.amount)) {
    return false;
  }
  for (const need of needs) {
    if (!consumeMaterial(need.id, need.amount)) {
      // Should be unreachable after the pre-check; reverse any partial drain.
      for (const restored of needs) {
        if (restored === need) {
          break;
        }
        addMaterial(restored.id, restored.amount);
      }
      return false;
    }
  }
  return true;
}

function activateSideQuest(quest: SideQuestDefinition): string[] {
  sideQuestStatus.set(quest.id, "active");
  notifyWorldChanged();
  return [...quest.offerLines];
}

function turnInSideQuest(quest: SideQuestDefinition): string[] | null {
  if (!isSideQuestObjectiveMet(quest)) {
    return null;
  }
  if (!tryConsumeDelivery(quest)) {
    return null;
  }
  sideQuestStatus.set(quest.id, "complete");
  grantGift(quest.reward);
  notifyWorldChanged();
  syncMainQuestFromGameplay();
  return [
    ...quest.turnInLines,
    `Reward — ${formatGift(quest.reward)}.`,
  ];
}

const idleCursor = new Map<string, number>();

/** Rotates idle chatter so repeat visits are not identical. Not persisted. */
function nextIdleLine(npc: NpcDefinition): string {
  const index = idleCursor.get(npc.id) ?? 0;
  idleCursor.set(npc.id, (index + 1) % npc.idleLines.length);
  return npc.idleLines[index];
}

function talk(
  lines: string[],
  prompt: ConversationPrompt = { kind: "advance" },
): Conversation {
  return { lines, prompt };
}

function formatOddRestCost(cost: number): string {
  const parts = ODD_REST_MATERIALS.map(
    (id) => `${getMaterialName(id)} ×${cost}`,
  );
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function partyNeedsOddRest(): boolean {
  return playerParty.creatures.some(
    (creature) => creature.currentHp < getEffectiveMaxHp(creature),
  );
}

function canAffordOddRest(cost: number): boolean {
  return ODD_REST_MATERIALS.every((id) => getMaterialCount(id) >= cost);
}

function consumeOddRest(cost: number): boolean {
  if (!canAffordOddRest(cost)) {
    return false;
  }
  for (const id of ODD_REST_MATERIALS) {
    if (!consumeMaterial(id, cost)) {
      for (const restored of ODD_REST_MATERIALS) {
        if (restored === id) {
          break;
        }
        addMaterial(restored, cost);
      }
      return false;
    }
  }
  return true;
}

function healPartyFully(): void {
  for (const creature of playerParty.creatures) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
}

function oddRestTalk(): Conversation {
  const cost = getOddRestCost();
  const costLabel = formatOddRestCost(cost);
  if (playerParty.creatures.length === 0 || !partyNeedsOddRest()) {
    return talk([
      "They are already warm through. Come back when the road has worn them.",
    ]);
  }
  if (!canAffordOddRest(cost)) {
    return talk([
      `Bring ${costLabel} and I will see to the whole party.`,
    ]);
  }
  return talk(
    [`Sit. I can see the whole party right for ${costLabel}.`],
    { kind: "confirm-rest" },
  );
}

/**
 * Confirm Odd's paid rest. No-op unless the host can afford the current cost
 * and at least one party creature is injured or fainted.
 */
export function confirmOddRest(): string[] {
  if (
    isVisitorMode() ||
    getSideQuestStatus("odd-company") !== "complete"
  ) {
    return ["The fire is for the folk who live here."];
  }
  const cost = getOddRestCost();
  if (playerParty.creatures.length === 0 || !partyNeedsOddRest()) {
    return [
      "They are already warm through. Come back when the road has worn them.",
    ];
  }
  if (!consumeOddRest(cost)) {
    return [`Bring ${formatOddRestCost(cost)} and I will see to the whole party.`];
  }
  healPartyFully();
  oddRestPurchased = true;
  notifyWorldChanged();
  return ["There. Whole again. The hearth does not mind the work."];
}

function tryAdvanceOddCompanyMainQuest(): void {
  if (getActiveQuestId() !== "odd-company") {
    return;
  }
  if (getSideQuestStatus("odd-company") !== "complete") {
    return;
  }
  recordQuestEvent({
    type: "party_size",
    count: 3,
  });
}

function partyHasGroveLine(starterId: BrynGroveStarterId): boolean {
  const ids = GROVE_STARTER_LINE[starterId];
  return playerParty.creatures.some(
    (creature) =>
      ids.includes(creature.definitionId) || ids.includes(creature.speciesId),
  );
}

/** Host-only Grove starter from Bryn after the village gate opens (#349). */
function tryGrantBrynGroveStarter(npc: NpcDefinition): string | null {
  if (npc.id !== BRYN_NPC_ID || isVisitorMode() || !worldState.villageGateUnlocked) {
    return null;
  }
  const next = GROVE_STARTER_ORDER.find(
    (id) =>
      !worldState.brynGroveStartersGifted.includes(id) && !partyHasGroveLine(id),
  );
  if (!next) {
    return null;
  }
  addToParty(next, 1);
  markCreatureDiscovered(next);
  worldState.brynGroveStartersGifted.push(next);
  notifyWorldChanged();
  const name = getCreatureDefinition(next).name;
  return `You're short a Grove companion. Take this ${name} — both lines walk the shrine path.`;
}

function shouldYieldSideQuestToDailyAsk(npcId: string): boolean {
  const ask = getDailyAskState() ?? ensureDailyAsk();
  return ask?.npcId === npcId && ask.status !== "complete";
}

function isSideAskOnCurrentBeat(quest: SideQuestDefinition): boolean {
  if (getActiveQuestId() === quest.id) {
    return true;
  }
  // Old saves may have auto-completed the main step from party size / deliver
  // without talking; still offer so the reward and Odd's rest are reachable.
  return questProgress[quest.id] === "complete";
}

function sideQuestConversation(npc: NpcDefinition): Conversation | null {
  const quest = getSideQuestForNpc(npc.id);
  if (!quest) {
    return null;
  }
  const status = getSideQuestStatus(quest.id);
  if (status === "locked") {
    if (!isSideAskOnCurrentBeat(quest)) {
      return null;
    }
    return talk(activateSideQuest(quest));
  }
  if (status === "active") {
    if (!isSideAskOnCurrentBeat(quest)) {
      return null;
    }
    const turnIn = turnInSideQuest(quest);
    if (turnIn) {
      return talk(turnIn);
    }
    return talk([quest.progressLine]);
  }
  if (status === "complete") {
    if (shouldYieldSideQuestToDailyAsk(npc.id)) {
      return null;
    }
    if (npc.id === ODD_NPC_ID) {
      return oddRestTalk();
    }
    return talk([quest.completeLine]);
  }
  return null;
}

/**
 * Lines and prompt for one conversation: first-visit gift, then side-quest
 * offer / progress / turn-in, then Odd's rest or idle chatter. Visitors never
 * claim gifts, move side-quest state, or rest.
 */
export function beginConversation(npc: NpcDefinition): Conversation {
  if (npc.id === HERMIT_NPC_ID) {
    return hermitConversation(npc);
  }

  if (!hasClaimedNpcGift(npc.id)) {
    const lines = [...npc.introLines];
    const giftLine = claimNpcGift(npc);
    if (giftLine) {
      lines.push(giftLine);
    }
    const starterLine = tryGrantBrynGroveStarter(npc);
    if (starterLine) {
      lines.push(starterLine);
    }
    return talk(lines);
  }

  if (isVisitorMode()) {
    return talk([nextIdleLine(npc)]);
  }

  const starterLine = tryGrantBrynGroveStarter(npc);
  if (starterLine) {
    return talk([starterLine]);
  }

  const sideQuest = sideQuestConversation(npc);
  if (sideQuest) {
    if (npc.id === ODD_NPC_ID) {
      tryAdvanceOddCompanyMainQuest();
    }
    return sideQuest;
  }

  const dailyLines = converseDailyAsk(npc.id);
  if (dailyLines) {
    return talk(dailyLines);
  }

  return talk([nextIdleLine(npc)]);
}

function hermitConversation(npc: NpcDefinition): Conversation {
  if (!hasClaimedNpcGift(npc.id)) {
    const lines = [...npc.introLines];
    const giftLine = claimNpcGift(npc);
    if (giftLine) {
      lines.push(giftLine);
    }
    if (!isVisitorMode() && getTideSovereignObtained() > 0) {
      lines.push(
        "You already met the Tide Sovereign. When the village story calls you back, the east gate opens on its own.",
      );
    }
    return talk(lines);
  }

  if (isVisitorMode()) {
    return talk([nextIdleLine(npc)]);
  }

  if (getTideSovereignObtained() > 0) {
    const lines = [
      "You met the Tide Sovereign. Good.",
      "When the village story calls you back, the east gate at Hearth Crossing opens on its own.",
    ];
    if (getActiveQuestId() === "obtain-cairn-sovereign") {
      lines.push(
        "Stone Sovereign keeps the cairn isle due south of here — sail south, not east, to the gray rock ringed with standing stones.",
      );
    }
    return talk(lines);
  }

  return talk([nextIdleLine(npc)]);
}

export function openConversation(npc: NpcDefinition): string[] {
  return beginConversation(npc).lines;
}

/** Active side quests for the status panel / HUD hint. */
export function getActiveSideQuestSummaries(): string[] {
  return SIDE_QUEST_IDS.filter(
    (id) =>
      getSideQuestStatus(id) === "active" &&
      isSideAskOnCurrentBeat(SIDE_QUESTS[id]),
  ).map((id) => {
    const quest = SIDE_QUESTS[id];
    return `${quest.title}: ${quest.progressLine}`;
  });
}

/** Short HUD line for the first active village ask, if any. */
export function getActiveSideQuestHint(): string | null {
  const daily = ensureDailyAsk();
  if (daily && daily.status === "active") {
    return `Daily ask: bring ${daily.amount} ${getMaterialName(daily.materialId)}`;
  }
  const id = SIDE_QUEST_IDS.find(
    (questId) =>
      getSideQuestStatus(questId) === "active" &&
      isSideAskOnCurrentBeat(SIDE_QUESTS[questId]),
  );
  if (!id) {
    return null;
  }
  return `Village ask: ${SIDE_QUESTS[id].title}`;
}

/** Test-only reset so suites do not leak claim / quest state between cases. */
export function resetNpcStateForTest(): void {
  resetDailyAskForTest();
  giftsClaimed.clear();
  idleCursor.clear();
  oddRestPurchased = false;
  worldState.brynGroveStartersGifted = [];
  for (const [id, status] of defaultSideQuestStatus()) {
    sideQuestStatus.set(id, status);
  }
}
