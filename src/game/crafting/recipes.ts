import { isCraftItemIngredient } from "../inventory/materials";
import {
  addItem,
  addMaterial,
  BOULDER_CROWN_ID,
  canAddItem,
  consumeItem,
  consumeMaterial,
  getItemCount,
  getMaterialCount,
  playerInventory,
  TIDE_CROWN_ID,
} from "../inventory/playerInventory";
import { isVisitorMode } from "../world/worldSession";
import { isEclipseFusionCompleted } from "../world/worldState";
import { withStagedCraftingItems } from "./stagedMaterials";

export const GRID_SIZE = 4;

export type CraftContext = "altar" | "inventory" | "portable";

export type CraftRecipe = {
  id: string;
  name: string;
  outputItemId: string;
  outputCount: number;
  /** Minimal bounding-box rows. `.` = empty; other glyphs map via PATTERN_GLYPHS. */
  pattern: string[];
  altarOnly?: boolean;
  uniqueOwned?: boolean;
  /** When true, craft item ingredients (e.g. crowns) are consumed instead of returned. */
  consumeItemIngredients?: boolean;
};

export const PATTERN_GLYPHS: Record<string, string> = {
  W: "wood",
  S: "stone",
  F: "wild-fiber",
  M: "moss-fiber",
  A: "ember-ash",
  P: "brook-pearl",
  B: "pebble",
  D: "folklore-dust",
  R: "storm-feather",
  I: "mist-shard",
  L: "lantern-wick",
  U: "peat-tuft",
  T: TIDE_CROWN_ID,
  C: BOULDER_CROWN_ID,
};

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    id: "sovereign-seal",
    name: "Sovereign Seal",
    outputItemId: "sovereign-seal",
    outputCount: 1,
    // Original seal materials, plus both exclusive crowns in the empty corners.
    // ponytail: crowns are earned by defeating sovereigns and are returned after craft.
    pattern: ["PBP", "BDB", "PDF", "TFC"],
  },
  {
    id: "sovereign-plate",
    name: "Sovereign Plate",
    outputItemId: "sovereign-plate",
    outputCount: 1,
    // Fiber corners, stone frame, Boulder Crown left / Tide Crown right (#289).
    pattern: ["FSSF", "SCTS", "FSSF"],
    uniqueOwned: true,
    consumeItemIngredients: true,
  },
  {
    id: "wood-cudgel",
    name: "Wood Cudgel",
    outputItemId: "wood-cudgel",
    outputCount: 1,
    pattern: ["W", "W", "W"],
  },
  {
    id: "stone-knife",
    name: "Stone Knife",
    outputItemId: "stone-knife",
    outputCount: 1,
    pattern: ["S", "S", "W"],
  },
  {
    id: "ember-charm",
    name: "Ember Charm",
    outputItemId: "ember-charm",
    outputCount: 1,
    pattern: ["AD", "A."],
  },
  {
    id: "moss-salve",
    name: "Moss Salve",
    outputItemId: "moss-salve",
    outputCount: 1,
    pattern: ["MD", "M."],
  },
  {
    id: "storm-charm",
    name: "Storm Charm",
    outputItemId: "storm-charm",
    outputCount: 1,
    pattern: ["RR", "II", "D."],
  },
  {
    id: "fox-fire-charm",
    name: "Fox-fire Charm",
    outputItemId: "fox-fire-charm",
    outputCount: 1,
    pattern: ["LD", "L."],
  },
  {
    id: "fen-charm",
    name: "Fen Charm",
    outputItemId: "fen-charm",
    outputCount: 1,
    pattern: ["UD", "U."],
  },
  {
    id: "nymph-charm",
    name: "Nymph Charm",
    outputItemId: "nymph-charm",
    outputCount: 1,
    // Pearl + dust like brook-tonic, distinct bounding box so matchGrid stays unambiguous.
    pattern: ["DP", "P."],
  },
  {
    id: "hound-collar",
    name: "Hound Collar",
    outputItemId: "hound-collar",
    outputCount: 1,
    pattern: ["BD", "B."],
  },
  {
    id: "brook-tonic",
    name: "Brook Tonic",
    outputItemId: "brook-tonic",
    outputCount: 3,
    pattern: ["PD", "P."],
  },
  {
    id: "brook-crystal",
    name: "Brook Crystal",
    outputItemId: "brook-crystal",
    outputCount: 1,
    pattern: ["P"],
  },
  {
    id: "moonwake-draught",
    name: "Moonwake Draught",
    outputItemId: "moonwake-draught",
    outputCount: 3,
    pattern: ["MP", "D."],
  },
  {
    // ponytail: craftable more than once; dock placement (#75) enforces one boat at a time
    id: "boat",
    name: "Boat",
    outputItemId: "boat",
    outputCount: 1,
    pattern: [".WW.", "WWWW", "FFFD"],
  },
  {
    id: "portable-moonshrine",
    name: "Portable Moonshrine",
    outputItemId: "portable-moonshrine",
    outputCount: 1,
    pattern: [".D.", "SSS", "SPS", "F.F"],
    altarOnly: true,
    uniqueOwned: true,
  },
  {
    // Befriend offering (#366): +odds for any wild, consumed per attempt.
    id: "folk-seal",
    name: "Folk Seal",
    outputItemId: "folk-seal",
    outputCount: 1,
    pattern: ["FD", "DF"],
  },
  {
    // Befriend offering (#366): big +odds, flavored with 1 of the wild's favorite material.
    id: "favorite-bait",
    name: "Favorite Bait",
    outputItemId: "favorite-bait",
    outputCount: 2,
    pattern: ["FWF"],
  },
];

