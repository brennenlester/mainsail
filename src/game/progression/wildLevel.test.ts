import { beforeEach, describe, expect, it } from "vitest";
import {
  getGiftCatchUpLevel,
  getPartyAverageLevel,
  getRarityBias,
  getSpeciesMaxEncounterWeight,
  getWildEffectiveLevel,
  isDefeatScalingExcluded,
  rarityBiasFromWeight,
  RARITY_BIAS_COMMON,
  RARITY_BIAS_RARE,
  RARITY_BIAS_UNCOMMON,
} from "./wildLevel";
import { setSparWinsBySpecies } from "../world/sparWins";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";

function member(instanceId: string, level: number): CreatureInstance {
  return {
    instanceId,
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level,
    xp: 0,
  };
}

describe("wildLevel", () => {
  beforeEach(() => {
    setSparWinsBySpecies({}, false);
    setPartyFromSnapshot([], 1);
  });

  it("classifies rarity from max encounter weight", () => {
    expect(getSpeciesMaxEncounterWeight("mossling")).toBe(70);
    expect(getRarityBias("mossling")).toBe(RARITY_BIAS_COMMON);
    expect(getRarityBias("lantern-fox")).toBe(RARITY_BIAS_RARE);
    expect(getRarityBias("isle-fernling")).toBe(RARITY_BIAS_RARE);
    expect(rarityBiasFromWeight(40)).toBe(RARITY_BIAS_COMMON);
    expect(rarityBiasFromWeight(39)).toBe(RARITY_BIAS_UNCOMMON);
    expect(rarityBiasFromWeight(13)).toBe(RARITY_BIAS_UNCOMMON);
    expect(rarityBiasFromWeight(12)).toBe(RARITY_BIAS_RARE);
  });

  it("excludes sovereigns from defeat scaling", () => {
    expect(isDefeatScalingExcluded("tide-sovereign")).toBe(true);
    expect(getWildEffectiveLevel("tide-sovereign", 100)).toBe(1);
  });

  it("sets wild level to party average plus a small rarity bias, capped at 50", () => {
    expect(RARITY_BIAS_UNCOMMON).toBe(1);
    expect(RARITY_BIAS_RARE).toBe(2);
    expect(getWildEffectiveLevel("mossling", 1)).toBe(1);
    expect(getWildEffectiveLevel("mossling", 5)).toBe(5);
    expect(getWildEffectiveLevel("lantern-fox", 5)).toBe(7);
    expect(getWildEffectiveLevel("lantern-fox", 1)).toBe(3);
    expect(getWildEffectiveLevel("mossling", 200)).toBe(50);
  });

  it("does not scale with spar wins (no treadmill)", () => {
    setSparWinsBySpecies({ mossling: 40 }, false);
    expect(getWildEffectiveLevel("mossling", 3)).toBe(3);
    setPartyFromSnapshot([member("a", 3)], 1, ["a"]);
    expect(getWildEffectiveLevel("mossling")).toBe(3);
  });

  it("reads the active party average when no level is passed", () => {
    expect(getPartyAverageLevel()).toBe(1);
    setPartyFromSnapshot(
      [member("a", 4), member("b", 7), member("c", 40)],
      4,
      ["a", "b"],
    );
    expect(getPartyAverageLevel()).toBe(6);
    expect(getWildEffectiveLevel("mossling")).toBe(6);
    expect(getWildEffectiveLevel("tide-sovereign")).toBe(1);
  });

  it("gifts a catch-up level: average - 2, min 1, never above the lead (#429)", () => {
    expect(getGiftCatchUpLevel()).toBe(1);
    setPartyFromSnapshot([member("a", 6)], 2, ["a"]);
    expect(getGiftCatchUpLevel()).toBe(4);
    setPartyFromSnapshot([member("a", 2)], 2, ["a"]);
    expect(getGiftCatchUpLevel()).toBe(1);
    // Weak lead, strong mate: average - 2 (5) would pass the lead (4).
    setPartyFromSnapshot([member("a", 4), member("b", 9)], 3, ["a", "b"]);
    expect(getGiftCatchUpLevel()).toBe(4);
  });
});
