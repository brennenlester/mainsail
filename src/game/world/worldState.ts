import type { ZoneId } from "./zoneTypes";
import { notifyWorldChanged } from "./worldSaveSchedule";
import { evaluateCodexAchievement } from "../progression/achievements";

/** Story progression flags — quest completion updates overworld access. */
export const worldState = {
  overworldUnlocked: false,
  /** East Hearth Crossing cottage gate — opens via hermit 4-digit code (#291). */
  villageGateUnlocked: false,
  /** Zones visited (kept for saves / invites; codex uses creature discoveries). */
  discoveredZones: [] as ZoneId[],
  /** Creature species seen in an encounter — shown in every matching habitat. */
  discoveredCreatures: [] as string[],
  /** Tide Sovereign was obtained; natural god-sail rolls stop until unclaimed. */
  godSailEncounterClaimed: false,
  /** Story 1 first-befriend guarantee already used this save. */
  story1BefriendGuaranteeConsumed: false,
  /** Lifetime Tide Sovereign claims this save (0–2). */
  tideSovereignObtained: 0,
  /** Stone Sovereign was obtained; natural god-land rolls stop until unclaimed. */
  godLandEncounterClaimed: false,
  /** Lifetime Stone Sovereign claims this save (0–2). */
  cairnSovereignObtained: 0,
  /** At least one Horizon Sovereign has been fused. Legacy saves used this as once-only. */
  godFusionCompleted: false,
  /** Successful Tide+Cairn → Horizon fusions this save (0–2). */
  horizonFusionCount: 0,
  /** Two Horizons have been fused into Eclipse Sovereign. */
  eclipseFusionCompleted: false,
  /** Post-Story Next chain: stepped onto an archipelago island Floor/Dock. */
  firstIslandLanded: false,
  /** Harbor once-per-species Befriend claims (#275). */
  harborBefriendUsed: [] as string[],
  /** Grove starters Bryn already gifted this save (#349). */
  brynGroveStartersGifted: [] as string[],
  /** Sovereign Plate toggle: suppress wild encounters while owned + active (#289). */
  sovereignPlateActive: false,
};

export function setOverworldUnlocked(unlocked: boolean): void {
  worldState.overworldUnlocked = unlocked;
}

export function setVillageGateUnlocked(unlocked: boolean, notify = true): void {
  if (worldState.villageGateUnlocked === unlocked) {
    return;
  }
  worldState.villageGateUnlocked = unlocked;
  if (notify) {
    notifyWorldChanged();
  }
}

export function isVillageGateUnlocked(): boolean {
  return worldState.villageGateUnlocked;
}

export function setDiscoveredZones(zones: ZoneId[]): void {
  worldState.discoveredZones = [...new Set(zones)];
}

export function setDiscoveredCreatures(creatureIds: string[]): void {
  worldState.discoveredCreatures = [...new Set(creatureIds)];
}

export function setHarborBefriendUsed(creatureIds: string[]): void {
  worldState.harborBefriendUsed = [...new Set(creatureIds)];
}

export const BRYN_GROVE_STARTER_IDS = ["mossling", "ember-wisp"] as const;
export type BrynGroveStarterId = (typeof BRYN_GROVE_STARTER_IDS)[number];

export function isBrynGroveStarterId(id: string): id is BrynGroveStarterId {
  return (BRYN_GROVE_STARTER_IDS as readonly string[]).includes(id);
}

export function setBrynGroveStartersGifted(creatureIds: string[]): void {
  worldState.brynGroveStartersGifted = [
    ...new Set(creatureIds.filter(isBrynGroveStarterId)),
  ];
}

export function isSovereignPlateActive(): boolean {
  return worldState.sovereignPlateActive;
}

export function setSovereignPlateActive(active: boolean, notify = true): void {
  worldState.sovereignPlateActive = active;
  if (notify) {
    notifyWorldChanged();
  }
}

export function toggleSovereignPlateActive(notify = true): boolean {
  setSovereignPlateActive(!worldState.sovereignPlateActive, notify);
  return worldState.sovereignPlateActive;
}

export function isGodSailEncounterClaimed(): boolean {
  return worldState.godSailEncounterClaimed;
}

export function setGodSailEncounterClaimed(
  claimed: boolean,
  notify = true,
): void {
  worldState.godSailEncounterClaimed = claimed;
  if (notify) {
    notifyWorldChanged();
  }
}

export function isStory1BefriendGuaranteeConsumed(): boolean {
  return worldState.story1BefriendGuaranteeConsumed;
}

