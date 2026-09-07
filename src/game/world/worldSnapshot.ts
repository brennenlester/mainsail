import {
  getNextInstanceId,
  playerParty,
  setPartyFromSnapshot,
  ACTIVE_PARTY_LIMIT,
  countCreatures,
  migratePartyHpForLevelScaling,
  clampPartyHpToEffectiveMax,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { FOLKLORE_TYPES } from "../creatures/folkloreTypes";
import { withStagedCraftingItems, withStagedCraftingMaterials } from "../crafting/stagedMaterials";
import {
  playerInventory,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import {
  restoreQuestProgress,
  questProgress,
  isFullQuestProgress,
  isLegacyQuestProgress,
  syncVillageGateForStoryQuest,
} from "../story/questProgress";
import {
  getHudChromeSnapshot,
  setHudChromeFromSnapshot,
  refreshHudChromeButtons,
} from "../ui/hudChrome";
import {
  getShrineDisclosureSnapshot,
  setShrineDisclosureFromSnapshot,
} from "../shrine/shrineDisclosure";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { reopenParentSovereignEncounters } from "../shrine/godFusion";
import { migrateLegacyPresenceCharmBuffs } from "../shrine/presence";
import { CAIRN_SOVEREIGN_ID } from "../encounters/godLand";
import { TIDE_SOVEREIGN_ID } from "../encounters/godSail";
import {
  worldState,
  MAX_SOVEREIGN_COPIES,
  setCairnSovereignObtained,
  setDiscoveredCreatures,
  setDiscoveredZones,
  setEclipseFusionCompleted,
  setFirstIslandLanded,
  setGodLandEncounterClaimed,
  setGodSailEncounterClaimed,
  setHarborBefriendUsed,
  setBrynGroveStartersGifted,
  isBrynGroveStarterId,
  setHorizonFusionCount,
  setOverworldUnlocked,
  setSovereignPlateActive,
  setStory1BefriendGuaranteeConsumed,
  setTideSovereignObtained,
  setVillageGateUnlocked,
} from "./worldState";
import { VILLAGE_CODE_GATE } from "./villageGate";
import {
  evaluateCodexAchievement,
  getUnlockedAchievements,
  isAchievementId,
  setUnlockedAchievements,
} from "../progression/achievements";
import { ALL_NPC_IDS } from "./npcs";
import {
  getClaimedNpcGifts,
  getSideQuestStatuses,
  hasPurchasedOddRest,
  setClaimedNpcGifts,
  setOddRestPurchased,
  setSideQuestStatuses,
} from "./npcState";
import {
  getDailyAskState,
  setDailyAskState,
  type DailyAskState,
} from "./dailyAsk";
import {
  sparWinsBySpecies,
  setSparWinsBySpecies,
} from "./sparWins";
import { CREATURE_MATERIALS } from "../inventory/materials";
import {
  getClaimedMinigameWins,
  setClaimedMinigameWins,
} from "../minigames/progress";
import { isMinigameId } from "../minigames/ids";
import { isSideQuestId, type SideQuestId, type SideQuestStatus } from "./sideQuests";
import {
  isBoatPlaced,
  isNearEastLandingDock,
  isSailing,
  getMooredDock,
  setMooredDock,
  setPlacedBoat,
  setSailing,
  HARBOR_DOCK,
  HARBOR_PIER,
  HARBOR_EMBARK_WATER,
  type HarborDockId,
} from "./dockBoat";
import {
  ARCHIPELAGO_ENTRY,
  ARCHIPELAGO_MAX_WIDTH,
  isArchipelagoSailPosition,
  isArchipelagoIslandPosition,
  isSailableZone,
  listIslandTemplates,
  prepareArchipelagoForPosition,
} from "./archipelagoStream";
import { TileType, type ZoneId } from "./zoneTypes";
import { ZONES } from "./zones";
import { CREATURES } from "../creatures/catalog";
import { isVisitorMode } from "./worldSession";
import {
  PLAYER_NAME_MAX_LENGTH,
  getPlayerName,
  normalizePlayerName,
  setPlayerName,
} from "./playerName";

export type WorldSnapshot = {
  version: 1;
  hostLabel: string;
  /** Host player display name for the overworld nametag. Optional for older saves. */
  playerName?: string;
  overworldUnlocked: boolean;
  /** East cottage gate unlocked via hermit code (#291). Optional for older saves. */
  villageGateUnlocked?: boolean;
  /** Zones visited. Optional for older saves. */
  discoveredZones?: ZoneId[];
  /** Creature species discovered via encounter. Optional for older saves. */
  discoveredCreatures?: string[];
  /** Secret achievements already earned. Optional for older saves. */
  unlockedAchievements?: string[];
  /** Villagers whose one-time gift is spent. Optional for older saves. */
  claimedNpcGifts?: string[];
  /** True after Odd's first paid rest. Optional for older saves. */
  oddRestPurchased?: boolean;
  /** Codex HUD button unlocked. Optional for older saves. */
  hudCodexUnlocked?: boolean;
  /** Recipes HUD button unlocked. Optional for older saves. */
  hudRecipesUnlocked?: boolean;
  /** First-shrine craft spotlight already cleared. Optional for older saves. */
  shrineCraftSpotlightCleared?: boolean;
  /** Fusion tab already revealed (sticky). Optional for older saves. */
  shrineFusionDisclosed?: boolean;
  /** Cottage minigames already paid out. Optional for older saves. */
  claimedMinigameWins?: string[];
  /** NPC side-quest progress. Optional for older saves. */
  npcSideQuests?: Partial<Record<SideQuestId, SideQuestStatus>>;
  /** Rotating daily villager ask. Optional for older saves. */
  dailyAsk?: DailyAskState | null;
  /** Boat moored at the Harbor dock. Optional for older saves. */
  placedBoat?: boolean;
  /** Which Harbor dock holds the moored boat. Optional for older saves. */
  mooredDock?: "west" | "east";
  /** Player is sailing on Harbor / Archipelago water. Optional for older saves. */
  sailing?: boolean;
  /** Tide Sovereign has been obtained. Optional for older saves. */
  godSailEncounterClaimed?: boolean;
  /** Story 1 first-befriend guarantee already used. Optional for older saves. */
  story1BefriendGuaranteeConsumed?: boolean;
  /** Harbor once-per-species Befriend claims (#275). Optional for older saves. */
  harborBefriendUsed?: string[];
  /** Grove starters Bryn already gifted (#349). Optional for older saves. */
  brynGroveStartersGifted?: string[];
  /** Sovereign Plate wild-encounter suppress toggle (#289). Optional for older saves. */
  sovereignPlateActive?: boolean;
  /** Per-species spar win counts for wild level scaling (#287). Optional for older saves. */
  sparWinsBySpecies?: Record<string, number>;
  /** Optional: post-Story Next — first archipelago island stand. */
  firstIslandLanded?: boolean;
  /** Lifetime Tide Sovereign claims (0–2). Optional for older saves. */
  tideSovereignObtained?: number;
  /** Stone Sovereign has been obtained. Optional for older saves. */
  godLandEncounterClaimed?: boolean;
  /** Lifetime Stone Sovereign claims (0–2). Optional for older saves. */
  cairnSovereignObtained?: number;
  /** Dual-god Horizon fusion completed at least once. Optional for older saves. */
  godFusionCompleted?: boolean;
  /** Tide+Cairn → Horizon fusion count (0–2). Optional for older saves. */
  horizonFusionCount?: number;
  /** Two Horizons fused into Eclipse. Optional for older saves. */
  eclipseFusionCompleted?: boolean;
  questProgress: Record<QuestId, QuestStatus>;
  party: CreatureInstance[];
  /** Active battle party instance ids (max 7). Optional for older saves. */
  activePartyIds?: string[];
  nextInstanceId: number;
  materials: Record<string, number>;
  items: Record<string, number>;
  position: {
    zoneId: ZoneId;
    x: number;
    y: number;
  };
};

export type PendingWorldPosition = WorldSnapshot["position"];

const VALID_ZONE_IDS = new Set<ZoneId>(Object.keys(ZONES) as ZoneId[]);
const VALID_CREATURE_IDS = new Set(CREATURES.map((c) => c.id));
const CODEX_CREATURE_IDS = new Set(
  CREATURES.filter((creature) => !creature.excludeFromCodex).map(
    (creature) => creature.id,
  ),
);

const MAX_LEVEL = 100;
const MAX_HP = 10_000;
const MAX_COUNT = 1_000_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeCount(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= MAX_COUNT;
}

function isSpawnWalkable(
  zoneId: ZoneId,
  x: number,
  y: number,
  overworldUnlocked: boolean,
  sailing = false,
  villageGateUnlocked = false,
): boolean {
  // Validate archipelago mid-sail / island stands without mutating the live stream.
  if (zoneId === "archipelago") {
    if (sailing) {
      return isArchipelagoSailPosition(x, y);
    }
    return isArchipelagoIslandPosition(x, y);
  }
  const zone = ZONES[zoneId];
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= zone.width ||
    tileY >= zone.height
  ) {
    return false;
  }
  const tile = zone.tiles[tileY][tileX];
  if (tile === TileType.Floor || tile === TileType.Dock) {
    return true;
  }
  // Mid-sail saves restore onto Water in Harbor.
  if (sailing && zoneId === "harbor" && tile === TileType.Water) {
    return true;
  }
  if (tile === TileType.OverworldGate) {
    return overworldUnlocked;
  }
  if (tile === TileType.VillageGate) {
    return villageGateUnlocked;
  }
  return false;
}

function acceptsQuestProgress(value: unknown): boolean {
  return isFullQuestProgress(value) || isLegacyQuestProgress(value);
}

function isValidCountMap(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const count of Object.values(value as Record<string, unknown>)) {
    if (!isNonNegativeCount(count)) {
      return false;
    }
  }
  return true;
}

