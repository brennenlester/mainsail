import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";

let codexUnlocked = false;
let recipesUnlocked = false;

export function isCodexHudUnlocked(): boolean {
  return codexUnlocked;
}

export function isRecipesHudUnlocked(): boolean {
  return recipesUnlocked;
}

export function unlockCodexHud(): void {
  if (codexUnlocked) {
    return;
  }
  codexUnlocked = true;
  notifyWorldChanged();
  refreshHudChromeButtons();
}

export function unlockRecipesHud(): void {
  if (recipesUnlocked) {
    return;
  }
  recipesUnlocked = true;
  notifyWorldChanged();
  refreshHudChromeButtons();
}

export function getHudChromeSnapshot(): {
  hudCodexUnlocked: boolean;
  hudRecipesUnlocked: boolean;
} {
  return {
    hudCodexUnlocked: codexUnlocked,
    hudRecipesUnlocked: recipesUnlocked,
  };
}

/**
 * Restore flags from save. Older saves: unlock Codex if any discovery/party
 * species exist; unlock Recipes if any material is owned.
 */
export function setHudChromeFromSnapshot(options: {
  hudCodexUnlocked?: boolean;
  hudRecipesUnlocked?: boolean;
  discoveredCreatures: readonly string[];
  partyCount: number;
  materials: Record<string, number>;
}): void {
  const legacyCodex =
    options.discoveredCreatures.length > 0 || options.partyCount > 0;
  const legacyRecipes = Object.values(options.materials).some((n) => n > 0);
  // Explicit false must win; legacy only fills absent (older) saves.
  codexUnlocked = options.hudCodexUnlocked ?? legacyCodex;
  recipesUnlocked = options.hudRecipesUnlocked ?? legacyRecipes;
}

export function resetHudChrome(): void {
  codexUnlocked = false;
  recipesUnlocked = false;
}

/** Sync DOM visibility for Recipes / Codex; Reset stays in overflow. */
export function refreshHudChromeButtons(): void {
  const recipesBtn = document.getElementById("recipes-btn");
  const codexBtn = document.getElementById("codex-btn");
  const overflowBtn = document.getElementById("status-overflow-btn");
  const overflowMenu = document.getElementById("status-overflow-menu");

  if (recipesBtn) {
    recipesBtn.hidden = !recipesUnlocked;
  }
  if (codexBtn) {
    codexBtn.hidden = !codexUnlocked;
  }
  // The menu also carries Mute / Volume (#391), so it stays for visitors;
  // only the destructive Reset hides.
  if (overflowBtn) {
    overflowBtn.hidden = false;
  }
  const resetBtn = document.getElementById("reset-game-btn");
  if (resetBtn) {
    resetBtn.hidden = isVisitorMode();
  }
  if (overflowMenu && overflowMenu.dataset.open !== "1") {
    overflowMenu.hidden = true;
  }
}