export type CraftGrid = (string | null)[][];

export type GridBox = {
  row: number;
  col: number;
  height: number;
  width: number;
};

export type MatchResult =
  | { status: "match"; recipe: CraftRecipe; box: GridBox }
  | { status: "blocked"; recipe: CraftRecipe; message: string }
  | { status: "none" };

export { isCraftItemIngredient };
export function takeCraftIngredient(id: string): boolean {
  return isCraftItemIngredient(id) ? consumeItem(id) : consumeMaterial(id, 1);
}

export function returnCraftIngredient(id: string): void {
  if (isCraftItemIngredient(id)) {
    addItem(id, 1);
    return;
  }
  addMaterial(id, 1);
}

export function emptyGrid(): CraftGrid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
}

export function cloneGrid(grid: CraftGrid): CraftGrid {
  return grid.map((row) => [...row]);
}

export function getRecipeMaterials(
  recipe: CraftRecipe,
): { materialId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of recipe.pattern) {
    for (const glyph of row) {
      if (glyph === ".") {
        continue;
      }
      const materialId = PATTERN_GLYPHS[glyph];
      if (!materialId) {
        throw new Error(`Unknown pattern glyph: ${glyph}`);
      }
      counts.set(materialId, (counts.get(materialId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([materialId, count]) => ({
    materialId,
    count,
  }));
}

function hasCraftIngredient(id: string, count: number): boolean {
  return isCraftItemIngredient(id)
    ? getItemCount(id) >= count
    : getMaterialCount(id) >= count;
}

function consumeCraftIngredient(
  id: string,
  count: number,
  recipe: CraftRecipe,
): boolean {
  if (isCraftItemIngredient(id)) {
    if (!recipe.consumeItemIngredients) {
      return true;
    }
    for (let i = 0; i < count; i++) {
      if (!consumeItem(id)) {
        return false;
      }
    }
    return true;
  }
  return consumeMaterial(id, count);
}

export function patternToMaterialRows(pattern: string[]): (string | null)[][] {
  return pattern.map((row) =>
    [...row].map((glyph) => {
      if (glyph === ".") {
        return null;
      }
      const materialId = PATTERN_GLYPHS[glyph];
      if (!materialId) {
        throw new Error(`Unknown pattern glyph: ${glyph}`);
      }
      return materialId;
    }),
  );
}

export function occupiedBox(grid: CraftGrid): GridBox | null {
  let minR = GRID_SIZE;
  let minC = GRID_SIZE;
  let maxR = -1;
  let maxC = -1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c]) {
        minR = Math.min(minR, r);
        minC = Math.min(minC, c);
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) {
    return null;
  }
  return {
    row: minR,
    col: minC,
    height: maxR - minR + 1,
    width: maxC - minC + 1,
  };
}

export function placePattern(
  grid: CraftGrid,
  pattern: string[],
  row: number,
  col: number,
): CraftGrid {
  const next = cloneGrid(grid);
  const cells = patternToMaterialRows(pattern);
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      next[row + r][col + c] = cells[r][c];
    }
  }
  return next;
}

function uniqueOwnedBlockedMessage(recipe: CraftRecipe): string {
  if (recipe.id === "portable-moonshrine") {
    return "Already have a Moonshrine";
  }
  return `Already have a ${recipe.name}`;
}

function ownedItemCount(itemId: string): number {
  return withStagedCraftingItems(playerInventory.items)[itemId] ?? 0;
}

function fusionPathCraftBlock(recipe: CraftRecipe): string | null {
  if (!isEclipseFusionCompleted()) {
    return null;
  }
  if (recipe.outputItemId === "sovereign-seal") {
    return "Eclipse Sovereign has already been fused.";
  }
  return null;
}

