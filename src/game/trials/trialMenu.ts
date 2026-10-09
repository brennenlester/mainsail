import type Phaser from "phaser";
import { isVisitorMode } from "../world/worldSession";
import { eclipseTrialHint, isTrialsUnlocked } from "./trialUnlock";

/**
 * "Eclipse Trial" in the dock's "…" menu (#420), shown once the Gate is
 * open. Boot-bundle light: the trial runtime loads on the first click.
 */

const MENU_BUTTON_ID = "eclipse-trial-btn";

export function syncEclipseTrialMenu(): void {
  const button = document.getElementById(MENU_BUTTON_ID);
  if (button) {
    button.hidden = isVisitorMode() || !isTrialsUnlocked();
    // Flag it as new until the first trial is played (#423).
    button.textContent = eclipseTrialHint() ? "Eclipse Trial (daily) · new" : "Eclipse Trial (daily)";
  }
}

export function initEclipseTrialMenu(game: Phaser.Game): void {
  const menu = document.getElementById("status-overflow-menu");
  if (!menu || document.getElementById(MENU_BUTTON_ID)) {
    return;
  }
  const button = document.createElement("button");
  button.id = MENU_BUTTON_ID;
  button.type = "button";
  button.className = "status-mute-btn";
  button.textContent = "Eclipse Trial (daily)";
  button.hidden = true;
  menu.prepend(button);
  button.addEventListener("click", () => {
    // Any document click closes the menu.
    document.body.click();
    void import("./launchTrial").then(({ launchEclipseTrial, trialBlockReason }) => {
      const reason = trialBlockReason();
      if (reason) {
        window.alert(reason);
        return;
      }
      if (!game.scene.isActive("IsometricScene")) {
        window.alert("Finish what you're doing first, then open the Eclipse Trial.");
        return;
      }
      launchEclipseTrial(game.scene.getScene("IsometricScene"));
    });
  });
  // Re-check the unlock every time the menu opens.
  document.getElementById("status-overflow-btn")?.addEventListener("click", syncEclipseTrialMenu, true);
  syncEclipseTrialMenu();
}
