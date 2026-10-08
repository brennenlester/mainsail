import type Phaser from "phaser";
import { runGhostChallenge, type ChallengeResult } from "./challenge";
import { renderCardBlob } from "./shareActions";
import type { ShareSnapshot } from "./shareCode";
import { openShareSheet } from "./shareSheet";

/**
 * Read-only `?card=` landing (#368). The game boots behind this overlay in a
 * sandbox (see main.ts) only so the card can use real sprites and Challenge
 * can reuse BattleScene; nothing here writes the recipient's save.
 */

/** Same path, no query: a new player gets a fresh game, a returning one keeps theirs. */
export function playNowUrl(href = window.location.href): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function whenTexturesReady(game: Phaser.Game, run: () => void): void {
  if (game.scene.isActive("IsometricScene")) {
    run();
    return;
  }
  window.setTimeout(() => whenTexturesReady(game, run), 60);
}

export function openCardPreview(game: Phaser.Game, snapshot: ShareSnapshot): void {
  const sheet = openShareSheet({
    id: "card-preview",
    title: `${snapshot.name}'s companions`,
    subtitle: "shared a party from Ivyward — a folklore creature RPG in your browser.",
    imageAlt: `${snapshot.name}'s Companion Card`,
    note: "Challenge is a practice spar against a ghost of this party. Nothing is saved.",
    buttons: [
      {
        label: "Play now",
        variant: "primary",
        onClick: () => window.location.assign(playNowUrl()),
      },
      {
        label: "Challenge",
        onClick: () => {
          sheet.close();
          runGhostChallenge(game, snapshot, (result) =>
            openChallengeResult(game, snapshot, result),
          );
        },
      },
    ],
  });
  sheet.status.textContent = "Loading the card…";
  whenTexturesReady(game, () => {
    void renderCardBlob(game, snapshot)
      .then((blob) => {
        sheet.image.src = URL.createObjectURL(blob);
        sheet.status.textContent = "";
      })
      .catch(() => {
        sheet.status.textContent = "";
        sheet.image.hidden = true;
      });
  });
}

function openChallengeResult(
  game: Phaser.Game,
  snapshot: ShareSnapshot,
  result: ChallengeResult,
): void {
  const cleared = result.wins >= result.total;
  const sheet = openShareSheet({
    id: "card-preview",
    title: cleared
      ? `You beat ${snapshot.name}'s party!`
      : `${snapshot.name}'s party held on`,
    // The gauntlet stops at the first loss, so this is a win streak.
    subtitle: `Win streak: ${result.wins} of ${result.total} ghosts beaten. Build your own party and send them a card back.`,
    imageAlt: `${snapshot.name}'s Companion Card`,
    buttons: [
      {
        label: "Play now",
        variant: "primary",
        onClick: () => window.location.assign(playNowUrl()),
      },
      {
        // Reload re-enters a clean sandbox: no leftover rewards or HP.
        label: "Rematch",
        onClick: () => window.location.reload(),
      },
    ],
  });
  void renderCardBlob(game, snapshot)
    .then((blob) => {
      sheet.image.src = URL.createObjectURL(blob);
    })
    .catch(() => {
      sheet.image.hidden = true;
    });
}

/** Invalid / tampered `?card=` — show a blocking notice, never boot from it. */
export function showInvalidCardScreen(): void {
  const sheet = openShareSheet({
    id: "card-preview",
    title: "This card link is broken",
    subtitle:
      "The shared party could not be read, so nothing was loaded. Nothing on this device changed.",
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