const VALID_FOLKLORE_TYPES = new Set<string>(FOLKLORE_TYPES);

/**
 * Ceiling for the mint counter and `c-<n>` id suffixes. Legitimate counters
 * grow by one per befriend/fusion and stay far below this; anything above is
 * a crafted save that could force the floor computation into duplicate-id
 * territory at the 2^53 precision boundary (#192).
 */
const MAX_INSTANCE_COUNTER = 1_000_000_000;

function isValidMoveDefinition(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const move = value as Record<string, unknown>;
  return (
    typeof move.id === "string" &&
    typeof move.name === "string" &&
    isFiniteNumber(move.power) &&
    typeof move.type === "string" &&
    VALID_FOLKLORE_TYPES.has(move.type) &&
    isFiniteNumber(move.accuracy) &&
    move.accuracy >= 0 &&
    move.accuracy <= 100
  );
}

function isValidPartyMember(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const creature = value as Record<string, unknown>;
  if (
    typeof creature.definitionId !== "string" ||
    !VALID_CREATURE_IDS.has(creature.definitionId)
  ) {
    return false;
  }
  if (
    typeof creature.instanceId !== "string" ||
    creature.instanceId.length === 0
  ) {
    return false;
  }
  // Mint-pattern ids above the counter ceiling can only come from crafted
  // saves and would push the mint floor into duplicate territory (#192).
  const mintedId = /^c-(\d+)$/.exec(creature.instanceId);
  if (mintedId && Number(mintedId[1]) > MAX_INSTANCE_COUNTER) {
    return false;
  }
  if (
    !isFiniteNumber(creature.level) ||
    creature.level < 1 ||
    creature.level > MAX_LEVEL
  ) {
    return false;
  }
  if (
    !isFiniteNumber(creature.currentHp) ||
    creature.currentHp < 0 ||
    creature.currentHp > MAX_HP
  ) {
    return false;
  }
  if (!isFiniteNumber(creature.xp) || creature.xp < 0) {
    return false;
  }
  if (
    creature.hpBonus !== undefined &&
    (!isFiniteNumber(creature.hpBonus) || creature.hpBonus < 0)
  ) {
    return false;
  }
  if (
    creature.attackBonus !== undefined &&
    (!isFiniteNumber(creature.attackBonus) || creature.attackBonus < 0)
  ) {
    return false;
  }
  // speciesId is optional (pre-evolution saves lack it; applyWorldSnapshot
  // backfills from definitionId) but must name a real creature when present.
  if (
    creature.speciesId !== undefined &&
    (typeof creature.speciesId !== "string" ||
      !VALID_CREATURE_IDS.has(creature.speciesId))
  ) {
    return false;
  }
  if (
    creature.secondaryElement !== undefined &&
    (typeof creature.secondaryElement !== "string" ||
      !VALID_FOLKLORE_TYPES.has(creature.secondaryElement))
  ) {
    return false;
  }
  if (
    creature.secondaryMove !== undefined &&
    !isValidMoveDefinition(creature.secondaryMove)
  ) {
    return false;
  }
  if (
    creature.appliedEffects !== undefined &&
    (!Array.isArray(creature.appliedEffects) ||
      creature.appliedEffects.some((effect) => typeof effect !== "string"))
  ) {
    return false;
  }
  if (creature.trait !== undefined) {
    if (typeof creature.trait !== "object" || creature.trait === null) {
      return false;
    }
    const trait = creature.trait as Record<string, unknown>;
    if (trait.kind === "immunity") {
      if (typeof trait.to !== "string") {
        return false;
      }
    } else if (trait.kind === "damage-buff") {
      if (
        typeof trait.moveId !== "string" ||
        !isFiniteNumber(trait.multiplier) ||
        trait.multiplier <= 0
      ) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Pre-#89 boat gameplay lived on Folklore Fields south dock.
 * Move overworld boat/sail positions into Harbor so saves stay valid.
 */
export function migrateBoatStateToHarbor(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const s = value as Record<string, unknown>;
  const pos = s.position as Record<string, unknown> | undefined;
  if (!pos || pos.zoneId !== "overworld") {
    return;
  }
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) {
    return;
  }
  const tileX = Math.round(pos.x);
  const tileY = Math.round(pos.y);
  const onLegacySouthBay = tileY === 13 || tileY === 14;
  if (!onLegacySouthBay) {
    return;
  }

  if (s.sailing === true) {
    pos.zoneId = HARBOR_DOCK.zoneId;
    pos.x = HARBOR_EMBARK_WATER.x;
    pos.y = HARBOR_EMBARK_WATER.y;
    return;
  }

  // Standing on/near the old dock/pier with a moored boat → Harbor pier.
  if (s.placedBoat === true && Math.abs(tileX - 7) <= 1) {
    pos.zoneId = HARBOR_DOCK.zoneId;
    pos.x = HARBOR_PIER.x;
    pos.y = HARBOR_PIER.y;
  }
}

/**
 * Pre-#291 saves had cottages west of the overworld gate (always reachable).
 * After relocation, cottage interiors exit into the east yard. Grandfather the
 * village gate unlock when the save already used village cottages, and clamp
 * any locked stand east of the code gate back to the plaza.
 * Run before isValidWorldSnapshot.
 */
export function repairLegacyVillageGateAccess(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const s = value as Record<string, unknown>;
  const flag = s.villageGateUnlocked;
  const flagMalformed = flag !== undefined && typeof flag !== "boolean";

  const villageCottageZones = new Set([
    "warden-cottage",
    "weaver-cottage",
    "hearthkeep-cottage",
  ]);
  const villageNpcIds = new Set([
    "warden-bryn",
    "weaver-sable",
    "hearthkeep-odd",
  ]);

  const villageMinigameIds = new Set([
    "ward-crossing",
    "loom-pattern",
    "hearth-lots",
  ]);

  const pos = s.position as Record<string, unknown> | undefined;
  const inCottage =
    typeof pos?.zoneId === "string" && villageCottageZones.has(pos.zoneId);
  const gifts = s.claimedNpcGifts;
  const hadVillageNpc =
    Array.isArray(gifts) &&
    gifts.some((id) => typeof id === "string" && villageNpcIds.has(id));
  const wins = s.claimedMinigameWins;
  const hadCottageMinigame =
    Array.isArray(wins) &&
    wins.some((id) => typeof id === "string" && villageMinigameIds.has(id));

  const zones = s.discoveredZones;
  const visitedCottage =
    Array.isArray(zones) &&
    zones.some((id) => typeof id === "string" && villageCottageZones.has(id));

  // Only grandfather when the field is absent so malformed flags still fail validation.
  if (
    flag === undefined &&
    (inCottage || hadVillageNpc || hadCottageMinigame || visitedCottage)
  ) {
    s.villageGateUnlocked = true;
  }

  if (flagMalformed) {
    return;
  }

  if (
    pos?.zoneId === "village" &&
    isFiniteNumber(pos.x) &&
    isFiniteNumber(pos.y)
  ) {
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const unlocked = s.villageGateUnlocked === true;
    const onOpenGate =
      unlocked && x === VILLAGE_CODE_GATE.x && y === VILLAGE_CODE_GATE.y;
    const inEastYard = unlocked && x > VILLAGE_CODE_GATE.x;
    if (x >= VILLAGE_CODE_GATE.x && !onOpenGate && !inEastYard) {
      pos.x = VILLAGE_CODE_GATE.x - 1;
      pos.y = VILLAGE_CODE_GATE.y;
    }
  }
}

/**
 * Pre-#83 saves may stand on Folklore Fields y=13 floor tiles that are now water.
 * Relocate those positions to the village-gate land spawn instead of invalidating the save.
 * Run after migrateBoatStateToHarbor so mid-sail overworld stands are already in Harbor.
 */
export function repairLegacyOverworldShorePosition(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const s = value as Record<string, unknown>;
  const pos = s.position as Record<string, unknown> | undefined;
  if (!pos || pos.zoneId !== "overworld") {
    return;
  }
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) {
    return;
  }
  const overworldUnlocked = s.overworldUnlocked === true;
  if (
    isSpawnWalkable(
      "overworld",
      pos.x,
      pos.y,
      overworldUnlocked,
      false,
    )
  ) {
    return;
  }
  if (Math.round(pos.y) !== 13) {
    return;
  }
  pos.x = 7;
  pos.y = 12;
}

/**
 * #102 open-ocean / 9×9 islands changed footprints, spacing, and sail rows.
 * Relocate invalid archipelago stands so loadHostSave does not wipe progress.
 * Run after other position migrations and before isValidWorldSnapshot.
 */
export function repairLegacyArchipelagoLayoutPosition(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const s = value as Record<string, unknown>;
  const pos = s.position as Record<string, unknown> | undefined;
  if (!pos || pos.zoneId !== "archipelago") {
    return;
  }
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) {
    return;
  }
  const sailing = s.sailing === true;
  const overworldUnlocked = s.overworldUnlocked === true;
  if (isSpawnWalkable("archipelago", pos.x, pos.y, overworldUnlocked, sailing)) {
    return;
  }

  const tileX = Math.round(pos.x);
  if (sailing) {
    // Prefer keeping east progress on the mid-ocean sail band.
    if (isArchipelagoSailPosition(tileX, ARCHIPELAGO_ENTRY.y)) {
      pos.y = ARCHIPELAGO_ENTRY.y;
      return;
    }
    pos.x = ARCHIPELAGO_ENTRY.x;
    pos.y = ARCHIPELAGO_ENTRY.y;
    return;
  }

  // On foot: snap to the nearest current island pier (or Harbor pier fallback).
  const islands = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH);
  if (islands.length === 0) {
    pos.zoneId = "harbor";
    pos.x = HARBOR_PIER.x;
    pos.y = HARBOR_PIER.y;
    return;
  }
  let best = islands[0]!.pier;
  let bestDist = Infinity;
  const tileY = Math.round(pos.y);
  for (const island of islands) {
    const dist =
      Math.abs(island.pier.x - tileX) + Math.abs(island.pier.y - tileY);
    if (dist < bestDist) {
      bestDist = dist;
      best = island.pier;
    }
  }
  pos.x = best.x;
  pos.y = best.y;
}

