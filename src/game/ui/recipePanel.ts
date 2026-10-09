import { getIngredientName } from "../inventory/materials";
import { appendMaterialVisual } from "./materialIcon";
import { popOverlay, pushOverlay } from "./overlayStack";
import { groupRecipesForBook } from "../shrine/craftSuggestion";
import {
  withStagedCraftingItems,
  withStagedCraftingMaterials,
} from "../crafting/stagedMaterials";
import { playerParty } from "../creatures/party";
import { playerInventory } from "../inventory/playerInventory";
import { getActiveQuestId } from "../story/questProgress";
import { getSovereignVoyageStep } from "../story/sovereignVoyage";
import {
  CRAFT_RECIPES,
  getRecipeMaterials,
  patternToMaterialRows,
  type CraftContext,
  type CraftRecipe,
} from "../crafting/recipes";

export type RecipePage = {
  id: string;
  name: string;
  outputItemId: string;
  outputCount: number;
  altarOnly: boolean;
  uniqueOwned: boolean;
  materials: { materialId: string; name: string; count: number }[];
  grid: (string | null)[][];
};

export function listRecipePages(
  recipes: CraftRecipe[] = CRAFT_RECIPES,
): RecipePage[] {
  return recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    outputItemId: recipe.outputItemId,
    outputCount: recipe.outputCount,
    altarOnly: Boolean(recipe.altarOnly),
    uniqueOwned: Boolean(recipe.uniqueOwned),
    materials: getRecipeMaterials(recipe).map((m) => ({
      ...m,
      name: getIngredientName(m.materialId),
    })),
    grid: patternToMaterialRows(recipe.pattern),
  }));
}

let recipesOpen = false;
let previouslyFocused: HTMLElement | null = null;

function onRecipesKeyDown(event: KeyboardEvent): void {
  if (!recipesOpen) {
    return;
  }
  if (event.key === "Escape") {
    return;
  }
  event.stopImmediatePropagation();
}

function setBackgroundInert(inert: boolean): void {
  const playfield = document.getElementById("playfield");
  if (playfield) {
    if (inert) {
      playfield.setAttribute("inert", "");
    } else {
      playfield.removeAttribute("inert");
    }
  }
}