function patternMatchesBox(
  grid: CraftGrid,
  box: GridBox,
  pattern: string[],
): boolean {
  const cells = patternToMaterialRows(pattern);
  if (cells.length !== box.height) {
    return false;
  }
  if (cells.some((row) => row.length !== box.width)) {
    return false;
  }
  for (let r = 0; r < box.height; r++) {
    for (let c = 0; c < box.width; c++) {
      if (grid[box.row + r][box.col + c] !== cells[r][c]) {
        return false;
      }
    }
  }
  return true;
}

export function matchGrid(grid: CraftGrid, context: CraftContext): MatchResult {
  const box = occupiedBox(grid);
  if (!box) {
    return { status: "none" };
  }
  for (const recipe of CRAFT_RECIPES) {
    if (recipe.altarOnly && context !== "altar") {
      continue;
    }
    if (!patternMatchesBox(grid, box, recipe.pattern)) {
      continue;
    }
    if (recipe.uniqueOwned && ownedItemCount(recipe.outputItemId) >= 1) {
      return {
        status: "blocked",
        recipe,
        message: uniqueOwnedBlockedMessage(recipe),
      };
    }
    const fusionBlock = fusionPathCraftBlock(recipe);
    if (fusionBlock) {
      return { status: "blocked", recipe, message: fusionBlock };
    }
    return { status: "match", recipe, box };
  }
  return { status: "none" };
}

export function clearBox(grid: CraftGrid, box: GridBox): CraftGrid {
  const next = cloneGrid(grid);
  for (let r = 0; r < box.height; r++) {
    for (let c = 0; c < box.width; c++) {
      next[box.row + r][box.col + c] = null;
    }
  }
  return next;
}

export function returnGridToInventory(grid: CraftGrid): CraftGrid {
  for (const row of grid) {
    for (const cell of row) {
      if (cell) {
        returnCraftIngredient(cell);
      }
    }
  }
  return emptyGrid();
}

export function canCraft(
  recipe: CraftRecipe,
  context: CraftContext = "altar",
): boolean {
  if (isVisitorMode()) {
    return false;
  }
  if (recipe.altarOnly && context !== "altar") {
    return false;
  }
  if (recipe.uniqueOwned && ownedItemCount(recipe.outputItemId) >= 1) {
    return false;
  }
  if (fusionPathCraftBlock(recipe)) {
    return false;
  }
  return (
    canAddItem(recipe.outputItemId, recipe.outputCount) &&
    getRecipeMaterials(recipe).every((m) =>
      hasCraftIngredient(m.materialId, m.count),
    )
  );
}

export function craftItem(recipe: CraftRecipe): boolean {
  if (!canCraft(recipe)) {
    return false;
  }
  for (const m of getRecipeMaterials(recipe)) {
    if (!consumeCraftIngredient(m.materialId, m.count, recipe)) {
      return false;
    }
  }
  return addItem(recipe.outputItemId, recipe.outputCount);
}

export type CraftFromGridResult =
  | { ok: true; grid: CraftGrid; recipe: CraftRecipe }
  | { ok: false; grid: CraftGrid; message: string };

export function craftFromGrid(
  grid: CraftGrid,
  context: CraftContext,
  onConsumed?: (next: CraftGrid) => void,
): CraftFromGridResult {
  if (isVisitorMode()) {
    return {
      ok: false,
      grid,
      message: "Visitors can view, but only the host can craft.",
    };
  }
  const match = matchGrid(grid, context);
  if (match.status === "none") {
    return { ok: false, grid, message: "Nothing matches that arrangement." };
  }
  if (match.status === "blocked") {
    return { ok: false, grid, message: match.message };
  }
  if (!canAddItem(match.recipe.outputItemId, match.recipe.outputCount)) {
    return { ok: false, grid, message: "You can't hold more of that." };
  }
  const returnedItems: string[] = [];
  for (let r = 0; r < match.box.height; r++) {
    for (let c = 0; c < match.box.width; c++) {
      const id = grid[match.box.row + r][match.box.col + c];
      if (
        id &&
        isCraftItemIngredient(id) &&
        !match.recipe.consumeItemIngredients
      ) {
        returnedItems.push(id);
      }
    }
  }
  const next = clearBox(grid, match.box);
  onConsumed?.(next);
  if (!addItem(match.recipe.outputItemId, match.recipe.outputCount)) {
    onConsumed?.(grid);
    return { ok: false, grid, message: "You can't hold more of that." };
  }
  for (const id of returnedItems) {
    returnCraftIngredient(id);
  }
  return { ok: true, grid: next, recipe: match.recipe };
}
