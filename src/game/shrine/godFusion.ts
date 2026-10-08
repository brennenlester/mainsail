import {
  addFusedCreature,
  countCreatures,
  getCreatureInstance,
  hasCreature,
  playerParty,
  removeFromParty,
} from "../creatures/party";
import {
  consumeItem,
  getItemCount,
  SOVEREIGN_SEAL_ID,
} from "../inventory/playerInventory";
import { isVisitorMode } from "../world/worldSession";
import {
  canHuntParentSovereigns,
  getCairnSovereignObtained,
  getHorizonFusionCount,
  getTideSovereignObtained,
  isEclipseFusionCompleted,
  MAX_HORIZON_FUSIONS,
  MAX_SOVEREIGN_COPIES,
  recordHorizonFusion,
  setEclipseFusionCompleted,
  setGodLandEncounterClaimed,
  setGodSailEncounterClaimed,
} from "../world/worldState";
import { CAIRN_SOVEREIGN_ID } from "../encounters/godLand";
import { TIDE_SOVEREIGN_ID } from "../encounters/godSail";
import type { CreatureInstance } from "../creatures/types";

export { SOVEREIGN_SEAL_ID } from "../inventory/playerInventory";
export const HORIZON_SOVEREIGN_ID = "horizon-sovereign";
export const ECLIPSE_SOVEREIGN_ID = "eclipse-sovereign";

export type GodFusionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function findGodFusionParents(): {
  tide: CreatureInstance | undefined;
  cairn: CreatureInstance | undefined;
} {
  return {
    tide: playerParty.creatures.find(
      (c) => c.definitionId === TIDE_SOVEREIGN_ID,
    ),
    cairn: playerParty.creatures.find(
      (c) => c.definitionId === CAIRN_SOVEREIGN_ID,
    ),
  };
}

export function findHorizonFusionParents(): {
  first: CreatureInstance | undefined;
  second: CreatureInstance | undefined;
} {
  const horizons = playerParty.creatures.filter(
    (c) => c.definitionId === HORIZON_SOVEREIGN_ID,
  );
  return { first: horizons[0], second: horizons[1] };
}

/** After the first Horizon fusion (or loading that save), allow another Tide/Stone hunt. */
export function reopenParentSovereignEncounters(): void {
  if (!canHuntParentSovereigns() || getHorizonFusionCount() < 1) {
    return;
  }
  if (
    !hasCreature(TIDE_SOVEREIGN_ID) &&
    getTideSovereignObtained() < MAX_SOVEREIGN_COPIES
  ) {
    setGodSailEncounterClaimed(false, false);
  }
  if (
    !hasCreature(CAIRN_SOVEREIGN_ID) &&
    getCairnSovereignObtained() < MAX_SOVEREIGN_COPIES
  ) {
    setGodLandEncounterClaimed(false, false);
  }
}

export function applyGodFusion(
  tideInstanceId: string,
  cairnInstanceId: string,
  itemId: string,
): GodFusionResult {
  if (isVisitorMode()) {
    return { ok: false, message: "Only the host can fuse here." };
  }
  if (isEclipseFusionCompleted()) {
    return { ok: false, message: "Eclipse Sovereign has already been fused." };
  }
  if (
    getHorizonFusionCount() >= MAX_HORIZON_FUSIONS ||
    countCreatures(HORIZON_SOVEREIGN_ID) >= MAX_SOVEREIGN_COPIES
  ) {
    return {
      ok: false,
      message: "Fuse the two Horizon Sovereigns instead.",
    };
  }
  if (itemId !== SOVEREIGN_SEAL_ID) {
    return { ok: false, message: "That item cannot fuse the sovereigns." };
  }
  if (getItemCount(SOVEREIGN_SEAL_ID) < 1) {
    return { ok: false, message: "You need a Sovereign Seal." };
  }

  const tide = getCreatureInstance(tideInstanceId);
  const cairn = getCreatureInstance(cairnInstanceId);
  if (
    !tide ||
    !cairn ||
    tide.definitionId !== TIDE_SOVEREIGN_ID ||
    cairn.definitionId !== CAIRN_SOVEREIGN_ID ||
    tide.instanceId === cairn.instanceId
  ) {
    return {
      ok: false,
      message: "Requires Tide Sovereign and Stone Sovereign in your party.",
    };
  }

  if (!consumeItem(SOVEREIGN_SEAL_ID)) {
    return { ok: false, message: "You need a Sovereign Seal." };
  }

  const level = Math.max(tide.level, cairn.level);
  removeFromParty(tide.instanceId);
  removeFromParty(cairn.instanceId);
  addFusedCreature(HORIZON_SOVEREIGN_ID, level);
  recordHorizonFusion();
  reopenParentSovereignEncounters();
  return {
    ok: true,
    message:
      "Tide Sovereign and Stone Sovereign fused into Horizon Sovereign!",
  };
}

export function applyEclipseFusion(
  firstInstanceId: string,
  secondInstanceId: string,
  itemId: string,
): GodFusionResult {
  if (isVisitorMode()) {
    return { ok: false, message: "Only the host can fuse here." };
  }
  if (isEclipseFusionCompleted()) {
    return { ok: false, message: "Eclipse Sovereign has already been fused." };
  }
  if (itemId !== SOVEREIGN_SEAL_ID) {
    return { ok: false, message: "That item cannot fuse the sovereigns." };
  }
  if (getItemCount(SOVEREIGN_SEAL_ID) < 1) {
    return { ok: false, message: "You need a Sovereign Seal." };
  }

  const first = getCreatureInstance(firstInstanceId);
  const second = getCreatureInstance(secondInstanceId);
  if (
    !first ||
    !second ||
    first.definitionId !== HORIZON_SOVEREIGN_ID ||
    second.definitionId !== HORIZON_SOVEREIGN_ID ||
    first.instanceId === second.instanceId
  ) {
    return {
      ok: false,
      message: "Requires two Horizon Sovereigns in your party.",
    };
  }

  if (!consumeItem(SOVEREIGN_SEAL_ID)) {
    return { ok: false, message: "You need a Sovereign Seal." };
  }

  const level = Math.max(first.level, second.level);
  removeFromParty(first.instanceId);
  removeFromParty(second.instanceId);
  addFusedCreature(ECLIPSE_SOVEREIGN_ID, level);
  setEclipseFusionCompleted(true);
  return {
    ok: true,
    message: "Horizon Sovereigns fused into Eclipse Sovereign!",
  };
}