export function isValidWorldSnapshot(value: unknown): value is WorldSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.version !== 1) return false;
  if (typeof s.hostLabel !== "string") return false;
  if (s.playerName !== undefined) {
    if (typeof s.playerName !== "string") return false;
    if (normalizePlayerName(s.playerName) !== s.playerName) return false;
    if (s.playerName.length > PLAYER_NAME_MAX_LENGTH) return false;
  }
  if (typeof s.overworldUnlocked !== "boolean") return false;
  if (
    s.villageGateUnlocked !== undefined &&
    typeof s.villageGateUnlocked !== "boolean"
  ) {
    return false;
  }

  if (s.discoveredZones !== undefined) {
    if (!Array.isArray(s.discoveredZones)) return false;
    for (const zoneId of s.discoveredZones) {
      if (typeof zoneId !== "string" || !VALID_ZONE_IDS.has(zoneId as ZoneId)) {
        return false;
      }
    }
  }

  if (s.discoveredCreatures !== undefined) {
    if (!Array.isArray(s.discoveredCreatures)) return false;
    for (const creatureId of s.discoveredCreatures) {
      if (
        typeof creatureId !== "string" ||
        !VALID_CREATURE_IDS.has(creatureId)
      ) {
        return false;
      }
    }
  }

  if (s.unlockedAchievements !== undefined) {
    if (!Array.isArray(s.unlockedAchievements)) return false;
    for (const achievementId of s.unlockedAchievements) {
      if (typeof achievementId !== "string" || !isAchievementId(achievementId)) {
        return false;
      }
    }
  }

  if (s.claimedNpcGifts !== undefined) {
    if (!Array.isArray(s.claimedNpcGifts)) return false;
    for (const npcId of s.claimedNpcGifts) {
      if (typeof npcId !== "string" || !ALL_NPC_IDS.includes(npcId)) {
        return false;
      }
    }
  }

  if (s.oddRestPurchased !== undefined && typeof s.oddRestPurchased !== "boolean") {
    return false;
  }

  if (s.hudCodexUnlocked !== undefined && typeof s.hudCodexUnlocked !== "boolean") {
    return false;
  }
  if (s.hudRecipesUnlocked !== undefined && typeof s.hudRecipesUnlocked !== "boolean") {
    return false;
  }
  if (
    s.shrineCraftSpotlightCleared !== undefined &&
    typeof s.shrineCraftSpotlightCleared !== "boolean"
  ) {
    return false;
  }
  if (
    s.shrineFusionDisclosed !== undefined &&
    typeof s.shrineFusionDisclosed !== "boolean"
  ) {
    return false;
  }

  if (s.claimedMinigameWins !== undefined) {
    if (!Array.isArray(s.claimedMinigameWins)) return false;
    for (const minigameId of s.claimedMinigameWins) {
      if (typeof minigameId !== "string" || !isMinigameId(minigameId)) {
        return false;
      }
    }
  }

  if (s.npcSideQuests !== undefined) {
    if (typeof s.npcSideQuests !== "object" || s.npcSideQuests === null) {
      return false;
    }
    for (const [id, status] of Object.entries(
      s.npcSideQuests as Record<string, unknown>,
    )) {
      if (!isSideQuestId(id)) return false;
      if (
        status !== "locked" &&
        status !== "active" &&
        status !== "complete"
      ) {
        return false;
      }
    }
  }
  if (s.dailyAsk !== undefined && s.dailyAsk !== null) {
    const ask = s.dailyAsk as Record<string, unknown>;
    if (typeof ask !== "object" || ask === null) return false;
    if (typeof ask.dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ask.dayKey)) {
      return false;
    }
    if (typeof ask.materialId !== "string") return false;
    const knownMaterials = new Set(Object.values(CREATURE_MATERIALS));
    if (!knownMaterials.has(ask.materialId)) return false;
    if (typeof ask.amount !== "number" || ask.amount < 1 || !Number.isInteger(ask.amount)) {
      return false;
    }
    if (typeof ask.npcId !== "string" || !ALL_NPC_IDS.includes(ask.npcId)) return false;
    if (ask.status !== "locked" && ask.status !== "active" && ask.status !== "complete") {
      return false;
    }
  }


  if (s.placedBoat !== undefined && typeof s.placedBoat !== "boolean") {
    return false;
  }

  if (
    s.mooredDock !== undefined &&
    s.mooredDock !== "west" &&
    s.mooredDock !== "east"
  ) {
    return false;
  }

  if (s.sailing !== undefined && typeof s.sailing !== "boolean") {
    return false;
  }
  if (
    s.godSailEncounterClaimed !== undefined &&
    typeof s.godSailEncounterClaimed !== "boolean"
  ) {
    return false;
  }
  if (
    s.story1BefriendGuaranteeConsumed !== undefined &&
    typeof s.story1BefriendGuaranteeConsumed !== "boolean"
  ) {
    return false;
  }
  if (s.harborBefriendUsed !== undefined) {
    if (!Array.isArray(s.harborBefriendUsed)) return false;
    for (const creatureId of s.harborBefriendUsed) {
      if (typeof creatureId !== "string" || !VALID_CREATURE_IDS.has(creatureId)) {
        return false;
      }
    }
  }
  if (s.brynGroveStartersGifted !== undefined) {
    if (!Array.isArray(s.brynGroveStartersGifted)) return false;
    for (const creatureId of s.brynGroveStartersGifted) {
      if (typeof creatureId !== "string" || !isBrynGroveStarterId(creatureId)) {
        return false;
      }
    }
  }
  if (s.sparWinsBySpecies !== undefined) {
    if (typeof s.sparWinsBySpecies !== "object" || s.sparWinsBySpecies === null) {
      return false;
    }
    for (const [creatureId, wins] of Object.entries(
      s.sparWinsBySpecies as Record<string, unknown>,
    )) {
      if (!VALID_CREATURE_IDS.has(creatureId)) return false;
      if (
        typeof wins !== "number" ||
        !Number.isInteger(wins) ||
        wins < 0 ||
        wins > MAX_COUNT
      ) {
        return false;
      }
    }
  }
  if (
    s.sovereignPlateActive !== undefined &&
    typeof s.sovereignPlateActive !== "boolean"
  ) {
    return false;
  }
  if (
    s.firstIslandLanded !== undefined &&
    typeof s.firstIslandLanded !== "boolean"
  ) {
    return false;
  }
  if (
    s.godLandEncounterClaimed !== undefined &&
    typeof s.godLandEncounterClaimed !== "boolean"
  ) {
    return false;
  }
  if (s.tideSovereignObtained !== undefined) {
    if (
      typeof s.tideSovereignObtained !== "number" ||
      !Number.isInteger(s.tideSovereignObtained) ||
      s.tideSovereignObtained < 0 ||
      s.tideSovereignObtained > MAX_SOVEREIGN_COPIES
    ) {
      return false;
    }
  }
  if (s.cairnSovereignObtained !== undefined) {
    if (
      typeof s.cairnSovereignObtained !== "number" ||
      !Number.isInteger(s.cairnSovereignObtained) ||
      s.cairnSovereignObtained < 0 ||
      s.cairnSovereignObtained > MAX_SOVEREIGN_COPIES
    ) {
      return false;
    }
  }
  if (
    s.godFusionCompleted !== undefined &&
    typeof s.godFusionCompleted !== "boolean"
  ) {
    return false;
  }
  if (s.horizonFusionCount !== undefined) {
    if (
      typeof s.horizonFusionCount !== "number" ||
      !Number.isInteger(s.horizonFusionCount) ||
      s.horizonFusionCount < 0 ||
      s.horizonFusionCount > 2
    ) {
      return false;
    }
  }
  if (
    s.eclipseFusionCompleted !== undefined &&
    typeof s.eclipseFusionCompleted !== "boolean"
  ) {
    return false;
  }

  const pos = s.position as Record<string, unknown> | undefined;
  if (
    !pos ||
    typeof pos.zoneId !== "string" ||
    !VALID_ZONE_IDS.has(pos.zoneId as ZoneId)
  ) {
    return false;
  }
  if (!isFiniteNumber(pos.x) || !isFiniteNumber(pos.y)) return false;
  if (
    !isSpawnWalkable(
      pos.zoneId as ZoneId,
      pos.x,
      pos.y,
      s.overworldUnlocked === true,
      s.sailing === true,
      s.villageGateUnlocked === true,
    )
  ) {
    return false;
  }

  if (!Array.isArray(s.party)) return false;
  const partyInstanceIds = new Set<string>();
  for (const member of s.party) {
    if (!isValidPartyMember(member)) return false;
    const instanceId = (member as CreatureInstance).instanceId;
    if (partyInstanceIds.has(instanceId)) return false;
    partyInstanceIds.add(instanceId);
  }

  if (s.activePartyIds !== undefined) {
    if (!Array.isArray(s.activePartyIds)) return false;
    if (s.activePartyIds.length > ACTIVE_PARTY_LIMIT) return false;
    const seenActive = new Set<string>();
    for (const id of s.activePartyIds) {
      if (typeof id !== "string" || !partyInstanceIds.has(id)) return false;
      if (seenActive.has(id)) return false;
      seenActive.add(id);
    }
  }

  // Safe integer only: the mint appends this counter into `c-<n>` ids, so a
  // fractional or precision-lossy value can duplicate an accepted id (#192).
  if (
    typeof s.nextInstanceId !== "number" ||
    !Number.isSafeInteger(s.nextInstanceId) ||
    s.nextInstanceId < 0 ||
    s.nextInstanceId > MAX_INSTANCE_COUNTER
  ) {
    return false;
  }
  if (!acceptsQuestProgress(s.questProgress)) return false;
  if (!isValidCountMap(s.materials) || !isValidCountMap(s.items)) return false;
  return true;
}

