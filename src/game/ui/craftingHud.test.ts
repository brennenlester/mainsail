import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hideShrineCraftingHud,
  mountCraftingHud,
  showShrineCraftingHud,
} from "./craftingHud";
import { closeRecipes, isRecipesOpen } from "./recipePanel";
import {
  getOverlayStackIds,
  resetOverlayStack,
} from "./overlayStack";
import { resetStagedCraftingSourcesForTest } from "../crafting/stagedMaterials";
import { getMaterialIconSrc } from "../inventory/materials";
import {
  getItemCount,
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { setVisitorMode } from "../world/worldSession";
import { exportWorldSnapshot } from "../world/worldSnapshot";
import { isHostPersistSuspended } from "../world/worldSaveSchedule";

function mountHud() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const hud = mountCraftingHud(host, {
    context: "inventory",
    interactive: true,
  });
  return { host, hud };
}

function listRow(host: HTMLElement, name: string): HTMLButtonElement {
  const rows = [...host.querySelectorAll(".crafting-list-row")];
  const row = rows.find((el) => el.textContent?.includes(name));
  if (!(row instanceof HTMLButtonElement)) {
    throw new Error(`missing list row ${name}`);
  }
  return row;
}

function cellAt(host: HTMLElement, row: number, col: number): HTMLButtonElement {
  const cell = host.querySelector(
    `[data-craft-cell][data-row="${row}"][data-col="${col}"]`,
  );
  if (!(cell instanceof HTMLButtonElement)) {
    throw new Error(`missing cell ${row},${col}`);
  }
  return cell;
}

