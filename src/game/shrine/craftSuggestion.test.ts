import { describe, expect, it } from "vitest";
import { CRAFT_RECIPES } from "../crafting/recipes";
import {
  groupRecipesForBook,
  questRecipeIds,
  suggestCraft,
  type SuggestInput,
} from "./craftSuggestion";

function input(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    questId: null,
    context: "altar",
    materials: {},
    items: {},
    partyDefinitionIds: ["mossling"],
    ...overrides,
  };
}

describe("suggestCraft", () => {
  it("follows the craft quest, not the cheapest recipe (no Wood Cudgel with no wood)", () => {
    const s = suggestCraft(
      input({
        questId: "shrine-craft",
        materials: { "moss-fiber": 2, "folklore-dust": 1 },
      }),
    );
    expect(s).toMatchObject({ kind: "craft", reason: "quest", ready: true });
    expect(s?.kind === "craft" && s.recipe.id).toBe("moss-salve");
  });

  it("prefers the relic that grows the player's own starter", () => {
    const ember = suggestCraft(
      input({
        questId: "shrine-craft",
        partyDefinitionIds: ["ember-wisp"],
        materials: {
          "moss-fiber": 2,
          "ember-ash": 2,
          "folklore-dust": 1,
        },
      }),
    );
    expect(ember?.kind === "craft" && ember.recipe.id).toBe("ember-charm");
  });

  it("never suggests the other starter's relic, even when its materials are in the pack", () => {
    const s = suggestCraft(
      input({
        questId: "shrine-craft",
        partyDefinitionIds: ["mossling"],
        materials: { "ember-ash": 2, "folklore-dust": 1 },
      }),
    );
    expect(s?.kind === "craft" && s.recipe.id).toBe("moss-salve");
    expect(s).toMatchObject({
      ready: false,
      usable: true,
      forCreatureId: "mossling",
    });
  });

  it("offers both relics, labelled by creature, when the party holds both starters", () => {
    const s = suggestCraft(
      input({
        questId: "shrine-craft",
        partyDefinitionIds: ["mossling", "ember-wisp"],
        materials: { "ember-ash": 2, "folklore-dust": 1 },
      }),
    );
    expect(s?.kind === "craft" && s.recipe.id).toBe("ember-charm");
    expect(s).toMatchObject({ ready: true, usable: true, forCreatureId: "ember-wisp" });
  });

  it("with neither starter, names the relic but marks it unusable (no Fill grid)", () => {
    const s = suggestCraft(
      input({
        questId: "shrine-craft",
        partyDefinitionIds: ["brook-nymph"],
        materials: { "moss-fiber": 2, "folklore-dust": 1 },
      }),
    );
    expect(s).toMatchObject({ kind: "craft", ready: true, usable: false });
  });

  it("still names the quest recipe, with what is missing, when the pack is empty", () => {
    const s = suggestCraft(input({ questId: "shrine-craft" }));
    expect(s?.kind).toBe("craft");
    if (s?.kind !== "craft") {
      return;
    }
    expect(s.recipe.id).toBe("moss-salve");
    expect(s.reason).toBe("quest");
    expect(s.ready).toBe(false);
    expect(s.needs).toEqual([
      { materialId: "moss-fiber", need: 2, have: 0 },
      { materialId: "folklore-dust", need: 1, have: 0 },
    ]);
  });

  it("picks the closest quest recipe when nothing is ready (both starters)", () => {
    const s = suggestCraft(
      input({
        questId: "shrine-craft",
        partyDefinitionIds: ["mossling", "ember-wisp"],
        materials: { "ember-ash": 2 },
      }),
    );
    expect(s?.kind === "craft" && s.recipe.id).toBe("ember-charm");
    expect(s).toMatchObject({ ready: false });
  });

  it("points at Fusion once the evolve beat's relic is crafted", () => {
    expect(
      suggestCraft(
        input({ questId: "first-evolution", items: { "moss-salve": 1 } }),
      ),
    ).toEqual({ kind: "fusion", itemId: "moss-salve" });
  });

  it("ignores a relic that does not fit the party and keeps suggesting the right one", () => {
    const s = suggestCraft(
      input({
        questId: "first-evolution",
        partyDefinitionIds: ["mossling"],
        items: { "ember-charm": 1 },
        materials: { "moss-fiber": 2, "folklore-dust": 1 },
      }),
    );
    expect(s?.kind === "craft" && s.recipe.id).toBe("moss-salve");
  });

  it("outside the relic beats suggests only what is craftable now", () => {
    expect(suggestCraft(input())).toBeNull();
    const s = suggestCraft(input({ materials: { wood: 3 } }));
    expect(s).toMatchObject({ kind: "craft", reason: "craftable", ready: true });
    expect(s?.kind === "craft" && s.recipe.id).toBe("wood-cudgel");
  });

  it("skips altar-only and already-owned unique recipes", () => {
    const portableMats = {
      "folklore-dust": 1,
      stone: 4,
      "brook-pearl": 1,
      "wild-fiber": 2,
    };
    const portable = suggestCraft(
      input({ context: "portable", materials: portableMats }),
    );
    expect(portable?.kind === "craft" && portable.recipe.id).not.toBe(
      "portable-moonshrine",
    );
    const owned = suggestCraft(
      input({
        materials: portableMats,
        items: { "portable-moonshrine": 1 },
      }),
    );
    expect(owned?.kind === "craft" && owned.recipe.id).not.toBe(
      "portable-moonshrine",
    );
  });
});

describe("groupRecipesForBook", () => {
  it("opens on the quest recipe, then craftable-now, then locked", () => {
    const groups = groupRecipesForBook(
      input({
        questId: "shrine-craft",
        materials: { "moss-fiber": 2, "folklore-dust": 1, wood: 3 },
      }),
    );
    expect(groups.quest.map((r) => r.id)).toEqual(["moss-salve", "ember-charm"]);
    expect(groups.craftable.map((r) => r.id)).toEqual(["wood-cudgel"]);
    expect(groups.locked.some((r) => r.id === "sovereign-seal")).toBe(true);
    expect(
      groups.quest.length + groups.craftable.length + groups.locked.length,
    ).toBe(CRAFT_RECIPES.length);
  });

  it("has no quest group outside the relic beats", () => {
    const groups = groupRecipesForBook(input({ questId: "rival-wren" }));
    expect(groups.quest).toEqual([]);
    expect(questRecipeIds("rival-wren", ["mossling"])).toEqual([]);
  });
});
