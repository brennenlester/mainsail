import { addToPartyFainted, countCreatures } from "../creatures/party";
import type { MoveDefinition } from "../creatures/types";
import { addItem, canAddItem, getItemCount, ownsSovereignPlate, BOULDER_CROWN_ID } from "../inventory/playerInventory";
import { recordQuestEvent } from "../story/questProgress";
import type { ZoneId } from "../world/zoneTypes";
import { TileType } from "../world/zoneTypes";
import {
  canObtainAnotherParentSovereign,
  getCairnSovereignObtained,
  isGodLandEncounterClaimed,
  recordCairnSovereignObtained,
  setGodLandEncounterClaimed,
} from "../world/worldState";
import { CAIRN_ISLAND_INDEX } from "../world/cairnIsland";

export const CAIRN_SOVEREIGN_ID = "cairn-sovereign";
export const CAIRN_MAUL_ID = "cairn-maul";
export const GOD_LAND_ENCOUNTER_CHANCE = 0.01;
export const GOD_LAND_ENCOUNTER_DELAY_MS = 10_000;
// ponytail: temporary land-god-encounter cheat
export const GOD_LAND_CHEAT = "0420";

export type CairnSovereignAttack = {
  move: MoveDefinition;
  damage: number;
};

const GRAVE_HUM: CairnSovereignAttack = {
  move: {
    id: "grave-hum",
    name: "Grave Hum",
    power: 10,
    type: "earth",
    accuracy: 100,
  },
  damage: 10,
};

export const CAIRN_SOVEREIGN_ATTACK_PATTERN: readonly CairnSovereignAttack[] = [
  GRAVE_HUM,
  {
    move: {
      id: "cairn-crash",
      name: "Cairn Crash",
      power: 15,
      type: "earth",
      accuracy: 100,
    },
    damage: 15,
  },
  GRAVE_HUM,
  {
    move: {
      id: "ridge-fall",
      name: "Ridge Fall",
      power: 20,
      type: "earth",
      accuracy: 100,
    },
    damage: 20,
  },
];

export function getCairnSovereignAttack(
  turnIndex: number,
): CairnSovereignAttack {
  return CAIRN_SOVEREIGN_ATTACK_PATTERN[
    turnIndex % CAIRN_SOVEREIGN_ATTACK_PATTERN.length
  ];
}

export type GodLandEncounterContext = {
  sailing: boolean;
  zoneId: ZoneId;
  islandIndex: number | null;
  walkableLand: boolean;
  visitor: boolean;
  claimed: boolean;
};

export type PendingGodLandEncounter = {
  creatureId: typeof CAIRN_SOVEREIGN_ID;
  delayMs: typeof GOD_LAND_ENCOUNTER_DELAY_MS;
  forced: boolean;
  origin: Readonly<{ x: number; y: number }>;
};

export function isWalkableLandTile(tile: TileType | undefined): boolean {
  return tile === TileType.Floor || tile === TileType.OverworldGate;
}

export function shouldAttemptGodLandEncounter(
  context: GodLandEncounterContext,
): boolean {
  return (
    !context.sailing &&
    context.zoneId === "archipelago" &&
    context.islandIndex === CAIRN_ISLAND_INDEX &&
    context.walkableLand &&
    !context.visitor &&
    // ponytail: claimed stops natural rolls only after the crown is earned, so befriend-first and legacy claimed saves can still spar for it.
    // Sovereign Plate (#289): keep farming crowns even while a crown is held.
    !(
      context.claimed &&
      getItemCount(BOULDER_CROWN_ID) > 0 &&
      !ownsSovereignPlate()
    )
  );
}

export function rollGodLandEncounter(rng: () => number = Math.random): boolean {
  return rng() < GOD_LAND_ENCOUNTER_CHANCE;
}

/** QA force still requires a solo Folklore Fields walker, but bypasses claim/land-tile. */
export function canForceGodLandEncounter(
  context: Pick<GodLandEncounterContext, "sailing" | "zoneId" | "visitor">,
): boolean {
  return (
    !context.sailing && context.zoneId === "archipelago" && !context.visitor
  );
}

export function createPendingGodLandEncounter(
  x: number,
  y: number,
  forced = false,
): PendingGodLandEncounter {
  return {
    creatureId: CAIRN_SOVEREIGN_ID,
    delayMs: GOD_LAND_ENCOUNTER_DELAY_MS,
    forced,
    origin: Object.freeze({ x, y }),
  };
}

export function lockPendingGodLandEncounter(
  current: PendingGodLandEncounter | undefined,
  x: number,
  y: number,
  forced = false,
): { pending: PendingGodLandEncounter; acquired: boolean } {
  if (current) {
    return { pending: current, acquired: false };
  }
  return {
    pending: createPendingGodLandEncounter(x, y, forced),
    acquired: true,
  };
}

export function appendGodLandCheatKey(
  buffer: string,
  key: string,
): { buffer: string; triggered: boolean } {
  const next = `${buffer}${key}`.slice(-GOD_LAND_CHEAT.length);
  return { buffer: next, triggered: next.endsWith(GOD_LAND_CHEAT) };
}

export type GodLandClaimResult = {
  creatureAdded: boolean;
  weaponGranted: boolean;
  crownGranted: boolean;
};

export type CairnSovereignOutcome = "befriend" | "spar-win" | "flee";

function grantCrownIfMissing(itemId: string): boolean {
  if (!canAddItem(itemId)) {
    return false;
  }
  return addItem(itemId);
}

/** Grants Stone Sovereign up to two copies per save. */
export function claimCairnSovereign(): GodLandClaimResult {
  // Sovereign Plate (#289): crown-farm path — never add sovereigns to the party.
  const creatureAdded =
    !ownsSovereignPlate() &&
    canObtainAnotherParentSovereign(
      getCairnSovereignObtained(),
      countCreatures(CAIRN_SOVEREIGN_ID),
    );
  if (creatureAdded) {
    addToPartyFainted(CAIRN_SOVEREIGN_ID);
    recordCairnSovereignObtained();
  }

  const weaponGranted = getItemCount(CAIRN_MAUL_ID) === 0;
  if (weaponGranted) {
    addItem(CAIRN_MAUL_ID);
  }

  if (!isGodLandEncounterClaimed()) {
    setGodLandEncounterClaimed(true);
  }
  return { creatureAdded, weaponGranted, crownGranted: false };
}

export function resolveCairnSovereignOutcome(
  outcome: CairnSovereignOutcome,
): GodLandClaimResult | null {
  if (outcome === "flee") {
    return null;
  }
  const result = claimCairnSovereign();
  // Spar-win always earns a crown; with Sovereign Plate, befriend does too (no party join).
  if (outcome === "spar-win" || ownsSovereignPlate()) {
    result.crownGranted = grantCrownIfMissing(BOULDER_CROWN_ID);
  }
  recordQuestEvent({
    type: "obtain_creature",
    creatureId: CAIRN_SOVEREIGN_ID,
  });
  return result;
}
