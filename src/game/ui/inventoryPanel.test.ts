import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canShowInventoryConsumableUse,
  closeInventory,
  listInventoryLines,
  neighborTile,
  openInventory,
  useInventoryConsumable,
  usePortableMoonshrine,
} from "./inventoryPanel";
import { closeRecipes, isRecipesOpen } from "./recipePanel";
import { OPEN_PORTABLE_SHRINE_EVENT } from "./craftingHud";
import { getItemCount, setInventoryFromSnapshot } from "../inventory/playerInventory";
import { setVisitorMode } from "../world/worldSession";

describe("listInventoryLines", () => {
  it("returns empty when nothing is owned", () => {
    expect(listInventoryLines({}, {})).toEqual([]);
  });

  it("lists materials and items with names and counts, sorted by name", () => {
    const lines = listInventoryLines(
      { wood: 3, stone: 0, "folklore-dust": 1 },
      { boat: 1, "brook-tonic": 2 },
    );
    expect(lines).toEqual([
      { kind: "item", id: "boat", name: "Boat", count: 1 },
      { kind: "item", id: "brook-tonic", name: "Brook Tonic", count: 2 },
      { kind: "material", id: "folklore-dust", name: "Folklore Dust", count: 1 },
      { kind: "material", id: "wood", name: "Wood", count: 3 },
    ]);
  });
});

describe("openInventory", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setInventoryFromSnapshot({ wood: 1 }, {});
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
  });

  afterEach(() => {
    closeRecipes();
    closeInventory();
    document.body.replaceChildren();
  });

  it("renders ingredient icons with the name before the image (revealed on hover / focus)", () => {
    setInventoryFromSnapshot({ wood: 1, "folklore-dust": 1 }, { boat: 1 });
    openInventory();
    const woodImg = document.querySelector(
      'img.material-icon[src*="assets/materials/wood.png"]',
    );
    expect(woodImg).toBeInstanceOf(HTMLImageElement);
    const woodRow = woodImg?.closest(".inventory-line-visual");
    const woodLabel = woodRow?.querySelector(".material-icon-name");
    expect(woodLabel?.textContent).toBe("Wood");
    expect(
      woodLabel?.compareDocumentPosition(woodImg!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const boatImg = document.querySelector(
      'img.material-icon[src*="assets/items/boat.png"]',
    );
    expect(boatImg).toBeInstanceOf(HTMLImageElement);
    expect(
      boatImg
        ?.closest(".inventory-line-visual")
        ?.querySelector(".material-icon-name")?.textContent,
    ).toBe("Boat");
  });

  it("lays materials and items out as a grid of labelled, keyboard-navigable tiles", () => {
    setInventoryFromSnapshot({ wood: 3, stone: 2 }, { boat: 1 });
    openInventory();
    expect(document.querySelectorAll("ul.inventory-grid")).toHaveLength(2);
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".inventory-tile"));
    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(
      expect.arrayContaining(["Wood, 3 owned", "Stone, 2 owned", "Boat, 1 owned"]),
    );
    // Roving tabindex: exactly one tab stop.
    expect(tiles.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(tiles[0]?.querySelector(".inventory-count")?.textContent).toMatch(/^×[0-9]+$/);
  });

  it("moves focus between tiles with the arrow keys", () => {
    setInventoryFromSnapshot({ wood: 3, stone: 2, "folklore-dust": 1 }, {});
    openInventory();
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".inventory-tile"));
    tiles[0]!.focus();
    tiles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(tiles[1]);
    expect(tiles[1]!.tabIndex).toBe(0);
    expect(tiles[0]!.tabIndex).toBe(-1);
    tiles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(tiles[2]);
    tiles[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(tiles[0]);
  });

  it("peeks a tile's name on tap", () => {
    setInventoryFromSnapshot({ wood: 3, stone: 2 }, {});
    openInventory();
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(".inventory-tile"));
    tiles[0]!.click();
    expect(tiles[0]!.classList.contains("is-peek")).toBe(true);
    tiles[1]!.click();
    expect(tiles[0]!.classList.contains("is-peek")).toBe(false);
    expect(tiles[1]!.classList.contains("is-peek")).toBe(true);
  });

  it("does not show the craft grid until a Portable Moonshrine is owned", () => {
    openInventory();
    expect(document.querySelector(".crafting-hud")).toBeNull();
    expect(document.getElementById("inventory-recipes")).toBeTruthy();
    closeInventory();
    setInventoryFromSnapshot({ wood: 1 }, { "portable-moonshrine": 1 });
    openInventory();
    expect(document.querySelector(".crafting-hud")).toBeTruthy();
  });

  it("opens Recipes from the inventory header", () => {
    openInventory();
    const recipesBtn = document.getElementById(
      "inventory-recipes",
    ) as HTMLButtonElement;
    recipesBtn.click();
    expect(isRecipesOpen()).toBe(true);
    expect(document.getElementById("recipes-overlay")?.hidden).toBe(false);
  });

  it("shows Use on shrine consumables only when a Portable Moonshrine is owned", () => {
    setInventoryFromSnapshot({ wood: 1 }, { "brook-tonic": 1 });
    openInventory();
    expect(
      document.querySelector('[data-inventory-use="brook-tonic"]'),
    ).toBeNull();
    closeInventory();
    setInventoryFromSnapshot(
      { wood: 1 },
      { "brook-tonic": 1, "portable-moonshrine": 1 },
    );
    openInventory();
    expect(
      document.querySelector('[data-inventory-use="brook-tonic"]'),
    ).toBeTruthy();
    setVisitorMode(true);
    closeInventory();
    openInventory();
    expect(
      document.querySelector('[data-inventory-use="brook-tonic"]'),
    ).toBeNull();
  });
});

