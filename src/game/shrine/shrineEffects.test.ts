import { describe, expect, it } from "vitest";
import { CRAFT_RECIPES } from "../crafting/recipes";
import { ZONE_ENCOUNTERS } from "../encounters/tables";
import { MAX_LEVEL } from "../progression/leveling";
import { FUSION_ITEM_IDS } from "./consumables";
import { listRecipePages } from "../ui/recipePanel";
import { describeShrineEffect, SHRINE_EFFECTS } from "./shrineEffects";

/**
 * Zones with wild tables that carry a signature / late-game encounter identity.
 * Hearth Crossing is a safe plaza with no wild table since #411.
 */
const SIGNATURE_ZONES = [
  "grove",
  "shrine",
  "overworld",
  "mistwood",
  "emberfen",
] as const;

const LEGACY_SHRINE_ROWS = [
  {
    creatureId: "mossling",
    itemId: "ember-charm",
    minLevel: 3,
    effectType: "attack-buff",
    secondaryElement: "hearth",
    attackBonus: 4,
    secondaryMove: {
      id: "ember-lash",
      name: "Ember Lash",
      power: 9,
      type: "hearth",
      accuracy: 90,
    },
  },
  {
    creatureId: "ember-wisp",
    itemId: "moss-salve",
    minLevel: 3,
    effectType: "health-buff",
    hpBonus: 8,
  },
  {
    creatureId: "ember-wisp",
    itemId: "ember-charm",
    minLevel: 1,
    effectType: "evolution",
    evolvesTo: "hearthflame",
  },
  {
    creatureId: "mossling",
    itemId: "moss-salve",
    minLevel: 1,
    effectType: "evolution",
    evolvesTo: "bramblewarden",
  },
] as const;

describe("SHRINE_EFFECTS matrix (#272)", () => {
  it("covers every signature zone with at least one encounterable pair", () => {
    for (const zoneId of SIGNATURE_ZONES) {
      const species = new Set(
        (ZONE_ENCOUNTERS[zoneId] ?? []).map((entry) => entry.id),
      );
      const covered = SHRINE_EFFECTS.some((row) => species.has(row.creatureId));
      expect(covered, `${zoneId} has no shrine pair`).toBe(true);
    }
  });

  it("crafts every shrine effect item from a live CRAFT_RECIPES row", () => {
    const craftable = new Set(CRAFT_RECIPES.map((r) => r.outputItemId));
    for (const row of SHRINE_EFFECTS) {
      expect(craftable.has(row.itemId), `${row.itemId} not craftable`).toBe(
        true,
      );
    }
  });

  it("keeps every minLevel reachable under the shipped XP curve", () => {
    for (const row of SHRINE_EFFECTS) {
      expect(row.minLevel).toBeGreaterThanOrEqual(1);
      expect(row.minLevel).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it("does not change the four legacy shrine rows", () => {
    expect(SHRINE_EFFECTS.slice(0, 4)).toEqual([...LEGACY_SHRINE_ROWS]);
  });

  it("allows Mossling and Ember Wisp evolution at Lv 1 (#315)", () => {
    const evolutions = SHRINE_EFFECTS.filter(
      (row) => row.effectType === "evolution",
    );
    expect(evolutions).toHaveLength(2);
    expect(evolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evolvesTo: "bramblewarden", minLevel: 1 }),
        expect.objectContaining({ evolvesTo: "hearthflame", minLevel: 1 }),
      ]),
    );
  });

  it("surfaces Growth charm recipes in Recipes and Fusion UI lists", () => {
    const recipeIds = new Set(listRecipePages().map((p) => p.id));
    const fusionIds = new Set(FUSION_ITEM_IDS);
    for (const id of [
      "storm-charm",
      "fox-fire-charm",
      "fen-charm",
      "nymph-charm",
      "hound-collar",
    ] as const) {
      expect(recipeIds.has(id)).toBe(true);
      expect(fusionIds.has(id)).toBe(true);
    }
  });

  it("tags first-milestone Growth unlocks as evolve or presence", () => {
    const growthRows = SHRINE_EFFECTS.filter((row) =>
      ["evolution", "presence"].includes(row.effectType),
    );
    expect(growthRows.some((row) => row.effectType === "evolution")).toBe(true);
    expect(growthRows.some((row) => row.effectType === "presence")).toBe(true);
    expect(growthRows).toHaveLength(7);
  });
});

describe("describeShrineEffect", () => {
  it("names creatures and growth in player-facing words, never raw ids", () => {
    for (const row of SHRINE_EFFECTS) {
      const line = describeShrineEffect(row);
      expect(line).not.toMatch(/@ Lv\.|-buff|[a-z]+-[a-z]+ \(/);
      expect(line).toContain(`Lv ${row.minLevel}+`);
    }
    const health = SHRINE_EFFECTS.find((row) => row.effectType === "health-buff")!;
    expect(describeShrineEffect(health)).toBe("Ember Wisp (Lv 3+): +8 max HP");
    const evolve = SHRINE_EFFECTS.find(
      (row) => row.effectType === "evolution" && row.creatureId === "ember-wisp",
    )!;
    expect(describeShrineEffect(evolve)).toMatch(/^Ember Wisp \(Lv 1\+\): evolves into /);
  });
});
