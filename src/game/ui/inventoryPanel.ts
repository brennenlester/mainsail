import "./menuPanels.css";
import { appendMaterialVisual } from "./materialIcon";
import {
  getItemName,
  getMaterialName,
} from "../inventory/materials";
import {
  getItemCount,
  playerInventory,
  SOVEREIGN_PLATE_ID,
} from "../inventory/playerInventory";
import { isVisitorMode } from "../world/worldSession";
import {
  isSovereignPlateActive,
  toggleSovereignPlateActive,
} from "../world/worldState";
import {
  mountCraftingHud,
  OPEN_PORTABLE_SHRINE_EVENT,
  PORTABLE_MOONSHRINE_ID,
  type CraftingHudHandle,
  type OpenPortableShrineDetail,
} from "./craftingHud";
import { isConsumableItem } from "../shrine/consumables";
import { openRecipes } from "./recipePanel";
import { popOverlay, pushOverlay } from "./overlayStack";

export type InventoryLine = {
  kind: "material" | "item";
  id: string;
  name: string;
  count: number;
};

/** Pure listing of owned materials and items (count > 0), sorted by name. */
export function listInventoryLines(
  materials: Record<string, number> = playerInventory.materials,
  items: Record<string, number> = playerInventory.items,
): InventoryLine[] {
  const lines: InventoryLine[] = [];
  for (const [id, count] of Object.entries(materials)) {
    if (count > 0) {
      lines.push({
        kind: "material",
        id,
        name: getMaterialName(id),
        count,
      });
    }
  }
  for (const [id, count] of Object.entries(items)) {
    if (count > 0) {
      lines.push({
        kind: "item",
        id,
        name: getItemName(id),
        count,
      });
    }
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name));
}

let inventoryOpen = false;
let previouslyFocused: HTMLElement | null = null;
let inventoryCraftHud: CraftingHudHandle | null = null;

const TILE_SELECTOR = ".inventory-tile";
/** How long a long-press / tap keeps a tile's name showing. */
const PEEK_LONG_PRESS_MS = 450;
const PEEK_SHOW_MS = 2500;

function inventoryTiles(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`#inventory-body ${TILE_SELECTOR}`),
  );
}

/** Roving tabindex: one tile is a tab stop, arrows move between tiles. */
function setActiveTile(tile: HTMLElement): void {
  for (const other of inventoryTiles()) {
    other.tabIndex = other === tile ? 0 : -1;
  }
}

/** Next tile for an arrow key by on-screen position (DOM order for left / right). */
export function neighborTile(
  tiles: readonly HTMLElement[],
  from: HTMLElement,
  key: string,
): HTMLElement | null {
  const index = tiles.indexOf(from);
  if (index < 0) {
    return null;
  }
  if (key === "Home") {
    return tiles[0] ?? null;
  }
  if (key === "End") {
    return tiles[tiles.length - 1] ?? null;
  }
  if (key === "ArrowLeft") {
    return tiles[index - 1] ?? null;
  }
  if (key === "ArrowRight") {
    return tiles[index + 1] ?? null;
  }
  const down = key === "ArrowDown";
  if (!down && key !== "ArrowUp") {
    return null;
  }
  const cur = from.getBoundingClientRect();
  const curX = cur.left + cur.width / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const tile of tiles) {
    if (tile === from) {
      continue;
    }
    const r = tile.getBoundingClientRect();
    const dy = down ? r.top - cur.top : cur.top - r.top;
    // Only tiles on a later (or earlier) row; the nearest row wins, then the nearest column.
    if (dy < cur.height / 2) {
      continue;
    }
    const score = dy * 1000 + Math.abs(r.left + r.width / 2 - curX);
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

function peekTile(tile: HTMLElement): void {
  for (const other of inventoryTiles()) {
    if (other !== tile) {
      other.classList.remove("is-peek");
    }
  }
  tile.classList.add("is-peek");
  window.setTimeout(() => tile.classList.remove("is-peek"), PEEK_SHOW_MS);
}

/** Name on hover / focus (CSS) and on tap or long-press (touch). */
function bindTile(tile: HTMLElement): void {
  let timer: number | undefined;
  const clear = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
  tile.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }
    clear();
    timer = window.setTimeout(() => peekTile(tile), PEEK_LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    tile.addEventListener(type, clear);
  }
  // A long-press must not open the browser's image / context menu.
  tile.addEventListener("contextmenu", (event) => event.preventDefault());
  tile.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("button")) {
      peekTile(tile);
    }
  });
  tile.addEventListener("focus", () => setActiveTile(tile));
}