export function setStory1BefriendGuaranteeConsumed(
  consumed: boolean,
  notify = true,
): void {
  worldState.story1BefriendGuaranteeConsumed = consumed;
  if (notify) {
    notifyWorldChanged();
  }
}

export function isGodLandEncounterClaimed(): boolean {
  return worldState.godLandEncounterClaimed;
}

export function setGodLandEncounterClaimed(
  claimed: boolean,
  notify = true,
): void {
  worldState.godLandEncounterClaimed = claimed;
  if (notify) {
    notifyWorldChanged();
  }
}

export const MAX_HORIZON_FUSIONS = 2;
export const MAX_SOVEREIGN_COPIES = 2;

function clampSovereignObtained(count: number): number {
  return Math.min(MAX_SOVEREIGN_COPIES, Math.max(0, Math.floor(count)));
}

export function getTideSovereignObtained(): number {
  return worldState.tideSovereignObtained;
}

export function setTideSovereignObtained(count: number, notify = true): void {
  worldState.tideSovereignObtained = clampSovereignObtained(count);
  if (notify) {
    notifyWorldChanged();
  }
}

export function recordTideSovereignObtained(notify = true): void {
  setTideSovereignObtained(worldState.tideSovereignObtained + 1, notify);
}

export function getCairnSovereignObtained(): number {
  return worldState.cairnSovereignObtained;
}

export function setCairnSovereignObtained(count: number, notify = true): void {
  worldState.cairnSovereignObtained = clampSovereignObtained(count);
  if (notify) {
    notifyWorldChanged();
  }
}

export function recordCairnSovereignObtained(notify = true): void {
  setCairnSovereignObtained(worldState.cairnSovereignObtained + 1, notify);
}

export function canObtainAnotherParentSovereign(
  obtained: number,
  copies: number,
): boolean {
  return (
    canHuntParentSovereigns() &&
    obtained < MAX_SOVEREIGN_COPIES &&
    copies < MAX_SOVEREIGN_COPIES
  );
}

export function isGodFusionCompleted(): boolean {
  return worldState.godFusionCompleted;
}

export function getHorizonFusionCount(): number {
  return worldState.horizonFusionCount;
}

export function isEclipseFusionCompleted(): boolean {
  return worldState.eclipseFusionCompleted;
}

export function canHuntParentSovereigns(): boolean {
  return (
    !worldState.eclipseFusionCompleted &&
    worldState.horizonFusionCount < MAX_HORIZON_FUSIONS
  );
}

export function setHorizonFusionCount(count: number, notify = true): void {
  const next = Math.min(
    MAX_HORIZON_FUSIONS,
    Math.max(0, Math.floor(count)),
  );
  worldState.horizonFusionCount = next;
  worldState.godFusionCompleted = next >= 1;
  if (notify) {
    notifyWorldChanged();
  }
}

export function recordHorizonFusion(notify = true): void {
  setHorizonFusionCount(worldState.horizonFusionCount + 1, notify);
}

export function setEclipseFusionCompleted(
  completed: boolean,
  notify = true,
): void {
  worldState.eclipseFusionCompleted = completed;
  if (notify) {
    notifyWorldChanged();
  }
}

export function setGodFusionCompleted(
  completed: boolean,
  notify = true,
): void {
  if (completed) {
    setHorizonFusionCount(
      Math.max(1, worldState.horizonFusionCount),
      notify,
    );
    return;
  }
  setHorizonFusionCount(0, notify);
}

export function isFirstIslandLanded(): boolean {
  return worldState.firstIslandLanded;
}

export function setFirstIslandLanded(landed: boolean, notify = true): void {
  if (worldState.firstIslandLanded === landed) {
    return;
  }
  worldState.firstIslandLanded = landed;
  if (notify) {
    notifyWorldChanged();
  }
}

export function markZoneDiscovered(zoneId: ZoneId): void {
  if (worldState.discoveredZones.includes(zoneId)) {
    return;
  }
  worldState.discoveredZones.push(zoneId);
  notifyWorldChanged();
}

export function markCreatureDiscovered(creatureId: string): void {
  if (worldState.discoveredCreatures.includes(creatureId)) {
    return;
  }
  worldState.discoveredCreatures.push(creatureId);
  notifyWorldChanged();
  evaluateCodexAchievement(worldState.discoveredCreatures);
}

/** Dev-only gate toggle. */
export function toggleOverworldUnlock(): boolean {
  worldState.overworldUnlocked = !worldState.overworldUnlocked;
  return worldState.overworldUnlocked;
}
