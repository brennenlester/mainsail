import { getItemName, getMaterialName } from "../inventory/materials";
import { appendMaterialVisual } from "./materialIcon";
import { openRecipes } from "./recipePanel";
import { applyShrineCraftOverlayRect } from "./shrinePanel";
import {
  clearCraftSpotlight,
  isCraftSpotlightActive,
  selectSpotlightRecipe,
} from "../shrine/shrineDisclosure";
import { getRecipeMaterials } from "../crafting/recipes";
import {
  canAddItem,
  playerInventory,
} from "../inventory/playerInventory";
import { isVisitorMode } from "../world/worldSession";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { registerStagedCraftingSource } from "../crafting/stagedMaterials";
import {
  GRID_SIZE,
  cloneGrid,
  craftFromGrid,
  emptyGrid,
  isCraftItemIngredient,
  matchGrid,
  PATTERN_GLYPHS,
  returnCraftIngredient,
  returnGridToInventory,
  takeCraftIngredient,
  type CraftContext,
  type CraftGrid,
} from "../crafting/recipes";

const DRAG_THRESHOLD = 8;
const PLACEABLE_ITEM_IDS = new Set(
  Object.values(PATTERN_GLYPHS).filter((id) => isCraftItemIngredient(id)),
);

export type CraftingHudHandle = {
  refresh: () => void;
  returnMaterials: () => void;
  destroy: () => void;
};

export const PORTABLE_MOONSHRINE_ID = "portable-moonshrine";
export const OPEN_PORTABLE_SHRINE_EVENT = "ivyward-open-portable-shrine";

export type OpenPortableShrineDetail = {
  tab?: "craft" | "use";
  itemId?: string;
};

let shrineHud: CraftingHudHandle | null = null;
let shrineHost: HTMLElement | null = null;

export function showShrineCraftingHud(options: {
  context: CraftContext;
  onCrafted?: (name: string, count: number) => void;
}): void {
  if (!shrineHost) {
    shrineHost = document.createElement("div");
    shrineHost.id = "shrine-craft-overlay";
    shrineHost.className = "shrine-craft-overlay";
    const parent =
      document.getElementById("game") ?? document.getElementById("app");
    parent?.appendChild(shrineHost);
    shrineHud = mountCraftingHud(shrineHost, {
      context: options.context,
      interactive: !isVisitorMode(),
      onCrafted: options.onCrafted,
    });
  }
  applyShrineCraftOverlayRect(shrineHost);
  shrineHost.hidden = false;
  // ponytail: shrine craft is panel chrome inside the shrine overlay — do not
  // push a separate Esc stack entry (#255); Recipes/etc. still stack normally.
}

export function hideShrineCraftingHud(destroy = false): void {
  if (destroy) {
    shrineHud?.destroy();
    shrineHud = null;
    shrineHost?.remove();
    shrineHost = null;
    return;
  }
  if (shrineHost) {
    shrineHost.hidden = true;
  }
}


type Pickup = {
  materialId: string;
  from: "list" | { row: number; col: number };
};

type HudOptions = {
  context: CraftContext;
  interactive: boolean;
  onCrafted?: (name: string, count: number) => void;
  onInventoryChange?: () => void;
  onClose?: () => void;
  /** When false, omit × (Inventory already has its own close). Default true. */
  showClose?: boolean;
};

function ownedIngredients(): { id: string; name: string; count: number }[] {
  const mats = Object.entries(playerInventory.materials)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, name: getMaterialName(id), count }));
  const items = Object.entries(playerInventory.items)
    .filter(([id, count]) => count > 0 && PLACEABLE_ITEM_IDS.has(id))
    .map(([id, count]) => ({ id, name: getItemName(id), count }));
  return [...mats, ...items].sort((a, b) => a.name.localeCompare(b.name));
}