/**
 * Never mint an instance id that collides with a loaded `c-<n>` id (#192).
 * Ids not matching the minted pattern are ignored for the max.
 */
function nextInstanceIdAfter(
  party: readonly { instanceId: string }[],
  saved: number,
): number {
  let next = saved;
  for (const { instanceId } of party) {
    const match = /^c-(\d+)$/.exec(instanceId);
    if (!match) {
      continue;
    }
    const n = Number(match[1]);
    // Validation caps accepted suffixes at MAX_INSTANCE_COUNTER; the bound
    // here keeps the floor safe even for callers that skip validation.
    if (Number.isSafeInteger(n) && n <= MAX_INSTANCE_COUNTER) {
      next = Math.max(next, n + 1);
    }
  }
  return next;
}

let pendingPosition: PendingWorldPosition | null = null;

function inferSovereignObtained(
  explicit: number | undefined,
  claimed: boolean,
  partyCount: number,
  horizonCount: number,
  eclipse: boolean,
): number {
  if (explicit !== undefined) {
    return Math.min(MAX_SOVEREIGN_COPIES, Math.max(0, Math.floor(explicit)));
  }
  return Math.min(
    MAX_SOVEREIGN_COPIES,
    Math.max(
      eclipse ? MAX_SOVEREIGN_COPIES : 0,
      horizonCount + partyCount,
      claimed || partyCount > 0 ? Math.max(1, partyCount) : 0,
    ),
  );
}

