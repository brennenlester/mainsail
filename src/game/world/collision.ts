import { isSailing } from "./dockBoat";
import { worldState } from "./worldState";
import { TileType, type ZoneDefinition } from "./zoneTypes";

export function isTileWalkable(
  zone: ZoneDefinition,
  tileX: number,
  tileY: number,
): boolean {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= zone.width ||
    tileY >= zone.height
  ) {
    return false;
  }

  const tile = zone.tiles[tileY][tileX];
  if (isSailing()) {
    // Shore cruise: only water and the dock pad — not land Floor or walls.
    return tile === TileType.Water || tile === TileType.Dock;
  }
  if (tile === TileType.Floor || tile === TileType.Dock) {
    return true;
  }
  if (tile === TileType.OverworldGate) {
    return worldState.overworldUnlocked;
  }
  if (tile === TileType.VillageGate) {
    return worldState.villageGateUnlocked;
  }
  if (tile === TileType.MistwoodGate) {
    return worldState.mistwoodPathOpen;
  }
  return false;
}

export function canOccupy(
  zone: ZoneDefinition,
  gridX: number,
  gridY: number,
): boolean {
  const tileX = Math.round(gridX);
  const tileY = Math.round(gridY);
  return isTileWalkable(zone, tileX, tileY);
}