describe("crafting HUD", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setInventoryFromSnapshot({ wood: 3 }, {});
    resetStagedCraftingSourcesForTest();
    document.body.replaceChildren();
  });

  afterEach(() => {
    closeRecipes();
    hideShrineCraftingHud(true);
    resetStagedCraftingSourcesForTest();
    resetOverlayStack();
    document.body.replaceChildren();
  });

  it("returns staged materials when the HUD is destroyed", () => {
    const { host, hud } = mountHud();
    const row = host.querySelector(".crafting-list-row") as HTMLButtonElement;
    const cell = host.querySelector("[data-craft-cell]") as HTMLButtonElement;
    row.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 }),
    );
    cell.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, clientX: 2, clientY: 2 }),
    );
    hud.destroy();
    expect(getMaterialCount("wood")).toBe(3);
  });

  it("lists exclusive crowns so they can be placed on the seal recipe", () => {
    setInventoryFromSnapshot({}, { "tide-crown": 1, "boulder-crown": 1 });
    const { host, hud } = mountHud();
    listRow(host, "Tide Crown").click();
    cellAt(host, 0, 0).click();
    expect(cellAt(host, 0, 0).getAttribute("aria-label")).toBe("Tide Crown");
    expect(getItemCount("tide-crown")).toBe(0);
    hud.destroy();
    expect(getItemCount("tide-crown")).toBe(1);
    expect(getItemCount("boulder-crown")).toBe(1);
  });

  it("places from the list and crafts with click (keyboard path)", () => {
    const { host, hud } = mountHud();
    for (const row of [0, 1, 2]) {
      listRow(host, "Wood").click();
      cellAt(host, row, 0).click();
    }
    const result = host.querySelector("[data-craft-result]") as HTMLButtonElement;
    expect(result.disabled).toBe(false);
    expect(result.textContent).toContain("Wood Cudgel");
    result.click();
    expect(getItemCount("wood-cudgel")).toBe(1);
    expect(getMaterialCount("wood")).toBe(0);
    expect(isHostPersistSuspended()).toBe(false);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 1, y: 1 }).items["wood-cudgel"],
    ).toBe(1);
    hud.destroy();
  });

  it("swaps two occupied cells on tap when already holding a material", () => {
    setInventoryFromSnapshot({ wood: 1, stone: 1 }, {});
    const { host, hud } = mountHud();
    listRow(host, "Wood").click();
    cellAt(host, 0, 0).click();
    listRow(host, "Stone").click();
    cellAt(host, 0, 1).click();
    cellAt(host, 0, 0).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 }),
    );
    cellAt(host, 0, 0).click();
    cellAt(host, 0, 1).dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 2, clientY: 2 }),
    );
    cellAt(host, 0, 1).click();
    expect(cellAt(host, 0, 0).getAttribute("aria-label")).toBe("Stone");
    expect(cellAt(host, 0, 1).getAttribute("aria-label")).toBe("Wood");
    hud.destroy();
  });

  it("disables the result and shows a hold-cap error", () => {
    setInventoryFromSnapshot({ "brook-pearl": 1 }, { "brook-crystal": 20 });
    const { host, hud } = mountHud();
    listRow(host, "Brook Pearl").click();
    cellAt(host, 0, 0).click();
    const result = host.querySelector("[data-craft-result]") as HTMLButtonElement;
    const status = host.querySelector(".crafting-status");
    expect(result.disabled).toBe(true);
    expect(result.textContent).toBe("You can't hold more of that.");
    expect(status?.textContent).toBe("You can't hold more of that.");
    result.click();
    expect(getItemCount("brook-crystal")).toBe(20);
    hud.destroy();
  });

  it("exports staged grid materials in world snapshots", () => {
    const { host, hud } = mountHud();
    listRow(host, "Wood").click();
    cellAt(host, 0, 0).click();
    expect(getMaterialCount("wood")).toBe(2);
    const snapshot = exportWorldSnapshot({ zoneId: "grove", x: 1, y: 1 });
    expect(snapshot.materials.wood).toBe(3);
    hud.destroy();
  });

  it("keeps persist live while the shrine craft HUD is open or hidden", () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    setInventoryFromSnapshot({ wood: 1 }, {});
    showShrineCraftingHud({ context: "altar" });
    expect(isHostPersistSuspended()).toBe(false);
    const host = document.getElementById("shrine-craft-overlay");
    if (!host) {
      throw new Error("missing shrine craft overlay");
    }
    listRow(host, "Wood").click();
    cellAt(host, 0, 0).click();
    expect(getMaterialCount("wood")).toBe(0);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 1, y: 1 }).materials.wood,
    ).toBe(1);
    hideShrineCraftingHud(false);
    expect(isHostPersistSuspended()).toBe(false);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 1, y: 1 }).materials.wood,
    ).toBe(1);
    showShrineCraftingHud({ context: "altar" });
    expect(isHostPersistSuspended()).toBe(false);
    hideShrineCraftingHud(true);
    expect(getMaterialCount("wood")).toBe(1);
  });

  it("mounts the shrine overlay on the game board and frames it", () => {
    const app = document.createElement("div");
    app.id = "app";
    const game = document.createElement("div");
    game.id = "game";
    app.append(game);
    document.body.appendChild(app);
    showShrineCraftingHud({ context: "altar" });
    const overlay = game.querySelector("#shrine-craft-overlay");
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.parentElement).toBe(game);
    expect((overlay as HTMLElement).style.left).toMatch(/%$/);
    expect((overlay as HTMLElement).style.top).toMatch(/%$/);
    expect((overlay as HTMLElement).style.width).toMatch(/%$/);
    expect((overlay as HTMLElement).style.height).toMatch(/%$/);
    hideShrineCraftingHud(true);
  });

  it("does not push craft-hud onto the Esc overlay stack (#255)", () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    showShrineCraftingHud({ context: "altar" });
    expect(getOverlayStackIds()).toEqual([]);
    hideShrineCraftingHud(false);
    expect(getOverlayStackIds()).toEqual([]);
    hideShrineCraftingHud(true);
  });

  it("shows craft-material icons in the list and grid", () => {
    const { host, hud } = mountHud();
    const row = listRow(host, "Wood");
    const rowLabel = row.querySelector(".material-icon-name");
    const rowImg = row.querySelector("img.material-icon");
    expect(
      rowLabel?.compareDocumentPosition(rowImg!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(rowImg?.getAttribute("src")).toBe(getMaterialIconSrc("wood"));
    row.click();
    cellAt(host, 0, 0).click();
    const cell = cellAt(host, 0, 0);
    const cellLabel = cell.querySelector(".material-icon-name");
    const cellImg = cell.querySelector("img.material-icon");
    expect(
      cellLabel?.compareDocumentPosition(cellImg!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(cellImg?.getAttribute("src")).toBe(getMaterialIconSrc("wood"));
    expect(cellLabel?.textContent).toBe("Wood");
    expect(cellLabel?.classList.contains("visually-hidden")).toBe(false);
    expect(cell.getAttribute("aria-label")).toBe("Wood");
    hud.destroy();
  });

  it("clears a grid cell when the material is picked back up", () => {
    const { host, hud } = mountHud();
    listRow(host, "Wood").click();
    cellAt(host, 0, 0).click();
    expect(cellAt(host, 0, 0).querySelector("img.material-icon")).not.toBeNull();
    cellAt(host, 0, 0).click();
    const empty = cellAt(host, 0, 0);
    expect(empty.querySelector("img.material-icon")).toBeNull();
    expect(empty.getAttribute("aria-label")).toBeNull();
    hud.destroy();
  });

  it("opens Recipes from the craft HUD", () => {
    const { host, hud } = mountHud();
    const recipesBtn = host.querySelector(
      "[data-craft-recipes]",
    ) as HTMLButtonElement;
    expect(recipesBtn.textContent).toBe("Recipes");
    recipesBtn.click();
    expect(isRecipesOpen()).toBe(true);
    hud.destroy();
  });
});