describe("neighborTile", () => {
  function tile(rect: Partial<DOMRect>): HTMLElement {
    const node = document.createElement("li");
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 88, height: 88, ...rect }) as DOMRect;
    return node;
  }

  it("uses reading order for left / right and position for up / down", () => {
    // 2 columns x 2 rows.
    const grid = [tile({ left: 0, top: 0 }), tile({ left: 100, top: 0 }), tile({ left: 0, top: 100 }), tile({ left: 100, top: 100 })];
    expect(neighborTile(grid, grid[0]!, "ArrowRight")).toBe(grid[1]);
    expect(neighborTile(grid, grid[0]!, "ArrowLeft")).toBeNull();
    expect(neighborTile(grid, grid[0]!, "ArrowDown")).toBe(grid[2]);
    expect(neighborTile(grid, grid[3]!, "ArrowUp")).toBe(grid[1]);
    expect(neighborTile(grid, grid[2]!, "ArrowDown")).toBeNull();
  });
});

describe("canShowInventoryConsumableUse", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setInventoryFromSnapshot({}, {});
  });

  it("is false without a Portable Moonshrine", () => {
    setInventoryFromSnapshot({}, { "brook-tonic": 1 });
    expect(canShowInventoryConsumableUse("brook-tonic")).toBe(false);
  });

  it("is true for shrine consumables when the host owns a Portable Moonshrine", () => {
    setInventoryFromSnapshot(
      {},
      {
        "portable-moonshrine": 1,
        "brook-tonic": 1,
        "moonwake-draught": 1,
        "brook-crystal": 2,
      },
    );
    expect(canShowInventoryConsumableUse("brook-tonic")).toBe(true);
    expect(canShowInventoryConsumableUse("moonwake-draught")).toBe(true);
    expect(canShowInventoryConsumableUse("brook-crystal")).toBe(true);
    expect(canShowInventoryConsumableUse("boat")).toBe(false);
  });

  it("is false for visitors", () => {
    setInventoryFromSnapshot(
      {},
      { "portable-moonshrine": 1, "brook-tonic": 1 },
    );
    setVisitorMode(true);
    expect(canShowInventoryConsumableUse("brook-tonic")).toBe(false);
  });
});

describe("usePortableMoonshrine", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setInventoryFromSnapshot({}, { "portable-moonshrine": 1 });
  });

  it("does not consume the portable Moonshrine", () => {
    const events: Event[] = [];
    const onOpen = (event: Event) => events.push(event);
    window.addEventListener(OPEN_PORTABLE_SHRINE_EVENT, onOpen);
    usePortableMoonshrine();
    window.removeEventListener(OPEN_PORTABLE_SHRINE_EVENT, onOpen);
    expect(getItemCount("portable-moonshrine")).toBe(1);
    expect(events).toHaveLength(1);
  });

  it("opens the portable shrine Use tab for a consumable without consuming the shrine", () => {
    setInventoryFromSnapshot(
      {},
      { "portable-moonshrine": 1, "brook-tonic": 2 },
    );
    const details: unknown[] = [];
    const onOpen = (event: Event) => {
      details.push((event as CustomEvent).detail);
    };
    window.addEventListener(OPEN_PORTABLE_SHRINE_EVENT, onOpen);
    useInventoryConsumable("brook-tonic");
    window.removeEventListener(OPEN_PORTABLE_SHRINE_EVENT, onOpen);
    expect(getItemCount("portable-moonshrine")).toBe(1);
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(details).toEqual([{ tab: "use", itemId: "brook-tonic" }]);
  });
});