export function mountCraftingHud(
  parent: HTMLElement,
  options: HudOptions,
): CraftingHudHandle {
  let grid: CraftGrid = emptyGrid();
  let pickup: Pickup | null = null;
  let tapSelect: Pickup | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let dragging = false;
  let suppressPlace = false;
  let ignoreClick = false;
  let lastError: string | null = null;
  let ghost: HTMLElement | null = null;

  const root = document.createElement("div");
  root.className = "crafting-hud";
  parent.appendChild(root);

  const interactive = options.interactive && !isVisitorMode();

  const unregisterStaged = registerStagedCraftingSource(() => {
    const counts: Record<string, number> = {};
    const bump = (id: string) => {
      counts[id] = (counts[id] ?? 0) + 1;
    };
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const id = grid[r][c];
        if (id) {
          bump(id);
        }
      }
    }
    if (pickup) {
      bump(pickup.materialId);
    }
    return counts;
  });

  function inventoryChanged(): void {
    options.onInventoryChange?.();
  }

  function statusMessage(): string {
    if (!interactive) {
      return "Visitors can view, but only the host can craft.";
    }
    if (lastError) {
      return lastError;
    }
    const match = matchGrid(grid, options.context);
    if (match.status === "blocked") {
      return match.message;
    }
    if (match.status === "match") {
      if (!canAddItem(match.recipe.outputItemId, match.recipe.outputCount)) {
        return "You can't hold more of that.";
      }
      const count =
        match.recipe.outputCount > 1 ? ` ×${match.recipe.outputCount}` : "";
      return `${match.recipe.name}${count}`;
    }
    return "Drag materials onto the 4×4, then tap the result.";
  }

  function clearPickup(returnToSource: boolean): void {
    if (!pickup) {
      return;
    }
    if (returnToSource) {
      if (pickup.from === "list") {
        const id = pickup.materialId;
        pickup = null;
        returnCraftIngredient(id);
      } else {
        grid = cloneGrid(grid);
        grid[pickup.from.row][pickup.from.col] = pickup.materialId;
        pickup = null;
      }
    } else {
      pickup = null;
    }
    dragging = false;
    dragStart = null;
    ghost?.remove();
    ghost = null;
    inventoryChanged();
  }

  function takeResult(): void {
    if (!interactive || pickup) {
      return;
    }
    const result = craftFromGrid(grid, options.context, (next) => {
      grid = next;
    });
    if (!result.ok) {
      lastError = result.message;
      render();
      return;
    }
    lastError = null;
    grid = result.grid;
    clearCraftSpotlight();
    options.onCrafted?.(result.recipe.name, result.recipe.outputCount);
    inventoryChanged();
    render();
  }

  function placePickupOnCell(row: number, col: number): void {
    if (!pickup || !interactive) {
      return;
    }
    lastError = null;
    grid = cloneGrid(grid);
    const existing = grid[row][col];
    if (pickup.from !== "list" && pickup.from.row === row && pickup.from.col === col) {
      grid[row][col] = pickup.materialId;
      pickup = null;
      render();
      return;
    }
    if (existing) {
      if (pickup.from === "list") {
        grid[row][col] = pickup.materialId;
        pickup = null;
        returnCraftIngredient(existing);
        inventoryChanged();
        render();
        return;
      }
      grid[pickup.from.row][pickup.from.col] = existing;
    }
    grid[row][col] = pickup.materialId;
    pickup = null;
    inventoryChanged();
    render();
  }

  function returnPickupToList(): void {
    if (!pickup || !interactive) {
      return;
    }
    const id = pickup.materialId;
    pickup = null;
    returnCraftIngredient(id);
    inventoryChanged();
    render();
  }

  function startPickup(next: Pickup, event?: PointerEvent): void {
    if (!interactive) {
      return;
    }
    lastError = null;
    clearPickup(true);
    pickup = next;
    tapSelect = next;
    dragStart = event
      ? { x: event.clientX, y: event.clientY }
      : null;
    dragging = false;
    suppressPlace = Boolean(event);
    if (next.from === "list") {
      if (!takeCraftIngredient(next.materialId)) {
        pickup = null;
        tapSelect = null;
        dragStart = null;
        return;
      }
    } else {
      grid = cloneGrid(grid);
      grid[next.from.row][next.from.col] = null;
    }
    render();
    inventoryChanged();
  }

  function ensureGhost(materialId: string): HTMLElement {
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "crafting-ghost";
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
    }
    ghost.replaceChildren();
    appendMaterialVisual(ghost, materialId, { showName: true });
    return ghost;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pickup || !dragStart) {
      return;
    }
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      dragging = true;
      tapSelect = null;
    }
    if (dragging) {
      const g = ensureGhost(pickup.materialId);
      g.style.left = `${event.clientX + 8}px`;
      g.style.top = `${event.clientY + 8}px`;
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (suppressPlace) {
      suppressPlace = false;
      dragStart = dragging ? dragStart : null;
      if (!dragging) {
        return;
      }
    }
    if (!pickup) {
      dragStart = null;
      dragging = false;
      return;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target?.closest("[data-craft-cell]") as HTMLElement | null;
    const list = target?.closest("[data-craft-list]") as HTMLElement | null;

    if (dragging) {
      if (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        placePickupOnCell(row, col);
      } else if (list) {
        returnPickupToList();
      } else {
        clearPickup(true);
        render();
      }
      ghost?.remove();
      ghost = null;
      dragging = false;
      dragStart = null;
      tapSelect = null;
      return;
    }

    dragStart = null;
  }

  function onRootPointerUp(event: PointerEvent): void {
    if (dragging || suppressPlace) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!pickup || !tapSelect) {
      return;
    }
    const cell = target?.closest("[data-craft-cell]") as HTMLElement | null;
    const list = target?.closest("[data-craft-list]");
    if (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (
        tapSelect.from !== "list" &&
        tapSelect.from.row === row &&
        tapSelect.from.col === col
      ) {
        // Second tap on same cell cancels.
        clearPickup(true);
        tapSelect = null;
        render();
        return;
      }
      placePickupOnCell(row, col);
      tapSelect = null;
      return;
    }
    if (list && tapSelect.from !== "list") {
      returnPickupToList();
      tapSelect = null;
    }
  }

  function render(): void {
    root.replaceChildren();
    const header = document.createElement("div");
    header.className = "crafting-hud-header";
    const recipesBtn = document.createElement("button");
    recipesBtn.type = "button";
    recipesBtn.className = "crafting-recipes-btn";
    recipesBtn.dataset.craftRecipes = "1";
    recipesBtn.textContent = "Recipes";
    recipesBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openRecipes();
    });
    header.append(recipesBtn);
    if (options.showClose !== false) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "crafting-close-btn";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (options.onClose) {
          options.onClose();
        } else {
          hideShrineCraftingHud(false);
        }
      });
      header.append(closeBtn);
    }
    let spotlightBanner: HTMLDivElement | null = null;
    if (isCraftSpotlightActive()) {
      const spotlight = selectSpotlightRecipe();
      if (spotlight) {
        spotlightBanner = document.createElement("div");
        spotlightBanner.className = "crafting-spotlight";
        spotlightBanner.dataset.craftSpotlight = spotlight.id;
        const title = document.createElement("p");
        title.className = "crafting-spotlight-title";
        title.textContent = `Try this first: ${spotlight.name}`;
        const detail = document.createElement("p");
        detail.className = "crafting-spotlight-detail";
        const needs = getRecipeMaterials(spotlight)
          .map((m) => `${getMaterialName(m.materialId)}×${m.count}`)
          .join(" · ");
        detail.textContent = needs;
        const browse = document.createElement("button");
        browse.type = "button";
        browse.className = "crafting-spotlight-recipes";
        browse.textContent = "Full recipe book";
        browse.addEventListener("click", (event) => {
          event.stopPropagation();
          openRecipes();
        });
        spotlightBanner.append(title, detail, browse);
      }
    }

    const layout = document.createElement("div");
    layout.className = "crafting-hud-layout";

    const list = document.createElement("div");
    list.className = "crafting-list";
    list.dataset.craftList = "1";
    const listTitle = document.createElement("h3");
    listTitle.textContent = "Materials";
    list.appendChild(listTitle);
    const mats = ownedIngredients();
    if (mats.length === 0) {
      const empty = document.createElement("p");
      empty.className = "crafting-empty";
      empty.textContent = "No materials in your pack.";
      list.appendChild(empty);
    } else {
      for (const mat of mats) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "crafting-list-row";
        row.disabled = !interactive;
        const main = document.createElement("span");
        main.className = "crafting-list-main";
        appendMaterialVisual(main, mat.id, { showName: true });
        const count = document.createElement("span");
        count.className = "crafting-count";
        count.textContent = `×${mat.count}`;
        row.append(main, count);
        if (interactive) {
          row.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            ignoreClick = true;
            startPickup({ materialId: mat.id, from: "list" }, event);
          });
          row.addEventListener("click", (event) => {
            if (ignoreClick) {
              ignoreClick = false;
              event.preventDefault();
              return;
            }
            if (pickup && pickup.from !== "list") {
              returnPickupToList();
              return;
            }
            startPickup({ materialId: mat.id, from: "list" });
          });
        }
        list.appendChild(row);
      }
    }

    const board = document.createElement("div");
    board.className = "crafting-board";
    const gridEl = document.createElement("div");
    gridEl.className = "crafting-grid";
    gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "crafting-cell";
        cell.dataset.craftCell = "1";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.disabled = !interactive;
        const id = grid[r][c];
        cell.replaceChildren();
        if (id) {
          appendMaterialVisual(cell, id, { showName: true });
        } else {
          cell.removeAttribute("title");
          cell.removeAttribute("aria-label");
        }
        if (interactive) {
          cell.addEventListener("pointerdown", (event) => {
            if (!grid[r][c] || pickup) {
              return;
            }
            event.preventDefault();
            ignoreClick = true;
            startPickup(
              { materialId: grid[r][c]!, from: { row: r, col: c } },
              event,
            );
          });
          cell.addEventListener("click", (event) => {
            if (ignoreClick) {
              ignoreClick = false;
              event.preventDefault();
              return;
            }
            if (pickup) {
              placePickupOnCell(r, c);
              tapSelect = null;
              return;
            }
            if (grid[r][c]) {
              startPickup({
                materialId: grid[r][c]!,
                from: { row: r, col: c },
              });
            }
          });
        }
        gridEl.appendChild(cell);
      }
    }
    board.appendChild(gridEl);

    const result = document.createElement("button");
    result.type = "button";
    result.className = "crafting-result";
    result.dataset.craftResult = "1";
    const match = matchGrid(grid, options.context);
    if (match.status === "match") {
      const atCap = !canAddItem(
        match.recipe.outputItemId,
        match.recipe.outputCount,
      );
      const countLabel =
        match.recipe.outputCount > 1 ? ` ×${match.recipe.outputCount}` : "";
      result.textContent = atCap
        ? "You can't hold more of that."
        : `${getItemName(match.recipe.outputItemId)}${countLabel}`;
      result.disabled = !interactive || atCap;
      if (interactive && !atCap) {
        result.addEventListener("click", () => {
          takeResult();
        });
      }
    } else if (match.status === "blocked") {
      result.textContent = match.message;
      result.disabled = true;
    } else {
      result.textContent = "Result";
      result.disabled = true;
    }
    board.appendChild(result);

    const status = document.createElement("p");
    status.className = "crafting-status";
    status.textContent = statusMessage();

    layout.append(list, board);
    if (spotlightBanner) {
      root.append(header, spotlightBanner, layout, status);
    } else {
      root.append(header, layout, status);
    }
  }

  const moveListener = (event: PointerEvent) => onPointerMove(event);
  const upListener = (event: PointerEvent) => onPointerUp(event);
  window.addEventListener("pointermove", moveListener);
  window.addEventListener("pointerup", upListener);
  root.addEventListener("pointerup", onRootPointerUp);

  render();

  return {
    refresh: () => render(),
    returnMaterials: () => {
      clearPickup(true);
      const leftover = grid;
      grid = emptyGrid();
      returnGridToInventory(leftover);
      render();
      inventoryChanged();
    },
    destroy: () => {
      clearPickup(true);
      const leftover = grid;
      grid = emptyGrid();
      unregisterStaged();
      returnGridToInventory(leftover);
      window.removeEventListener("pointermove", moveListener);
      window.removeEventListener("pointerup", upListener);
      ghost?.remove();
      root.remove();
      notifyWorldChanged();
    },
  };
}
