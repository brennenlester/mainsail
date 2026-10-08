/**
 * Game-state glue for the befriend model (#366): reads party, inventory and
 * habitat state into `BefriendInputs`, and owns the session offering choice.
 * The odds math itself lives in befriendChance.ts.
 */
import { bondTier } from "../companions/bond";
import { getFavoriteMaterial } from "../companions/favorites";
import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures } from "../creatures/party";
import type { CreatureInstance, StatusInstance } from "../creatures/types";
import {
  consumeItem,
  consumeMaterial,
  getItemCount,
  getMaterialCount,
} from "../inventory/playerInventory";
import { getMaterialName } from "../inventory/materials";
import { getPartyAverageLevel, getRarityBias, getWildEffectiveLevel } from "../progression/wildLevel";
import type { ZoneId } from "../world/zoneTypes";
import { worldState } from "../world/worldState";
import {
  computeBefriendOdds,
  FAVORITE_BAIT_ID,
  FOLK_SEAL_ID,
  type BefriendOdds,
  type BefriendOffering,
} from "./befriendChance";
import { GOD_BEFRIEND_CHANCE, isGodCreature, NORMAL_BEFRIEND_CHANCE } from "./godSail";
import { resolveProfileBefriendChance } from "./habitatRuntime";

/** First living active creature (the encounter-card lead). */
export function encounterLead(): CreatureInstance | undefined {
  return getActiveCreatures().find((c) => c.currentHp > 0);
}

/** Favorite material shows once the species is in the Codex. */
export function isFavoriteKnown(creatureId: string): boolean {
  return worldState.discoveredCreatures.includes(creatureId);
}

export function canOffer(creatureId: string, offering: BefriendOffering): boolean {
  if (isGodCreature(creatureId)) {
    return false;
  }
  if (offering === "folk-seal") {
    return getItemCount(FOLK_SEAL_ID) > 0;
  }
  if (offering === "favorite-bait") {
    return (
      getItemCount(FAVORITE_BAIT_ID) > 0 &&
      getMaterialCount(getFavoriteMaterial(creatureId)) > 0
    );
  }
  return true;
}

/** Nothing first (offerings are opt-in), then bait, seal. */
export function availableOfferings(creatureId: string): BefriendOffering[] {
  const list: BefriendOffering[] = (["favorite-bait", "folk-seal"] as const).filter((o) =>
    canOffer(creatureId, o),
  );
  return ["none", ...list];
}

// ponytail: session-only choice; null = nothing offered until the player picks.
let offeringChoice: BefriendOffering | null = null;

export function resetOfferingChoiceForTest(): void {
  offeringChoice = null;
}

export function currentOffering(creatureId: string): BefriendOffering {
  const options = availableOfferings(creatureId);
  return offeringChoice && options.includes(offeringChoice) ? offeringChoice : "none";
}

/** What one attempt spends, e.g. "Bait: −1 Bait, −1 Moss Fiber" (empty for none). */
export function offeringCostLine(creatureId: string, offering: BefriendOffering): string {
  if (offering === "folk-seal") {
    return "Seal: −1 Folk Seal";
  }
  if (offering === "favorite-bait") {
    return `Bait: −1 Bait, −1 ${getMaterialName(getFavoriteMaterial(creatureId))}`;
  }
  return "";
}

/** Card chip: step to the next available offering (wraps through "none"). */
export function cycleOffering(creatureId: string): BefriendOffering {
  const options = availableOfferings(creatureId);
  const index = options.indexOf(currentOffering(creatureId));
  offeringChoice = options[(index + 1) % options.length]!;
  return offeringChoice;
}

/** Spend the offering for one attempt (bait also takes 1 favorite material). */
export function consumeOffering(creatureId: string, offering: BefriendOffering): void {
  if (offering === "folk-seal") {
    consumeItem(FOLK_SEAL_ID);
  } else if (offering === "favorite-bait") {
    consumeItem(FAVORITE_BAIT_ID);
    consumeMaterial(getFavoriteMaterial(creatureId), 1);
  }
}

function habitatEdge(zoneId: ZoneId | undefined, creatureId: string): -1 | 0 | 1 {
  if (!zoneId) {
    return 0;
  }
  const profileChance = resolveProfileBefriendChance(zoneId, creatureId);
  if (profileChance === null) {
    return 0;
  }
  return profileChance > NORMAL_BEFRIEND_CHANCE ? 1 : profileChance < NORMAL_BEFRIEND_CHANCE ? -1 : 0;
}

export type BefriendState = {
  creatureId: string;
  zoneId?: ZoneId;
  /** Wild current / max HP (1 on the encounter card). */
  hpFraction?: number;
  statuses?: readonly StatusInstance[];
  /** Creature whose bond / trait counts; the encounter lead by default. */
  lead?: CreatureInstance | null;
  /** Override the wild's level (battle knows it exactly). */
  wildLevel?: number;
};

export function befriendOddsFor(state: BefriendState): BefriendOdds {
  const { creatureId } = state;
  const offering = currentOffering(creatureId);
  if (isGodCreature(creatureId)) {
    return computeBefriendOdds({
      godChance: GOD_BEFRIEND_CHANCE,
      rarityBias: 0,
      levelGap: 0,
      hpFraction: 1,
      statuses: [],
      offering,
      leadBondTier: 0,
      habitatEdge: 0,
    });
  }
  const lead = state.lead === undefined ? encounterLead() : state.lead ?? undefined;
  const wildLevel = state.wildLevel ?? getWildEffectiveLevel(creatureId);
  const leadLevel = lead?.level ?? getPartyAverageLevel();
  return computeBefriendOdds({
    rarityBias: getRarityBias(creatureId),
    levelGap: wildLevel - leadLevel,
    hpFraction: state.hpFraction ?? 1,
    statuses: (state.statuses ?? []).filter((s) => s.turns > 0).map((s) => s.id),
    offering,
    leadBondTier: lead ? bondTier(lead.bond) : 0,
    leadPersonality: lead?.personality,
    leadName: lead ? lead.nickname ?? getCreatureDefinition(lead.definitionId).name : undefined,
    habitatEdge: habitatEdge(state.zoneId, creatureId),
  });
}