function ensureRecipesRoot(): HTMLElement {
  let root = document.getElementById("recipes-overlay");
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "recipes-overlay";
  root.className = "recipes-overlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="recipes-panel" role="dialog" aria-labelledby="recipes-title">
      <div class="recipes-header">
        <h2 id="recipes-title">Recipes</h2>
        <button type="button" id="recipes-close" class="recipes-close" aria-label="Close">×</button>
      </div>
      <p class="recipes-intro">Shaped 4×4 patterns. Slide them anywhere on the grid; do not rotate. Craft at Moon Shrine, or from Inventory after you own a Portable Moonshrine.</p>
      <div id="recipes-body" class="recipes-body"></div>
    </div>
  `;
  document.getElementById("app")?.appendChild(root);
  root.querySelector("#recipes-close")?.addEventListener("click", closeRecipes);
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      closeRecipes();
    }
  });
  return root;
}

function renderRecipeGrid(grid: (string | null)[][]): HTMLElement {
  const table = document.createElement("div");
  table.className = "recipe-grid";
  table.style.gridTemplateColumns = `repeat(${grid[0]?.length ?? 1}, 1fr)`;
  for (const row of grid) {
    for (const cell of row) {
      const el = document.createElement("span");
      el.className = cell ? "recipe-cell recipe-cell-filled" : "recipe-cell";
      if (cell) {
        appendMaterialVisual(el, cell, { showName: true });
      }
      table.appendChild(el);
    }
  }
  return table;
}

function renderRecipeCard(
  page: RecipePage,
  badge?: { text: string; tone: "quest" | "ready" },
): HTMLElement {
  const section = document.createElement("section");
  section.className = "recipe-card";
  section.dataset.recipeId = page.id;
  if (badge) {
    section.classList.add(`recipe-card-${badge.tone}`);
  }
  const heading = document.createElement("h3");
  const count = page.outputCount > 1 ? ` ×${page.outputCount}` : "";
  heading.textContent = `${page.name}${count}`;
  if (badge) {
    const chip = document.createElement("span");
    chip.className = `recipe-badge recipe-badge-${badge.tone}`;
    chip.textContent = badge.text;
    heading.append(" ", chip);
  }
  section.appendChild(heading);
  if (page.altarOnly) {
    const note = document.createElement("p");
    note.className = "recipe-note";
    note.textContent = "Craft only at the Moon Shrine altar. One owned.";
    section.appendChild(note);
  }
  if (page.id === "sovereign-seal") {
    const note = document.createElement("p");
    note.className = "recipe-note";
    note.textContent =
      "Place Tide Crown and Boulder Crown in the bottom corners. They return after craft.";
    section.appendChild(note);
  }
  if (page.id === "sovereign-plate") {
    const note = document.createElement("p");
    note.className = "recipe-note";
    note.textContent =
      "Consumes both crowns. Toggle On/Off in Inventory to silence wild encounters; sovereigns still appear.";
    section.appendChild(note);
  }
  const cost = document.createElement("p");
  cost.className = "recipe-cost";
  cost.textContent = page.materials
    .map((m) => `${m.name}×${m.count}`)
    .join(" + ");
  section.appendChild(cost);
  section.appendChild(renderRecipeGrid(page.grid));
  return section;
}

/**
 * Recipe book order (#402): the quest recipe first, then what the pack can
 * craft now, then everything still missing ingredients, collapsed.
 */
function renderRecipesBody(context: CraftContext): void {
  const body = document.getElementById("recipes-body");
  if (!body) {
    return;
  }
  body.replaceChildren();
  const pages = new Map(listRecipePages().map((page) => [page.id, page]));
  const groups = groupRecipesForBook({
    questId: getActiveQuestId(),
    context,
    // Count what is staged on an open craft grid too.
    materials: withStagedCraftingMaterials(playerInventory.materials),
    items: withStagedCraftingItems(playerInventory.items),
    partyDefinitionIds: playerParty.creatures.map((c) => c.definitionId),
    voyageStep: getSovereignVoyageStep(),
  });
  const append = (
    recipes: CraftRecipe[],
    badge?: { text: string; tone: "quest" | "ready" },
  ): void => {
    for (const recipe of recipes) {
      const page = pages.get(recipe.id);
      if (page) {
        body.appendChild(renderRecipeCard(page, badge));
      }
    }
  };
  append(groups.quest, { text: "Quest", tone: "quest" });
  append(groups.craftable, { text: "Ready to craft", tone: "ready" });
  if (groups.locked.length > 0) {
    const details = document.createElement("details");
    details.className = "recipe-locked";
    details.open = groups.quest.length + groups.craftable.length === 0;
    const summary = document.createElement("summary");
    summary.textContent = `${
      groups.quest.length + groups.craftable.length > 0
        ? "More recipes"
        : "All recipes"
    } (${groups.locked.length}) \u2014 need more materials`;
    details.appendChild(summary);
    const inner = document.createElement("div");
    inner.className = "recipes-locked-body";
    details.appendChild(inner);
    for (const recipe of groups.locked) {
      const page = pages.get(recipe.id);
      if (page) {
        inner.appendChild(renderRecipeCard(page));
      }
    }
    body.appendChild(details);
  }
}

/**
 * `context` is where the player is crafting: altar-only recipes only read as
 * ready at the altar. Defaults to away from the altar.
 */
export function openRecipes(context: CraftContext = "inventory"): void {
  const root = ensureRecipesRoot();
  renderRecipesBody(context);
  previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.hidden = false;
  recipesOpen = true;
  setBackgroundInert(true);
  pushOverlay("recipes", closeRecipes);
  window.addEventListener("keydown", onRecipesKeyDown, true);
  const closeBtn = root.querySelector(
    "#recipes-close",
  ) as HTMLButtonElement | null;
  closeBtn?.focus();
}

export function closeRecipes(): void {
  popOverlay("recipes");
  const root = document.getElementById("recipes-overlay");
  if (root) {
    root.hidden = true;
  }
  recipesOpen = false;
  const inventory = document.getElementById("inventory-overlay");
  if (!inventory || inventory.hidden) {
    setBackgroundInert(false);
  }
  window.removeEventListener("keydown", onRecipesKeyDown, true);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

export function toggleRecipes(): void {
  if (recipesOpen) {
    closeRecipes();
  } else {
    openRecipes();
  }
}

export function isRecipesOpen(): boolean {
  return recipesOpen;
}
