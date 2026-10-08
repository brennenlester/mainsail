import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shrineTabs } from "../shrine/shrineTabs";
import { mountShrinePanel, type ShrinePanelHandle } from "./shrinePanel";

function tabLabels(): string[] {
  return [...document.querySelectorAll(".shrine-tab")].map(
    (t) => t.textContent ?? "",
  );
}

describe("mountShrinePanel", () => {
  let panel: ShrinePanelHandle;
  const onSelectTab = vi.fn();
  const onRecipes = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    document.body.replaceChildren();
    const game = document.createElement("div");
    game.id = "game";
    document.body.appendChild(game);
    onSelectTab.mockReset();
    onRecipes.mockReset();
    onClose.mockReset();
    panel = mountShrinePanel({ onSelectTab, onRecipes, onClose });
  });

  afterEach(() => {
    panel.destroy();
  });

  it("mounts a labelled dialog in the stage and flags the body while open", () => {
    const game = document.getElementById("game");
    expect(game?.querySelector(".shrine-panel")?.getAttribute("role")).toBe(
      "dialog",
    );
    expect(document.body.classList.contains("shrine-active")).toBe(true);
    panel.destroy();
    expect(document.querySelector(".shrine-root")).toBeNull();
    expect(document.body.classList.contains("shrine-active")).toBe(false);
  });

  it("reveals the Fusion tab live, pulses it and moves focus there", () => {
    panel.setTabs(shrineTabs("altar", false), "craft");
    expect(tabLabels()).toEqual(["Craft", "Use"]);
    // Focus was on Craft; crafting the relic discloses Fusion.
    panel.focusTab("craft");

    panel.setTabs(shrineTabs("altar", true), "craft", ["fusion"]);
    expect(tabLabels()).toEqual(["Craft", "Use", "Fusion"]);
    const fusion = document.querySelector<HTMLButtonElement>(
      '[data-shrine-tab="fusion"]',
    );
    expect(fusion?.classList.contains("is-new")).toBe(true);
    expect(document.activeElement).toBe(fusion);
  });

  it("does not steal focus or pulse when tabs are unchanged", () => {
    panel.setTabs(shrineTabs("altar", true), "craft");
    panel.focusTab("use");
    panel.setTabs(shrineTabs("altar", true), "craft");
    expect(document.activeElement?.id).toBe("shrine-tab-use");
    expect(document.querySelector(".shrine-tab.is-new")).toBeNull();
  });

  it("marks the active tab and selects tabs by click and arrow keys", () => {
    panel.setTabs(shrineTabs("altar", true), "craft");
    const craft = document.getElementById("shrine-tab-craft")!;
    expect(craft.getAttribute("aria-selected")).toBe("true");
    expect(
      document.getElementById("shrine-tab-use")!.getAttribute("aria-selected"),
    ).toBe("false");

    document.getElementById("shrine-tab-use")!.click();
    expect(onSelectTab).toHaveBeenLastCalledWith("use");

    craft.focus();
    craft.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(onSelectTab).toHaveBeenLastCalledWith("use");
    craft.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(onSelectTab).toHaveBeenLastCalledWith("fusion");
  });

  it("clears the new-tab pulse once the tab is visited", () => {
    panel.setTabs(shrineTabs("altar", true), "craft", ["fusion"]);
    document.getElementById("shrine-tab-fusion")!.click();
    expect(
      document.getElementById("shrine-tab-fusion")!.classList.contains("is-new"),
    ).toBe(false);
  });

  it("leaves with Esc from inside the panel without leaking keys to the world", () => {
    panel.setTabs(shrineTabs("altar", false), "craft");
    const leaked = vi.fn();
    window.addEventListener("keydown", leaked);
    document
      .getElementById("shrine-tab-craft")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(leaked).not.toHaveBeenCalled();
    window.removeEventListener("keydown", leaked);
  });

  it("keeps a Recipes button even with no tabs (visitors)", () => {
    panel.setTabs([], "craft");
    const recipes = document.querySelector<HTMLButtonElement>(
      "[data-shrine-recipes]",
    );
    expect(recipes).not.toBeNull();
    recipes!.click();
    expect(onRecipes).toHaveBeenCalledTimes(1);
  });

  it("announces status messages politely", () => {
    panel.setStatus("Crafted Moss Salve!");
    const status = document.querySelector(".shrine-status");
    expect(status?.textContent).toBe("Crafted Moss Salve!");
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });
});
