import { getItemCount, SOVEREIGN_SEAL_ID } from "../inventory/playerInventory";
import { isBoatPlaced } from "../world/dockBoat";
import {
  getHorizonFusionCount,
  isEclipseFusionCompleted,
  worldState,
} from "../world/worldState";

/**
 * Optional Sovereign voyage thread (#369): the old steps 14–18 (boat → Tide →
 * Stone → Seal → Horizon) as a side thread derived from existing save state.
 * Never gates the main arc; the finale names it as the hook toward fusion.
 */
export type SovereignVoyageStep =
  | "boat"
  | "tide"
  | "cairn"
  | "seal"
  | "fuse"
  | "done";

export const SOVEREIGN_VOYAGE_HINTS: Record<Exclude<SovereignVoyageStep, "done">, string> = {
  boat: "craft a Boat at the Moon Shrine and moor it at Moonwake Harbor, north of Folklore Fields.",
  tide: "sail out to Reed's island (top-right of the archipelago) and win over the Tide Sovereign.",
  cairn: "from Reed's island, sail due south (not east) to the gray cairn isle and win over the Stone Sovereign.",
  seal: "craft a Sovereign Seal with the Tide and Boulder Crowns at the Moon Shrine.",
  fuse: "fuse Tide and Stone into Horizon at the Moon Shrine.",
};

function hasVoyageBoat(): boolean {
  return (
    getItemCount("boat") > 0 ||
    isBoatPlaced() ||
    worldState.discoveredZones.includes("archipelago")
  );
}

export function getSovereignVoyageStep(): SovereignVoyageStep {
  if (getHorizonFusionCount() > 0 || isEclipseFusionCompleted()) {
    return "done";
  }
  const hasTide = worldState.tideSovereignObtained > 0;
  const hasCairn = worldState.cairnSovereignObtained > 0;
  if (!hasTide) {
    return hasVoyageBoat() ? "tide" : "boat";
  }
  if (!hasCairn) {
    return "cairn";
  }
  return getItemCount(SOVEREIGN_SEAL_ID) > 0 ? "fuse" : "seal";
}

/** True once the player has a boat or any Sovereign — shown before the finale too. */
export function isSovereignVoyageStarted(): boolean {
  const step = getSovereignVoyageStep();
  return step !== "boat";
}

/** HUD line for the voyage, or null when it is finished. */
export function getSovereignVoyageHint(): string | null {
  const step = getSovereignVoyageStep();
  if (step === "done") {
    return null;
  }
  return `Optional — Sovereign voyage: ${SOVEREIGN_VOYAGE_HINTS[step]}`;
}