function onInventoryKeyDown(event: KeyboardEvent): void {
  if (!inventoryOpen) {
    return;
  }
  // Esc is owned by overlayStack (top-most only). Still swallow other keys.
  if (event.key === "Escape") {
    return;
  }
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>(TILE_SELECTOR) : null;
  if (target && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(event.key)) {
    const next = neighborTile(inventoryTiles(), target, event.key);
    event.preventDefault();
    if (next) {
      setActiveTile(next);
      next.focus();
    }
  }
  // Capture-phase: block Phaser / world hotkeys while the modal is open.
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

function ensureInventoryRoot(): HTMLElement {
  let root = document.getElementById("inventory-overlay");
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "inventory-overlay";
  root.className = "inventory-overlay menu-root inventory-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="menu-panel inventory-panel" role="dialog" aria-labelledby="inventory-title">
      <div class="menu-head">
        <h2 id="inventory-title" class="menu-title">Inventory</h2>
        <div class="menu-head-actions">
          <button type="button" id="inventory-recipes" class="menu-btn">Recipes</button>
          <button type="button" id="inventory-close" class="menu-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="menu-body">
        <p id="inventory-intro" class="menu-intro"></p>
        <div id="inventory-craft" class="inventory-craft" hidden></div>
        <div id="inventory-body" class="inventory-body"></div>
        <p id="inventory-hint" class="menu-hint"></p>
      </div>
    </div>
  `;
  document.getElementById("app")?.appendChild(root);
  root.querySelector("#inventory-recipes")?.addEventListener("click", () => {
    openRecipes();
  });
  root.querySelector("#inventory-close")?.addEventListener("click", closeInventory);
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      closeInventory();
    }
  });
  return root;
}

function renderInventoryBody(): void {
  const body = document.getElementById("inventory-body");
  const hint = document.getElementById("inventory-hint");
  if (!body) {
    return;
  }
  body.replaceChildren();
  const lines = listInventoryLines();
  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "menu-empty inventory-empty";
    empty.textContent =
      "Nothing in your packs yet — gather, spar, or craft to fill them.";
    body.appendChild(empty);
  } else {
    const materials = lines.filter((l) => l.kind === "material");
    const items = lines.filter((l) => l.kind === "item");
    const appendSection = (title: string, sectionLines: InventoryLine[]) => {
      if (sectionLines.length === 0) {
        return;
      }
      const section = document.createElement("section");
      section.className = "inventory-section";
      const heading = document.createElement("h3");
      heading.textContent = title;
      section.appendChild(heading);
      const list = document.createElement("ul");
      list.className = "inventory-grid";
      for (const line of sectionLines) {
        const li = document.createElement("li");
        li.className = "inventory-tile";
        li.tabIndex = -1;
        li.setAttribute("aria-label", `${line.name}, ${line.count} owned`);
        li.dataset.itemId = line.id;
        const visual = document.createElement("div");
        visual.className = "inventory-line-visual";
        appendMaterialVisual(visual, line.id, { showName: true });
        const count = document.createElement("span");
        count.className = "inventory-count";
        count.textContent = `×${line.count}`;
        li.append(visual, count);
        bindTile(li);
        if (
          line.kind === "item" &&
          line.id === PORTABLE_MOONSHRINE_ID &&
          !isVisitorMode()
        ) {
          const useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "inventory-use";
          useBtn.dataset.inventoryUse = line.id;
          useBtn.textContent = "Use";
          useBtn.setAttribute("aria-label", `Use ${line.name}`);
          useBtn.addEventListener("click", () => {
            usePortableMoonshrine();
          });
          li.appendChild(useBtn);
        } else if (
          line.kind === "item" &&
          line.id === SOVEREIGN_PLATE_ID &&
          !isVisitorMode()
        ) {
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = "inventory-use";
          toggleBtn.dataset.inventoryUse = line.id;
          toggleBtn.textContent = isSovereignPlateActive() ? "On" : "Off";
          toggleBtn.setAttribute("aria-label", `${line.name} bonus`);
          toggleBtn.setAttribute(
            "aria-pressed",
            isSovereignPlateActive() ? "true" : "false",
          );
          toggleBtn.addEventListener("click", () => {
            toggleSovereignPlateActive();
            renderInventoryBody();
          });
          li.appendChild(toggleBtn);
        } else if (canShowInventoryConsumableUse(line.id)) {
          const useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "inventory-use";
          useBtn.dataset.inventoryUse = line.id;
          useBtn.textContent = "Use";
          useBtn.setAttribute("aria-label", `Use ${line.name}`);
          useBtn.addEventListener("click", () => {
            useInventoryConsumable(line.id);
          });
          li.appendChild(useBtn);
        }
        list.appendChild(li);
      }
      section.appendChild(list);
      body.appendChild(section);
    };
    appendSection("Materials", materials);
    appendSection("Items", items);
    // Roving tabindex: the first tile is the tab stop.
    const first = inventoryTiles()[0];
    if (first) {
      first.tabIndex = 0;
    }
  }
  if (hint) {
    hint.textContent = isVisitorMode()
      ? "Visitor mode — viewing the host inventory."
      : "";
  }
}

function ownsPortableMoonshrine(): boolean {
  return getItemCount(PORTABLE_MOONSHRINE_ID) >= 1;
}

export function canShowInventoryConsumableUse(itemId: string): boolean {
  return (
    !isVisitorMode() &&
    ownsPortableMoonshrine() &&
    isConsumableItem(itemId)
  );
}

function syncInventoryCraftHud(root: HTMLElement): void {
  const craftHost = root.querySelector("#inventory-craft");
  const intro = root.querySelector("#inventory-intro");
  if (!(craftHost instanceof HTMLElement)) {
    return;
  }
  const showGrid = ownsPortableMoonshrine();
  if (intro) {
    intro.textContent = showGrid
      ? "Drag materials onto the 4×4 to craft. Use tonics here, or Use the Portable Moonshrine for Craft and Use away from the altar."
      : "Materials and items in your pack. Craft at Moon Shrine. Recipes shows the patterns.";
  }
  if (!showGrid) {
    inventoryCraftHud?.destroy();
    inventoryCraftHud = null;
    craftHost.hidden = true;
    craftHost.replaceChildren();
    return;
  }
  craftHost.hidden = false;
  if (!inventoryCraftHud) {
    inventoryCraftHud = mountCraftingHud(craftHost, {
      context: "inventory",
      interactive: !isVisitorMode(),
      onCrafted: () => renderInventoryBody(),
      onInventoryChange: () => renderInventoryBody(),
      showClose: false,
    });
  } else {
    inventoryCraftHud.refresh();
  }
}

export function openInventory(): void {
  const root = ensureInventoryRoot();
  renderInventoryBody();
  syncInventoryCraftHud(root);
  previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.hidden = false;
  inventoryOpen = true;
  setBackgroundInert(true);
  pushOverlay("inventory", closeInventory);
  window.addEventListener("keydown", onInventoryKeyDown, true);
  const closeBtn = root.querySelector(
    "#inventory-close",
  ) as HTMLButtonElement | null;
  closeBtn?.focus();
}

export function closeInventory(): void {
  popOverlay("inventory");
  inventoryCraftHud?.destroy();
  inventoryCraftHud = null;
  const root = document.getElementById("inventory-overlay");
  if (root) {
    root.hidden = true;
  }
  inventoryOpen = false;
  setBackgroundInert(false);
  window.removeEventListener("keydown", onInventoryKeyDown, true);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

export function toggleInventory(): void {
  if (inventoryOpen) {
    closeInventory();
  } else {
    openInventory();
  }
}

export function isInventoryOpen(): boolean {
  return inventoryOpen;
}

/** Opens the portable shrine UI without consuming the item. */
export function usePortableMoonshrine(
  detail: OpenPortableShrineDetail = {},
): void {
  if (isVisitorMode() || !ownsPortableMoonshrine()) {
    return;
  }
  closeInventory();
  window.dispatchEvent(
    new CustomEvent<OpenPortableShrineDetail>(OPEN_PORTABLE_SHRINE_EVENT, {
      detail,
    }),
  );
}

export function useInventoryConsumable(itemId: string): void {
  if (!canShowInventoryConsumableUse(itemId)) {
    return;
  }
  usePortableMoonshrine({ tab: "use", itemId });
}
