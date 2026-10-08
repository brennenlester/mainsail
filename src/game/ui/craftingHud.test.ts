import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { addToParty, setPartyFromSnapshot } from "../creatures/party";
import { restoreQuestProgress } from "../story/questProgress";
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

  it("mounts the shrine craft HUD in the panel slot it is given", () => {
    const app = document.createElement("div");
    app.id = "app";
    const slot = document.createElement("div");
    app.append(slot);
    document.body.appendChild(app);
    showShrineCraftingHud({ context: "altar", parent: slot });
    const overlay = slot.querySelector("#shrine-craft-overlay");
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(overlay?.parentElement).toBe(slot);
    hideShrineCraftingHud(true);
    expect(slot.querySelector("#shrine-craft-overlay")).toBeNull();
  });

  describe("quest-aware suggestion (#402)", () => {
    function seedParty(id: string): void {
      setPartyFromSnapshot([], 1);
      addToParty(id);
    }

    function suggestBanner(host: HTMLElement): HTMLElement | null {
      return host.querySelector("[data-craft-suggest]");
    }

    function mountAltar(onGoFusion?: () => void) {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = mountCraftingHud(host, {
        context: "altar",
        interactive: true,
        onGoFusion,
      });
      return { host, hud };
    }

    it("suggests the quest relic from what is in the pack, not Wood Cudgel", () => {
      seedParty("mossling");
      restoreQuestProgress({ "first-befriend": "complete", "first-spar": "complete" });
      setInventoryFromSnapshot({ "moss-fiber": 2, "folklore-dust": 1 }, {});
      const { host, hud } = mountAltar();
      expect(suggestBanner(host)?.dataset.craftSuggest).toBe("moss-salve");
      expect(host.textContent).not.toContain("Wood Cudgel");
      hud.destroy();
    });

    let now = 1000;
    beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Fill grid lays the recipe on the real grid, then the banner crafts it", () => {
      seedParty("mossling");
      restoreQuestProgress({ "first-befriend": "complete", "first-spar": "complete" });
      setInventoryFromSnapshot({ "moss-fiber": 2, "folklore-dust": 1 }, {});
      const crafted: string[] = [];
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = mountCraftingHud(host, {
        context: "altar",
        interactive: true,
        onCrafted: (name) => crafted.push(name),
      });
      (host.querySelector('[data-craft-action="fill-grid"]') as HTMLButtonElement).click();
      expect(cellAt(host, 0, 0).getAttribute("aria-label")).toBe("Moss Fiber");
      expect(cellAt(host, 0, 1).getAttribute("aria-label")).toBe("Folklore Dust");
      expect(cellAt(host, 1, 0).getAttribute("aria-label")).toBe("Moss Fiber");
      expect(getMaterialCount("moss-fiber")).toBe(0);
      // Real grid: the result slot shows the match and the suggestion still reads "ready".
      const result = host.querySelector("[data-craft-result]") as HTMLButtonElement;
      expect(result.disabled).toBe(false);
      expect(result.classList.contains("is-ready")).toBe(true);
      const craft = host.querySelector('[data-craft-action="craft-now"]') as HTMLButtonElement;
      expect(craft.textContent).toBe("Craft Moss Salve");
      // The swap lock has to lapse before Craft takes a click.
      now += 400;
      craft.click();
      expect(crafted).toEqual(["Moss Salve"]);
      expect(getItemCount("moss-salve")).toBe(1);
      hud.destroy();
    });

    it("a double-click or Enter-Enter on Fill grid does not craft", () => {
      seedParty("mossling");
      restoreQuestProgress({ "first-befriend": "complete", "first-spar": "complete" });
      setInventoryFromSnapshot({ "moss-fiber": 2, "folklore-dust": 1 }, {});
      const crafted: string[] = [];
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = mountCraftingHud(host, {
        context: "altar",
        interactive: true,
        onCrafted: (name) => crafted.push(name),
      });
      (host.querySelector('[data-craft-action="fill-grid"]') as HTMLButtonElement).click();
      const craft = () =>
        host.querySelector('[data-craft-action="craft-now"]') as HTMLButtonElement;
      // Second click lands on the swapped-in Craft button: locked, and detail > 1 ignored.
      craft().click();
      craft().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      expect(crafted).toEqual([]);
      now += 400;
      craft().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      expect(crafted).toEqual([]);
      craft().click();
      expect(crafted).toEqual(["Moss Salve"]);
      hud.destroy();
    });

    it("suggests only the party's own relic; with no Grove starter it offers no Fill grid", () => {
      seedParty("mossling");
      restoreQuestProgress({ "first-befriend": "complete", "first-spar": "complete" });
      setInventoryFromSnapshot({ "ember-ash": 2, "folklore-dust": 1 }, {});
      const first = mountAltar();
      expect(suggestBanner(first.host)?.dataset.craftSuggest).toBe("moss-salve");
      expect(first.host.querySelector('[data-craft-action="fill-grid"]')).toBeNull();
      expect(first.host.querySelector(".crafting-suggest-for")?.textContent).toContain(
        "Mossling",
      );
      first.hud.destroy();

      seedParty("brook-nymph");
      setInventoryFromSnapshot({ "moss-fiber": 2, "folklore-dust": 1 }, {});
      const second = mountAltar();
      expect(second.host.querySelector('[data-craft-action="fill-grid"]')).toBeNull();
      expect(suggestBanner(second.host)?.textContent).toContain("Mossling or Ember Wisp");
      second.hud.destroy();
    });

    it("names what is missing instead of offering Fill grid", () => {
      seedParty("mossling");
      restoreQuestProgress({ "first-befriend": "complete", "first-spar": "complete" });
      setInventoryFromSnapshot({ "moss-fiber": 1 }, {});
      const { host, hud } = mountAltar();
      expect(host.querySelector('[data-craft-action="fill-grid"]')).toBeNull();
      expect(suggestBanner(host)?.textContent).toContain("Still needed");
      expect(suggestBanner(host)?.textContent).toContain("Moss Fiber ×1");
      hud.destroy();
    });

    it("sends the player to Fusion once the relic is in the pack", () => {
      seedParty("mossling");
      restoreQuestProgress({
        "first-befriend": "complete",
        "first-spar": "complete",
        "shrine-craft": "complete",
      });
      setInventoryFromSnapshot({}, { "moss-salve": 1 });
      let opened = 0;
      const { host, hud } = mountAltar(() => {
        opened += 1;
      });
      expect(suggestBanner(host)?.dataset.craftSuggestKind).toBe("fusion");
      (host.querySelector('[data-craft-action="go-fusion"]') as HTMLButtonElement).click();
      expect(opened).toBe(1);
      hud.destroy();
    });
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
    expect(cellLabel?.classList.contains("visually-hidden")).toBe(true);
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
