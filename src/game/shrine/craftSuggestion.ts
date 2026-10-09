import {
  CRAFT_RECIPES,
  getRecipeMaterials,
  type CraftContext,
  type CraftRecipe,
} from "../crafting/recipes";
import { isCraftItemIngredient } from "../inventory/materials";
import type { QuestId } from "../story/questTypes";
import type { SovereignVoyageStep } from "../story/sovereignVoyage";

/**
 * Quest- and inventory-aware craft suggestions (#402). Pure: callers pass the
 * counts, so the crafting panel, the recipe book and tests share one answer.
 */

export type SuggestInput = {
  questId: QuestId | null;
  context: CraftContext;
  /** Material counts, including anything staged on the craft grid. */
  materials: Readonly<Record<string, number>>;
  /** Item counts (crowns etc. count as ingredients), including staged. */
  items: Readonly<Record<string, number>>;
  /** `definitionId` of each party member (decides Moss Salve vs Ember Charm). */
  partyDefinitionIds: readonly string[];
  /**
   * Sovereign voyage step (#426). With no main quest active the HUD's
   * objective is the voyage, so its "boat" step asks for the Boat recipe.
   */
  voyageStep?: SovereignVoyageStep | null;
};

export type RecipeNeed = { materialId: string; need: number; have: number };

export type CraftSuggestion =
  | {
      kind: "craft";
      reason: "quest" | "craftable";
      recipe: CraftRecipe;
      /** Every ingredient is in the pack right now. */
      ready: boolean;
      /** False when nobody in the party can use the result (no Fill grid). */
      usable: boolean;
      /** Creature the relic grows, for the "for Mossling" label. */
      forCreatureId?: string;
      needs: RecipeNeed[];
    }
  | {
      /** The relic is already crafted; the next step is the Fusion tab. */
      kind: "fusion";
      itemId: string;
    };

/** Story beats 3 and 4 both ask for a growth relic. */
const RELIC_QUESTS: readonly QuestId[] = ["shrine-craft", "first-evolution"];

/** Relic recipe that grows each Grove starter (ids match recipes + fusion items). */
const RELIC_FOR_CREATURE: Readonly<Record<string, string>> = {
  mossling: "moss-salve",
  "ember-wisp": "ember-charm",
};
const DEFAULT_RELIC_ORDER: readonly string[] = ["moss-salve", "ember-charm"];

/** Early-game preference when nothing quest-specific applies. */
const CRAFTABLE_PRIORITY: readonly string[] = [
  "wood-cudgel",
  "stone-knife",
  "brook-crystal",
  "ember-charm",
  "moss-salve",
  "storm-charm",
  "fox-fire-charm",
  "fen-charm",
  "nymph-charm",
  "hound-collar",
  "brook-tonic",
  "moonwake-draught",
  "boat",
  "portable-moonshrine",
];

export function recipeNeeds(
  recipe: CraftRecipe,
  input: Pick<SuggestInput, "materials" | "items">,
): RecipeNeed[] {
  return getRecipeMaterials(recipe).map((m) => ({
    materialId: m.materialId,
    need: m.count,
    have:
      (isCraftItemIngredient(m.materialId) ? input.items : input.materials)[
        m.materialId
      ] ?? 0,
  }));
}

function missingTotal(needs: readonly RecipeNeed[]): number {
  return needs.reduce((sum, n) => sum + Math.max(0, n.need - n.have), 0);
}

/** False for context-locked or already-owned unique recipes. */
function recipeAvailable(recipe: CraftRecipe, input: SuggestInput): boolean {
  if (recipe.altarOnly && input.context !== "altar") {
    return false;
  }
  if (recipe.uniqueOwned && (input.items[recipe.outputItemId] ?? 0) >= 1) {
    return false;
  }
  return true;
}

/** Relic recipe ids for the quest, the player's own Grove starter first. */
export function questRecipeIds(
  questId: QuestId | null,
  partyDefinitionIds: readonly string[],
): string[] {
  if (!questId || !RELIC_QUESTS.includes(questId)) {
    return [];
  }
  const partyFirst = partyDefinitionIds
    .map((id) => RELIC_FOR_CREATURE[id])
    .filter((id): id is string => Boolean(id));
  return [...new Set([...partyFirst, ...DEFAULT_RELIC_ORDER])];
}

function byId(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES.find((r) => r.id === id);
}

