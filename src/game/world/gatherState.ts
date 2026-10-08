import { addMaterial } from "../inventory/playerInventory";
import { getMaterialName } from "../inventory/materials";
import {
  GATHER_YIELD_MAX,
  GATHER_YIELD_MIN,
  gatherNodeKey,
  type GatherAction,
} from "./gatherNodes";
import type { ZoneId } from "./zoneTypes";

const lastHarvestAt = new Map<string, number>();

export function getGatherCooldownRemainingMs(
  zoneId: ZoneId,
  x: number,
  y: number,
  action: GatherAction,
  now = Date.now(),
): number {
  const key = gatherNodeKey(zoneId, x, y);
  const last = lastHarvestAt.get(key);
  if (last === undefined) {
    return 0;
  }
  return Math.max(0, action.cooldownMs - (now - last));
}

/** Inclusive yield roll; `rng` returns [0, 1). */
export function rollGatherYield(rng: () => number = Math.random): number {
  const span = GATHER_YIELD_MAX - GATHER_YIELD_MIN + 1;
  return GATHER_YIELD_MIN + Math.min(span - 1, Math.floor(rng() * span));
}

export function tryHarvestNode(
  zoneId: ZoneId,
  x: number,
  y: number,
  action: GatherAction,
  rng: () => number = Math.random,
): { ok: true; message: string } | { ok: false; message: string } {
  const remaining = getGatherCooldownRemainingMs(zoneId, x, y, action);
  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    return { ok: false, message: `Nothing to gather yet (${seconds}s).` };
  }

  const amount = rollGatherYield(rng);
  addMaterial(action.materialId, amount);
  lastHarvestAt.set(gatherNodeKey(zoneId, x, y), Date.now());
  const name = getMaterialName(action.materialId);
  return { ok: true, message: `+${amount} ${name}` };
}
