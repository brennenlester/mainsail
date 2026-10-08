import { describe, expect, it } from "vitest";
import { getIngredientIconSrc } from "../inventory/materials";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import { restoreQuestProgress } from "../story/questProgress";
import { closeRecipes, listRecipePages, openRecipes } from "./recipePanel";

describe("listRecipePages", () => {
  it("lists every craft recipe with a pattern grid and output count", () => {
    const pages = listRecipePages();
    expect(pages.map((p) => p.id)).toContain("brook-tonic");
    expect(pages.map((p) => p.id)).toContain("portable-moonshrine");
    expect(pages.map((p) => p.id)).toContain("sovereign-seal");
    expect(pages.map((p) => p.id)).toContain("sovereign-plate");
    expect(pages.map((p) => p.id)).not.toContain("tide-crown");
    expect(pages.map((p) => p.id)).not.toContain("boulder-crown");
    const tonic = pages.find((p) => p.id === "brook-tonic")!;
    expect(tonic.outputCount).toBe(3);
    expect(tonic.grid).toEqual([
      ["brook-pearl", "folklore-dust"],
      ["brook-pearl", null],
    ]);
    const portable = pages.find((p) => p.id === "portable-moonshrine")!;
    expect(portable.altarOnly).toBe(true);
    expect(portable.uniqueOwned).toBe(true);
    const seal = pages.find((p) => p.id === "sovereign-seal")!;
    expect(seal.name).toBe("Sovereign Seal");
    expect(seal.outputItemId).toBe("sovereign-seal");
    expect(seal.grid[3]).toEqual(["tide-crown", "wild-fiber", "boulder-crown"]);
    const plate = pages.find((p) => p.id === "sovereign-plate")!;
    expect(plate.name).toBe("Sovereign Plate");
    expect(plate.uniqueOwned).toBe(true);
    expect(plate.grid).toEqual([
      ["wild-fiber", "stone", "stone", "wild-fiber"],
      ["stone", "boulder-crown", "tide-crown", "stone"],
      ["wild-fiber", "stone", "stone", "wild-fiber"],
    ]);
  });
});

describe("recipe overlay icons", () => {
  it("renders pattern cells with material icons", () => {
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    openRecipes();
    const pearl = document.querySelector(
      `img.material-icon[src="${getIngredientIconSrc("brook-pearl")}"]`,
    );
    expect(pearl).toBeInstanceOf(HTMLImageElement);
    const filled = pearl?.closest(".recipe-cell-filled");
    expect(filled?.getAttribute("aria-label")).toBe("Brook Pearl");
    expect(filled?.querySelector(".material-icon-name")?.textContent).toBe(
      "Brook Pearl",
    );
    const pearlLabel = filled?.querySelector(".material-icon-name");
    expect(
      pearlLabel?.compareDocumentPosition(pearl!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filled
        ?.querySelector(".material-icon-name")
        ?.classList.contains("visually-hidden"),
    ).toBe(false);
    closeRecipes();
    document.body.replaceChildren();
  });

  it("shows Tide Crown and Boulder Crown on the Sovereign Seal pattern", () => {
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    openRecipes();
    const seal = [...document.querySelectorAll(".recipe-card")].find((card) =>
      card.querySelector("h3")?.textContent?.includes("Sovereign Seal"),
    );
    expect(seal).toBeTruthy();
    expect(seal?.querySelector(".recipe-note")?.textContent).toContain(
      "Tide Crown",
    );
    expect(seal?.querySelector(".recipe-note")?.textContent).toContain(
      "Boulder Crown",
    );
    for (const id of ["tide-crown", "boulder-crown"] as const) {
      const img = seal?.querySelector(
        `img.material-icon[src="${getIngredientIconSrc(id)}"]`,
      );
      expect(img).toBeInstanceOf(HTMLImageElement);
      const cell = img?.closest(".recipe-cell-filled");
      const name = id === "tide-crown" ? "Tide Crown" : "Boulder Crown";
      expect(cell?.getAttribute("aria-label")).toBe(name);
      const label = cell?.querySelector(".material-icon-name");
      expect(label?.textContent).toBe(name);
      expect(label?.classList.contains("visually-hidden")).toBe(false);
    }
    closeRecipes();
    document.body.replaceChildren();
  });
});

describe("recipe book order (#402)", () => {
  function openBook(context: Parameters<typeof openRecipes>[0] = "altar"): HTMLElement {
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    openRecipes(context);
    return document.getElementById("recipes-body") as HTMLElement;
  }

  it("opens on the quest recipe, then craftable-now, with locked recipes collapsed", () => {
    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
    });
    setInventoryFromSnapshot({ wood: 3 }, {});
    const body = openBook();
    const first = [...body.children].map(
      (el) => (el as HTMLElement).dataset.recipeId ?? el.className,
    );
    expect(first.slice(0, 3)).toEqual(["moss-salve", "ember-charm", "wood-cudgel"]);
    expect(
      body.querySelector('[data-recipe-id="moss-salve"] .recipe-badge-quest'),
    ).not.toBeNull();
    expect(
      body.querySelector('[data-recipe-id="wood-cudgel"] .recipe-badge-ready'),
    ).not.toBeNull();
    const locked = body.querySelector("details.recipe-locked") as HTMLDetailsElement;
    expect(locked.open).toBe(false);
    expect(locked.querySelector('[data-recipe-id="sovereign-seal"]')).not.toBeNull();
    // Endgame recipes never lead the book.
    expect(body.querySelector(":scope > [data-recipe-id='sovereign-seal']")).toBeNull();
    closeRecipes();
  });

  it("expands the book when nothing is craftable and no quest recipe applies", () => {
    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "shrine-craft": "complete",
      "first-evolution": "complete",
    });
    setInventoryFromSnapshot({}, {});
    const body = openBook();
    const locked = body.querySelector("details.recipe-locked") as HTMLDetailsElement;
    expect(locked.open).toBe(true);
    closeRecipes();
  });

  it("does not call altar-only recipes ready away from the altar", () => {
    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "shrine-craft": "complete",
      "first-evolution": "complete",
    });
    setInventoryFromSnapshot(
      { "folklore-dust": 1, stone: 5, "brook-pearl": 1, "wild-fiber": 2 },
      {},
    );
    const away = openBook("portable");
    expect(
      away.querySelector(':scope > [data-recipe-id="portable-moonshrine"]'),
    ).toBeNull();
    closeRecipes();
    const atAltar = openBook("altar");
    expect(
      atAltar.querySelector(':scope > [data-recipe-id="portable-moonshrine"]'),
    ).not.toBeNull();
    closeRecipes();
  });
});
