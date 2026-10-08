import type Phaser from "phaser";
import { playNowUrl } from "../share/cardPreview";
import { openShareSheet } from "../share/shareSheet";
import { formatTrialDay, todayTrialDay, type TrialDay } from "./trialSeed";
import { isTrialActive, trialBlockReason, type TrialMode, type TrialOutcome } from "./trialRun";
import { cardDataFor, renderTrialCardData } from "./trialShareActions";
import { readTrialLink, type TrialBrag } from "./trialShare";
import { TRIAL_SCENE_KEY, TrialScene, type TrialSceneData } from "./TrialScene";

/**
 * Entry points for Eclipse Trials (#420): the Eclipse Gate in the shrine,
 * the dock "…" menu once unlocked, and `?trial=` share links.
 */

export function launchEclipseTrial(
  from: Phaser.Scene,
  options: { day?: TrialDay; mode?: TrialMode; onExit?: (outcome: TrialOutcome | null) => void } = {},
): boolean {
  if (isTrialActive()) {
    return false;
  }
  const manager = from.scene.manager;
  // Registered lazily so Game.ts stays untouched.
  if (!manager.keys[TRIAL_SCENE_KEY]) {
    manager.add(TRIAL_SCENE_KEY, TrialScene, false);
  }
  const data: TrialSceneData = {
    day: options.day ?? todayTrialDay(),
    mode: options.mode ?? "host",
    returnTo: from.scene.key,
    onExit: options.onExit,
  };
  from.scene.launch(TRIAL_SCENE_KEY, data);
  from.scene.bringToTop(TRIAL_SCENE_KEY);
  from.scene.pause();
  return true;
}

export { trialBlockReason };

function whenWorldReady(game: Phaser.Game, run: () => void): void {
  if (game.scene.isActive("IsometricScene")) {
    run();
    return;
  }
  window.setTimeout(() => whenWorldReady(game, run), 60);
}

/**
 * `?trial=` landing: a "Beat my score" preview over the sandboxed game
 * (main.ts never resumes persistence here). Try it runs the same day's
 * gauntlet as practice; Play now opens the visitor's own game.
 */
/** `?trial=` landing from main.ts: the day was checked at boot; the brag is decoded here. */
export function openTrialPreviewFromUrl(game: Phaser.Game, day: TrialDay): void {
  const link = readTrialLink(window.location.search, day);
  openTrialPreview(game, day, link.status === "ok" ? link.brag : null);
}

export function openTrialPreview(game: Phaser.Game, day: TrialDay, brag: TrialBrag | null): void {
  const date = formatTrialDay(day);
  const isToday = day === todayTrialDay();
  const sheet = openShareSheet({
    id: "card-preview",
    title: brag ? `${brag.name} scored ${brag.score.toLocaleString("en-US")}` : `Eclipse Trial · ${date}`,
    subtitle: brag
      ? `Beat my score on ${isToday ? "today's" : `the ${date}`} Eclipse Trial — five battles, same gauntlet for everyone.`
      : "A daily five-battle gauntlet from Ivyward, a folklore creature RPG in your browser.",
    imageAlt: brag ? `${brag.name}'s Eclipse Trial result card` : "",
    note: "Try it is a practice run with your own finished party or a borrowed one. Nothing is saved.",
    game,
    buttons: [
      {
        label: "Try it",
        variant: "primary",
        onClick: () => {
          sheet.close();
          whenWorldReady(game, () => {
            launchEclipseTrial(game.scene.getScene("IsometricScene"), {
              day,
              mode: "sandbox",
              // Back to the preview: Try it again or Play now.
              onExit: () => openTrialPreview(game, day, brag),
            });
          });
        },
      },
      { label: "Play now", onClick: () => window.location.assign(playNowUrl()) },
    ],
  });
  if (!brag) {
    sheet.image.hidden = true;
    return;
  }
  sheet.status.textContent = "Loading the card…";
  whenWorldReady(game, () => {
    void renderTrialCardData(
      game,
      cardDataFor(day, brag, brag.party.map((id) => ({ id, rare: false }))),
    )
      .then((blob) => {
        sheet.showCard(blob);
        sheet.status.textContent = "";
      })
      .catch(() => {
        sheet.status.textContent = "";
        sheet.image.hidden = true;
      });
  });
}

/** Broken `?trial=` link: blocking notice, never boot from it. */
export function showInvalidTrialScreen(): void {
  document.getElementById("playfield")?.setAttribute("hidden", "");
  const sheet = openShareSheet({
    id: "card-preview",
    title: "This trial link is broken",
    subtitle: "The shared Eclipse Trial could not be read, so nothing was loaded. Nothing on this device changed.",
    imageAlt: "",
    buttons: [
      {
        label: "Play Ivyward",
        variant: "primary",
        onClick: () => window.location.assign(playNowUrl()),
      },
    ],
  });
  sheet.image.hidden = true;
}