export function takePendingWorldPosition(): PendingWorldPosition | null {
  const position = pendingPosition;
  pendingPosition = null;
  return position;
}

/** Resolve west/east moored dock, including legacy East Landing auto-arrive saves. */
function inferMooredDock(snapshot: WorldSnapshot): HarborDockId {
  if (snapshot.mooredDock === "west" || snapshot.mooredDock === "east") {
    return snapshot.mooredDock;
  }
  // Pre-#94 auto-arrive left players on East Landing pads with the boat "placed"
  // and sailing cleared, but no mooredDock field. Defaulting those to west strands
  // the player on the east pads with the boat only boardable at the west dock.
  if (
    snapshot.placedBoat === true &&
    snapshot.sailing !== true &&
    snapshot.position.zoneId === "harbor" &&
    isNearEastLandingDock(
      "harbor",
      Math.round(snapshot.position.x),
      Math.round(snapshot.position.y),
    )
  ) {
    return "east";
  }
  return "west";
}

export function exportWorldSnapshot(
  position: PendingWorldPosition,
  hostLabel = "Your world",
): WorldSnapshot {
  const name = getPlayerName();
  return {
    version: 1,
    hostLabel,
    ...(name ? { playerName: name } : {}),
    overworldUnlocked: worldState.overworldUnlocked,
    villageGateUnlocked: worldState.villageGateUnlocked,
    discoveredZones: [...worldState.discoveredZones],
    discoveredCreatures: [...worldState.discoveredCreatures],
    unlockedAchievements: getUnlockedAchievements(),
    claimedNpcGifts: getClaimedNpcGifts(),
    oddRestPurchased: hasPurchasedOddRest(),
    ...getHudChromeSnapshot(),
    ...getShrineDisclosureSnapshot(),
    claimedMinigameWins: getClaimedMinigameWins(),
    npcSideQuests: getSideQuestStatuses(),
    dailyAsk: getDailyAskState(),
    placedBoat: isBoatPlaced(),
    mooredDock: getMooredDock() ?? undefined,
    sailing: isSailing(),
    godSailEncounterClaimed: worldState.godSailEncounterClaimed,
    story1BefriendGuaranteeConsumed: worldState.story1BefriendGuaranteeConsumed,
    harborBefriendUsed: [...worldState.harborBefriendUsed],
    brynGroveStartersGifted: [...worldState.brynGroveStartersGifted],
    sovereignPlateActive: worldState.sovereignPlateActive,
    sparWinsBySpecies: { ...sparWinsBySpecies },
    firstIslandLanded: worldState.firstIslandLanded,
    tideSovereignObtained: worldState.tideSovereignObtained,
    godLandEncounterClaimed: worldState.godLandEncounterClaimed,
    cairnSovereignObtained: worldState.cairnSovereignObtained,
    godFusionCompleted: worldState.godFusionCompleted,
    horizonFusionCount: worldState.horizonFusionCount,
    eclipseFusionCompleted: worldState.eclipseFusionCompleted,
    questProgress: { ...questProgress },
    party: structuredClone(playerParty.creatures),
    activePartyIds: [...playerParty.activeInstanceIds],
    nextInstanceId: getNextInstanceId(),
    materials: withStagedCraftingMaterials(playerInventory.materials),
    items: withStagedCraftingItems(playerInventory.items),
    position,
  };
}

