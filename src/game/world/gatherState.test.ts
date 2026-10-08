import { beforeEach, describe, expect, it } from "vitest";
import {
  GATHER_COOLDOWN_MS,
  GATHER_YIELD_MAX,
  GATHER_YIELD_MIN,
  GATHERABLE_PROPS,
} from "./gatherNodes";
import {
  getGatherCooldownRemainingMs,
  rollGatherYield,
  tryHarvestNode,
} from "./gatherState";
import {
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";

const tree = GATHERABLE_PROPS.tree!;

describe("gather economy (#370)", () => {
  beforeEach(() => {
    setInventoryFromSnapshot({}, {});
  });

  it("pins 2-3 yield and a 15s cooldown on every gatherable", () => {
    expect(GATHER_YIELD_MIN).toBe(2);
    expect(GATHER_YIELD_MAX).toBe(3);
    expect(GATHER_COOLDOWN_MS).toBe(15_000);
    for (const action of Object.values(GATHERABLE_PROPS)) {
      expect(action!.cooldownMs).toBe(GATHER_COOLDOWN_MS);
    }
  });

  it("rolls the full inclusive yield range from rng", () => {
    expect(rollGatherYield(() => 0)).toBe(2);
    expect(rollGatherYield(() => 0.49)).toBe(2);
    expect(rollGatherYield(() => 0.5)).toBe(3);
    expect(rollGatherYield(() => 0.999)).toBe(3);
  });

  it("grants the rolled yield and enforces the cooldown per node", () => {
    const first = tryHarvestNode("grove", 3, 4, tree, () => 0.9);
    expect(first).toEqual({ ok: true, message: "+3 Wood" });
    expect(getMaterialCount("wood")).toBe(3);
    expect(getGatherCooldownRemainingMs("grove", 3, 4, tree)).toBeGreaterThan(0);

    const again = tryHarvestNode("grove", 3, 4, tree, () => 0);
    expect(again.ok).toBe(false);
    expect(getMaterialCount("wood")).toBe(3);

    const other = tryHarvestNode("grove", 5, 4, tree, () => 0);
    expect(other).toEqual({ ok: true, message: "+2 Wood" });
    expect(getMaterialCount("wood")).toBe(5);
  });
});