/** The voyage's "craft a Boat" step is the objective (no main quest active). */
function voyageRecipeId(input: Pick<SuggestInput, "questId" | "voyageStep">): string | null {
  return !input.questId && input.voyageStep === "boat" ? "boat" : null;
}

/** Relics the party can use (one per Grove starter held), in party order. */
function partyRelicIds(partyDefinitionIds: readonly string[]): string[] {
  return [
    ...new Set(
      partyDefinitionIds
        .map((id) => RELIC_FOR_CREATURE[id])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

function creatureForRelic(recipeId: string): string | undefined {
  return Object.keys(RELIC_FOR_CREATURE).find(
    (id) => RELIC_FOR_CREATURE[id] === recipeId,
  );
}

export function suggestCraft(input: SuggestInput): CraftSuggestion | null {
  if (questRecipeIds(input.questId, input.partyDefinitionIds).length > 0) {
    // Only the relic that grows a companion the player holds; with neither
    // starter, name the relics but never offer to build one.
    const partyRelics = partyRelicIds(input.partyDefinitionIds);
    const usable = partyRelics.length > 0;
    const candidates = usable ? partyRelics : [...DEFAULT_RELIC_ORDER];
    // Already holding the relic for the evolve beat: send them to Fusion.
    if (input.questId === "first-evolution" && usable) {
      const owned = candidates.find((id) => (input.items[id] ?? 0) > 0);
      if (owned) {
        return { kind: "fusion", itemId: owned };
      }
    }
    let best: Extract<CraftSuggestion, { kind: "craft" }> | null = null;
    for (const id of candidates) {
      const recipe = byId(id);
      if (!recipe || !recipeAvailable(recipe, input)) {
        continue;
      }
      const needs = recipeNeeds(recipe, input);
      const missing = missingTotal(needs);
      const entry = {
        kind: "craft" as const,
        reason: "quest" as const,
        recipe,
        ready: missing === 0,
        usable,
        forCreatureId: creatureForRelic(id),
        needs,
      };
      if (missing === 0) {
        return entry;
      }
      if (!best || missing < missingTotal(best.needs)) {
        best = entry;
      }
    }
    return best;
  }

  const voyage = voyageRecipeId(input);
  const boat = voyage ? byId(voyage) : undefined;
  if (boat && recipeAvailable(boat, input)) {
    const needs = recipeNeeds(boat, input);
    return { kind: "craft", reason: "quest", recipe: boat, ready: missingTotal(needs) === 0, usable: true, needs };
  }

  const ready = CRAFT_RECIPES.filter(
    (recipe) =>
      recipeAvailable(recipe, input) &&
      missingTotal(recipeNeeds(recipe, input)) === 0,
  ).sort((a, b) => priority(a) - priority(b));
  const pick = ready[0];
  if (!pick) {
    return null;
  }
  return {
    kind: "craft",
    reason: "craftable",
    recipe: pick,
    ready: true,
    usable: true,
    needs: recipeNeeds(pick, input),
  };
}

function priority(recipe: CraftRecipe): number {
  const i = CRAFTABLE_PRIORITY.indexOf(recipe.id);
  return i === -1 ? CRAFTABLE_PRIORITY.length : i;
}

export type RecipeBookGroups = {
  /** Recipes the active quest asks for, best first. */
  quest: CraftRecipe[];
  /** Everything else the pack can craft right now. */
  craftable: CraftRecipe[];
  /** Missing ingredients (collapsed in the book). */
  locked: CraftRecipe[];
};

/** Recipe book order: quest recipe, then craftable-now, then locked. */
export function groupRecipesForBook(
  input: SuggestInput,
  recipes: readonly CraftRecipe[] = CRAFT_RECIPES,
): RecipeBookGroups {
  const voyage = voyageRecipeId(input);
  const questIds = [...questRecipeIds(input.questId, input.partyDefinitionIds), ...(voyage ? [voyage] : [])];
  const quest: CraftRecipe[] = [];
  for (const id of questIds) {
    const recipe = recipes.find((r) => r.id === id);
    if (recipe) {
      quest.push(recipe);
    }
  }
  const rest = recipes.filter((r) => !quest.includes(r));
  const craftable = rest
    .filter(
      (r) =>
        recipeAvailable(r, input) && missingTotal(recipeNeeds(r, input)) === 0,
    )
    .sort((a, b) => priority(a) - priority(b));
  const locked = rest.filter((r) => !craftable.includes(r));
  return { quest, craftable, locked };
}
