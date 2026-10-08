import type Phaser from "phaser";
import { getActiveCreatures, playerParty } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { bondTier } from "../companions/bond";
import { hasPresenceGrowth } from "../shrine/presence";
import { getPlayerName } from "../world/playerName";
import { isVisitorMode } from "../world/worldSession";
import {
  canvasToPngBlob,
  loadCardFonts,
  renderCompanionCard,
} from "./companionCard";
import { isRareVariant } from "./rareVariant";
import {
  buildShareUrl,
  cardSiteLabel,
  SHARE_PARTY_LIMIT,
  todayShareDay,
  type ShareSnapshot,
} from "./shareCode";
import { openShareSheet, showManualLink, type ShareSheet } from "./shareSheet";
import { createSpriteLookup } from "./spriteSource";

const CARD_FILE_NAME = "ivyward-companions.png";

let shareGame: Phaser.Game | null = null;
/** Card preview / challenge sandboxes never offer their own Share. */
let shareDisabled = false;

export function setShareDisabled(disabled: boolean): void {
  shareDisabled = disabled;
  syncShareButton();
}

export function snapshotFromParty(
  creatures: readonly CreatureInstance[],
  name: string | null,
  day = todayShareDay(),
): ShareSnapshot {
  return {
    name: name ?? "",
    day,
    party: creatures.slice(0, SHARE_PARTY_LIMIT).map((c) => ({
      id: c.definitionId,
      level: c.level,
      rare: isRareVariant(c),
      evolved: c.definitionId !== c.speciesId,
      presence: hasPresenceGrowth(c),
      // Hearts = bond tier + 1 (Wary 1 … Kindred 5).
      bond: bondTier(c.bond) + 1,
    })),
  };
}

function currentShareCreatures(): CreatureInstance[] {
  const actives = getActiveCreatures();
  return actives.length > 0 ? actives : playerParty.creatures.slice();
}

export function syncShareButton(): void {
  const button = document.getElementById("share-card-btn");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.hidden =
    shareDisabled || isVisitorMode() || currentShareCreatures().length === 0;
}

export function siteLabel(): string {
  return cardSiteLabel(window.location.host);
}

/** Render a card PNG for a snapshot using the game's loaded textures. */
export async function renderCardBlob(
  game: Phaser.Game,
  snapshot: ShareSnapshot,
): Promise<Blob> {
  await loadCardFonts();
  // Lazy: sprites.ts pulls in Phaser at runtime, which unit tests avoid.
  const { ensureCreatureTextures } = await import("../creatures/sprites");
  const scene = game.scene.getScenes(true)[0];
  if (scene) {
    ensureCreatureTextures(scene);
  }
  const canvas = renderCompanionCard(snapshot, createSpriteLookup(game), siteLabel());
  return canvasToPngBlob(canvas);
}

function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = CARD_FILE_NAME;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function copyLink(sheet: ShareSheet, url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    sheet.status.textContent = "Link copied — send it to a friend.";
  } catch {
    showManualLink(sheet, url);
    sheet.status.textContent = "Select the link to copy it.";
  }
}

function canShareFiles(file: File): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function canCopyImage(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

/** True when a Share button can open the sheet (game bound, host, not a preview). */
export function isCompanionShareAvailable(): boolean {
  return shareGame !== null && !shareDisabled && !isVisitorMode();
}

export type CompanionShareOptions = {
  /** Party to put on the card; defaults to the active party (#393 finale recap). */
  creatures?: readonly CreatureInstance[];
  title?: string;
  subtitle?: string;
};

/** Status-panel Share: render the card, then share / copy / download. */
export async function openCompanionShare(
  options: CompanionShareOptions = {},
): Promise<void> {
  const game = shareGame;
  const creatures = options.creatures?.length
    ? options.creatures.slice()
    : currentShareCreatures();
  if (!game || shareDisabled || isVisitorMode() || creatures.length === 0) {
    return;
  }
  const snapshot = snapshotFromParty(creatures, getPlayerName());
  const url = buildShareUrl(snapshot);
  let blob: Blob | null = null;
  let file: File | null = null;

  const sheet = openShareSheet({
    id: "share-overlay",
    title: options.title ?? "Your Companion Card",
    subtitle:
      options.subtitle ??
      "Show off your party — friends can challenge it from the link.",
    imageAlt: "Companion Card showing your party",
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
            await navigator.share({
              files: [file],
              title: "My Ivyward companions",
              // URL only in `url`: some targets append it to text, doubling it.
              text: "Think you can beat my party?",
              url,
            });
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
          downloadBlob(blob);
          sheet.status.textContent = "Saved ivyward-companions.png";
        },
      },
      { label: "Copy link", onClick: () => copyLink(sheet, url) },
      { label: "Close", variant: "quiet", onClick: () => sheet.close() },
    ],
  });
  const [shareBtn, copyImageBtn] = sheet.buttons;
  sheet.status.textContent = "Painting your card…";
  try {
    blob = await renderCardBlob(game, snapshot);
    file = new File([blob], CARD_FILE_NAME, { type: "image/png" });
    sheet.showCard(blob);
    sheet.status.textContent = "";
    shareBtn.hidden = !canShareFiles(file);
    copyImageBtn.hidden = !canCopyImage();
  } catch {
    sheet.status.textContent = "Could not draw the card — the link still works.";
  }
}

export function initShareControls(game: Phaser.Game): void {
  shareGame = game;
  const button = document.getElementById("share-card-btn");
  if (button instanceof HTMLButtonElement && !button.dataset.bound) {
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      void openCompanionShare();
    });
  }
  syncShareButton();
}