export function applyWorldSnapshot(snapshot: WorldSnapshot): void {
  if (!isValidWorldSnapshot(snapshot)) {
    throw new Error("Invalid world snapshot schema");
  }

  restoreQuestProgress(snapshot.questProgress);
  setOverworldUnlocked(questProgress["first-spar"] === "complete");
  setVillageGateUnlocked(snapshot.villageGateUnlocked === true, false);
  syncVillageGateForStoryQuest();
  setDiscoveredZones(snapshot.discoveredZones ?? [snapshot.position.zoneId]);
  // Older saves lack discoveredCreatures — treat party species as known.
  const fromParty = snapshot.party
    .map((member) => member.definitionId)
    .filter((id) => CODEX_CREATURE_IDS.has(id));
  // Restore before discoveries so a completed codex does not re-award rewards.
  setUnlockedAchievements(snapshot.unlockedAchievements ?? []);
  setDiscoveredCreatures([
    ...(snapshot.discoveredCreatures ?? []),
    ...fromParty,
  ]);
  // Host display name (optional on older saves). Skip when already in visitor
  // mode so invite boot order cannot inherit the host's nametag (#248).
  if (snapshot.playerName && !isVisitorMode()) {
    setPlayerName(snapshot.playerName);
  }
  // Pre-evolution saves lack speciesId; hasCreature() matches on it, so a
  // missing value reads owned sovereigns as absent and re-opens their claimed
  // encounters (#192).
  const party = snapshot.party.map((member) => {
    const creature = {
      ...member,
      speciesId: member.speciesId ?? member.definitionId,
    };
    migrateLegacyPresenceCharmBuffs(creature);
    return creature;
  });
  // Older saves lack sparWinsBySpecies and stored HP against flat catalog max.
  if (snapshot.sparWinsBySpecies === undefined) {
    migratePartyHpForLevelScaling(party);
  } else {
    clampPartyHpToEffectiveMax(party);
  }
  setPartyFromSnapshot(
    party,
    nextInstanceIdAfter(party, snapshot.nextInstanceId),
    snapshot.activePartyIds,
  );
  const eclipseDone = snapshot.eclipseFusionCompleted === true;
  const horizonCount =
    snapshot.horizonFusionCount ?? (snapshot.godFusionCompleted === true ? 1 : 0);
  setInventoryFromSnapshot(snapshot.materials, snapshot.items);
  setHudChromeFromSnapshot({
    hudCodexUnlocked: snapshot.hudCodexUnlocked,
    hudRecipesUnlocked: snapshot.hudRecipesUnlocked,
    discoveredCreatures: worldState.discoveredCreatures,
    partyCount: playerParty.creatures.length,
    materials: playerInventory.materials,
  });
  refreshHudChromeButtons();
  setShrineDisclosureFromSnapshot({
    shrineCraftSpotlightCleared: snapshot.shrineCraftSpotlightCleared,
    shrineFusionDisclosed: snapshot.shrineFusionDisclosed,
  });
  setClaimedNpcGifts(snapshot.claimedNpcGifts ?? []);
  setOddRestPurchased(snapshot.oddRestPurchased === true);
  setClaimedMinigameWins(snapshot.claimedMinigameWins ?? []);
  setSideQuestStatuses(snapshot.npcSideQuests ?? {});
  setDailyAskState(snapshot.dailyAsk ?? null);
  setGodSailEncounterClaimed(snapshot.godSailEncounterClaimed === true, false);
  setStory1BefriendGuaranteeConsumed(
    snapshot.story1BefriendGuaranteeConsumed === true,
    false,
  );
  setHarborBefriendUsed(snapshot.harborBefriendUsed ?? []);
  setBrynGroveStartersGifted(snapshot.brynGroveStartersGifted ?? []);
  setSovereignPlateActive(snapshot.sovereignPlateActive === true, false);
  setSparWinsBySpecies(snapshot.sparWinsBySpecies ?? {}, false);
  setFirstIslandLanded(snapshot.firstIslandLanded === true, false);
  if (
    !worldState.firstIslandLanded &&
    snapshot.sailing !== true &&
    snapshot.position.zoneId === "archipelago" &&
    isArchipelagoIslandPosition(snapshot.position.x, snapshot.position.y)
  ) {
    setFirstIslandLanded(true, false);
  }
  setGodLandEncounterClaimed(snapshot.godLandEncounterClaimed === true, false);
  setEclipseFusionCompleted(eclipseDone, false);
  setHorizonFusionCount(horizonCount, false);
  setTideSovereignObtained(
    inferSovereignObtained(
      snapshot.tideSovereignObtained,
      snapshot.godSailEncounterClaimed === true,
      countCreatures(TIDE_SOVEREIGN_ID),
      horizonCount,
      snapshot.eclipseFusionCompleted === true,
    ),
    false,
  );
  setCairnSovereignObtained(
    inferSovereignObtained(
      snapshot.cairnSovereignObtained,
      snapshot.godLandEncounterClaimed === true,
      countCreatures(CAIRN_SOVEREIGN_ID),
      horizonCount,
      snapshot.eclipseFusionCompleted === true,
    ),
    false,
  );
  reopenParentSovereignEncounters();
  setPlacedBoat(snapshot.placedBoat === true);
  if (snapshot.placedBoat === true) {
    setMooredDock(inferMooredDock(snapshot));
  } else {
    setMooredDock(null);
  }
  setSailing(snapshot.sailing === true);
  // Sailing only makes sense on Harbor/Archipelago Water/Dock; otherwise clear it.
  if (snapshot.position.zoneId === "archipelago") {
    prepareArchipelagoForPosition(snapshot.position.x);
  }
  if (isSailing()) {
    const zone = ZONES[snapshot.position.zoneId];
    const tileX = Math.round(snapshot.position.x);
    const tileY = Math.round(snapshot.position.y);
    const tile = zone.tiles[tileY]?.[tileX];
    if (
      !isSailableZone(snapshot.position.zoneId) ||
      (tile !== TileType.Water && tile !== TileType.Dock)
    ) {
      setSailing(false);
    }
  }
  // Saves predating the achievement can already have a full codex; award after
  // the inventory is restored so the items are not overwritten.
  evaluateCodexAchievement(worldState.discoveredCreatures);
  pendingPosition = snapshot.position;
}
