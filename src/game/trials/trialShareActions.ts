import type Phaser from "phaser";
import { loadCardFonts, canvasToPngBlob } from "../share/companionCard";
import {
  canCopyImage,
  canShareFiles,
  copyLink,
  downloadBlob,
  siteLabel,
} from "../share/shareActions";
import { openShareSheet } from "../share/shareSheet";
import { createSpriteLookup } from "../share/spriteSource";
import { getPlayerName } from "../world/playerName";
import { buildTrialPlan } from "./dailyTrial";
import { trialTitleIndex, TRIAL_TITLES } from "./scoring";
import { renderTrialCard, type TrialCardData } from "./trialCard";
import type { TrialOutcome } from "./trialRun";
import { buildTrialShareUrl, sanitizeTrialName, type TrialBrag } from "./trialShare";
import type { TrialDay } from "./trialSeed";

/**
 * Trial Result sharing (#420): paint the 1080x1350 card from the game's own
 * textures and offer Share / Copy image / Download / Copy link, like the
 * Companion Card. The link replays the same day's gauntlet.
 */

const TRIAL_CARD_FILE = "ivyward-eclipse-trial.png";

export function cardDataFor(
  day: TrialDay,
  brag: Pick<TrialBrag, "name" | "score" | "rounds" | "title">,
  party: readonly { id: string; rare: boolean }[],
): TrialCardData {
  return {
    name: sanitizeTrialName(brag.name),
    day,
    score: brag.score,
    title: TRIAL_TITLES[brag.title]?.title ?? TRIAL_TITLES[0]!.title,
    roundsCleared: brag.rounds,
    rounds: buildTrialPlan(day).rounds.map((r) => r.modifiers),
    party,
  };
}

export function bragFor(outcome: TrialOutcome, name: string | null): TrialBrag {
  return {
    name: name ?? "",
    score: outcome.score.total,
    rounds: outcome.score.roundsCleared,
    title: trialTitleIndex(outcome.score.total),
    party: outcome.party.map((p) => p.id),
  };
}

export async function renderTrialCardData(game: Phaser.Game, data: TrialCardData): Promise<Blob> {
  await loadCardFonts();
  // Lazy: sprites.ts pulls in Phaser at runtime, which unit tests avoid.
  const { ensureCreatureTextures } = await import("../creatures/sprites");
  const scene = game.scene.getScenes(true)[0];
  if (scene) {
    ensureCreatureTextures(scene);
  }
  return canvasToPngBlob(renderTrialCard(data, createSpriteLookup(game), siteLabel()));
}

export function renderTrialCardBlob(game: Phaser.Game, outcome: TrialOutcome): Promise<Blob> {
  const brag = bragFor(outcome, getPlayerName());
  return renderTrialCardData(game, cardDataFor(outcome.day, brag, outcome.party));
}

export async function openTrialShare(game: Phaser.Game, outcome: TrialOutcome): Promise<void> {
  const brag = bragFor(outcome, getPlayerName());
  const url = buildTrialShareUrl(outcome.day, brag);
  let blob: Blob | null = null;
  let file: File | null = null;
  const sheet = openShareSheet({
    id: "share-overlay",
    title: "Your Eclipse Trial",
    subtitle: "Same gauntlet for everyone today — send the link and see who scores higher.",
    imageAlt: "Eclipse Trial result card",
    onClose: () => undefined,
    game,
    buttons: [
      {
        label: "Share",
        variant: "primary",
        hidden: true,
        onClick: async () => {
          if (!file) return;
          try {
            await navigator.share({ files: [file], title: "My Eclipse Trial", text: "Beat my score on today's Eclipse Trial", url });
            sheet.status.textContent = "Shared!";
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
              sheet.status.textContent = "Sharing failed — try Download or Copy link.";
            }
          }
        },
      },
      {
        label: "Copy image",
        hidden: true,
        onClick: async () => {
          if (!blob) return;
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            sheet.status.textContent = "Card copied — paste it anywhere.";
          } catch {
            sheet.status.textContent = "Copy failed — try Download instead.";
          }
        },
      },
      {
        label: "Download",
        onClick: () => {
          if (!blob) return;
          downloadBlob(blob, TRIAL_CARD_FILE);
          sheet.status.textContent = `Saved ${TRIAL_CARD_FILE}`;
        },
      },
      { label: "Copy link", onClick: () => copyLink(sheet, url) },
      { label: "Close", variant: "quiet", onClick: () => sheet.close() },
    ],
  });
  const [shareBtn, copyImageBtn] = sheet.buttons;
  sheet.status.textContent = "Painting your card…";
  try {
    blob = await renderTrialCardBlob(game, outcome);
    file = new File([blob], TRIAL_CARD_FILE, { type: "image/png" });
    sheet.showCard(blob);
    sheet.status.textContent = "";
    shareBtn!.hidden = !canShareFiles(file);
    copyImageBtn!.hidden = !canCopyImage();
  } catch {
    sheet.status.textContent = "Could not draw the card — the link still works.";
  }
}
