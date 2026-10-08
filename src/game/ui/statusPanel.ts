import {
  getStoryStatusLine,
  peekQuestCompletionMessage,
} from "../story/questProgress";
import { getHostLabel, isVisitorMode } from "../world/worldSession";
import { isHostSaveLocked, resetHostGame } from "../world/worldSave";
import type { ZoneDefinition } from "../world/zoneTypes";
import { openCodex } from "./codex";
import { openParty } from "./partyPanel";
import { openInventory } from "./inventoryPanel";
import { openRecipes } from "./recipePanel";
import { renderPartyHpHud } from "./partyHpHud";
import "./partyHpHud.css";
import { CONTROL_LEGEND_TEXT } from "./controlLegend";
import { refreshQuestHud } from "./questHud";
import {
  refreshHudChromeButtons,
} from "./hudChrome";
import "./hudChrome.css";
import { syncShareButton } from "../share/shareActions";

let inviteFeedbackActive = false;
let inviteFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
let copyInviteHandler: (() => void | Promise<void>) | null = null;
/** Host invite chrome stays off until FTUE first step (see #257 / PR #221). */
let hostInviteUnlocked = false;

function defaultSessionText(): string {
  // Visitors can walk zones and talk to NPCs; host verbs stay locked (#274).
  return isVisitorMode() ? "Visitor mode — walk and talk" : "";
}

function syncHostInviteButton(): void {
  const copyInviteBtn = document.getElementById(
    "copy-invite-btn",
  ) as HTMLButtonElement | null;
  if (!copyInviteBtn) {
    return;
  }
  if (isVisitorMode() || !hostInviteUnlocked) {
    copyInviteBtn.hidden = true;
    copyInviteBtn.disabled = true;
    return;
  }
  copyInviteBtn.hidden = false;
  copyInviteBtn.disabled = copyInviteHandler === null;
}

/** Scene registers live-position invite copy (keyboard I + panel button). */
export function setCopyInviteHandler(
  handler: (() => void | Promise<void>) | null,
): void {
  copyInviteHandler = handler;
  syncHostInviteButton();
}

/** Reveal host invite chrome after the first successful walk (FTUE gate). */
export function unlockHostInviteChrome(): void {
  if (hostInviteUnlocked) {
    return;
  }
  hostInviteUnlocked = true;
  syncHostInviteButton();
}

/** Test/helper: whether host invite chrome has been unlocked this session. */
export function isHostInviteUnlocked(): boolean {
  return hostInviteUnlocked;
}

function defaultSessionColor(): string {
  return isVisitorMode() ? "#a8a8c8" : "#4d879d";
}

export function updateStatusPanel(zone: ZoneDefinition): void {
  syncHostInviteButton();
  const zoneEl = document.getElementById("status-zone");
  const legendEl = document.getElementById("status-control-legend");
  const gateEl = document.getElementById("status-gate");
  const partyEl = document.getElementById("status-party");
  const sessionEl = document.getElementById("status-session");

  if (zoneEl) {
    zoneEl.textContent = isVisitorMode()
      ? `Visiting: ${getHostLabel()}`
      : zone.name;
  }
  refreshQuestHud();
  if (legendEl) {
    legendEl.textContent = CONTROL_LEGEND_TEXT;
  }
  if (gateEl) {
    gateEl.textContent = peekQuestCompletionMessage() ?? getStoryStatusLine();
  }
  if (partyEl) {
    renderPartyHpHud(partyEl);
  }
  syncShareButton();
  refreshHudChromeButtons();
  if (sessionEl && !inviteFeedbackActive) {
    sessionEl.textContent = defaultSessionText();
    sessionEl.style.color = defaultSessionColor();
  }
}

export function refreshPartyStatusLine(): void {
  const partyEl = document.getElementById("status-party");
  if (partyEl) {
    renderPartyHpHud(partyEl);
  }
  syncShareButton();
}

export function setInviteStatus(message: string, color: string): void {
  inviteFeedbackActive = true;
  if (inviteFeedbackTimer !== null) {
    clearTimeout(inviteFeedbackTimer);
    inviteFeedbackTimer = null;
  }
  const sessionEl = document.getElementById("status-session");
  if (sessionEl) {
    sessionEl.textContent = message;
    sessionEl.style.color = color;
  }
}

export function resetInviteStatus(): void {
  inviteFeedbackActive = false;
  if (inviteFeedbackTimer !== null) {
    clearTimeout(inviteFeedbackTimer);
    inviteFeedbackTimer = null;
  }
  const sessionEl = document.getElementById("status-session");
  if (sessionEl) {
    sessionEl.textContent = defaultSessionText();
    sessionEl.style.color = defaultSessionColor();
  }
}

/** Flash invite feedback, then restore the default session line. */
export function flashInviteStatus(
  message: string,
  color: string,
  durationMs = 2500,
): void {
  setInviteStatus(message, color);
  inviteFeedbackTimer = setTimeout(() => {
    inviteFeedbackTimer = null;
    resetInviteStatus();
  }, durationMs);
}

export function measureStatusPanelHeight(): number {
  const panel = document.getElementById("status-panel");
  return panel?.offsetHeight ?? 96;
}

export function measureStatusPanelWidth(): number {
  const panel = document.getElementById("status-panel");
  return panel?.offsetWidth ?? 240;
}

export function showManualInviteUrl(url: string): void {
  const box = document.getElementById("invite-url-box");
  const input = document.getElementById(
    "invite-url-input",
  ) as HTMLInputElement | null;
  if (!box || !input) {
    return;
  }
  input.value = url;
  box.hidden = false;
  // Select so mobile users can use the native copy affordance.
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
  const panel = document.getElementById("status-panel");
  panel?.scrollTo({ top: 0, behavior: "smooth" });
}

export function hideManualInviteUrl(): void {
  const box = document.getElementById("invite-url-box");
  const input = document.getElementById(
    "invite-url-input",
  ) as HTMLInputElement | null;
  if (box) {
    box.hidden = true;
  }
  if (input) {
    input.value = "";
  }
}

const MENU_GAP = 6;
const MENU_EDGE = 8;

export type MenuPlacement = {
  side: "above" | "below";
  /** CSS px from the viewport edge on that side. */
  offset: number;
  /** Room on that side; the menu scrolls inside it when taller. */
  maxHeight: number;
};

/**
 * Choose the side of the "…" button with room for the menu (#391): above by
 * default (the dock sits at the bottom), below when above is too short —
 * phone landscape, where the dock is a right-hand column — else the roomier side.
 */
export function chooseMenuPlacement(input: {
  anchorTop: number;
  anchorBottom: number;
  viewportHeight: number;
  menuHeight: number;
}): MenuPlacement {
  const above = Math.max(0, input.anchorTop - MENU_GAP - MENU_EDGE);
  const below = Math.max(0, input.viewportHeight - input.anchorBottom - MENU_GAP - MENU_EDGE);
  const useAbove =
    input.menuHeight <= above || (input.menuHeight > below && above >= below);
  return useAbove
    ? {
        side: "above",
        offset: input.viewportHeight - input.anchorTop + MENU_GAP,
        maxHeight: above,
      }
    : {
        side: "below",
        offset: input.anchorBottom + MENU_GAP,
        maxHeight: below,
      };
}

function placeOverflowMenu(button: HTMLElement, menu: HTMLElement): void {
  const root = document.documentElement;
  const viewportHeight = window.visualViewport?.height ?? root.clientHeight;
  const anchor = button.getBoundingClientRect();
  // Measure at natural height before capping.
  menu.style.maxHeight = "";
  const placement = chooseMenuPlacement({
    anchorTop: anchor.top,
    anchorBottom: anchor.bottom,
    viewportHeight,
    menuHeight: menu.scrollHeight,
  });
  menu.style.right = `${Math.max(MENU_EDGE, root.clientWidth - anchor.right)}px`;
  menu.style.top = placement.side === "below" ? `${placement.offset}px` : "auto";
  menu.style.bottom = placement.side === "above" ? `${placement.offset}px` : "auto";
  menu.style.maxHeight = `${Math.floor(placement.maxHeight)}px`;
}

function firstMenuControl(menu: HTMLElement): HTMLElement | null {
  return (
    Array.from(menu.querySelectorAll<HTMLElement>("button, input")).find(
      (el) => !el.hidden && !(el as HTMLButtonElement).disabled && el.offsetParent !== null,
    ) ?? null
  );
}

let statusControlsInitialized = false;

export function initStatusPanelControls(): void {
  if (statusControlsInitialized) {
    return;
  }
  statusControlsInitialized = true;

  syncHostInviteButton();
  const copyInviteBtn = document.getElementById("copy-invite-btn");
  if (copyInviteBtn instanceof HTMLButtonElement) {
    copyInviteBtn.addEventListener("click", () => {
      void copyInviteHandler?.();
    });
  }

  const overflowBtn = document.getElementById("status-overflow-btn");
  const overflowMenu = document.getElementById("status-overflow-menu");
  const isOpen = () => overflowMenu?.dataset.open === "1";
  const closeOverflow = (returnFocus = false) => {
    if (!overflowMenu || !overflowBtn) {
      return;
    }
    const wasOpen = isOpen();
    overflowMenu.hidden = true;
    overflowMenu.dataset.open = "0";
    overflowBtn.setAttribute("aria-expanded", "false");
    if (wasOpen && returnFocus) {
      overflowBtn.focus();
    }
  };
  if (overflowBtn && overflowMenu) {
    const place = () => {
      if (isOpen()) {
        placeOverflowMenu(overflowBtn, overflowMenu);
      }
    };
    overflowBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isOpen()) {
        closeOverflow();
        return;
      }
      overflowMenu.hidden = false;
      overflowMenu.dataset.open = "1";
      overflowBtn.setAttribute("aria-expanded", "true");
      placeOverflowMenu(overflowBtn, overflowMenu);
      // Keyboard activation (detail 0) moves focus in; a pointer open leaves it
      // to the canvas hand-back (#390).
      if (event.detail === 0) {
        firstMenuControl(overflowMenu)?.focus();
      }
    });
    document.addEventListener("click", () => closeOverflow());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        event.stopPropagation();
        closeOverflow(true);
      }
    }, true);
    // The anchor moves with the viewport: re-place instead of drifting off-screen.
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    window.visualViewport?.addEventListener("resize", place);
    overflowMenu.addEventListener("click", (event) => event.stopPropagation());
  }

  const resetBtn = document.getElementById("reset-game-btn");
  if (resetBtn) {
    resetBtn.hidden = isVisitorMode();
    resetBtn.addEventListener("click", () => {
      if (isVisitorMode()) {
        return;
      }
      closeOverflow();
      if (isHostSaveLocked()) {
        // Mid story spar the save is paused; a reset would silently do nothing (#382 review).
        window.alert("Finish the current story battle first — your world can't be reset mid-fight.");
        return;
      }
      const confirmed = window.confirm(
        "Reset your world? Party, quests, and progress will be cleared.",
      );
      if (confirmed) {
        resetHostGame();
      }
    });
  }

  refreshHudChromeButtons();

  const codexBtn = document.getElementById("codex-btn");
  if (codexBtn) {
    codexBtn.addEventListener("click", () => openCodex());
  }

  const partyBtn = document.getElementById("party-btn");
  if (partyBtn) {
    partyBtn.addEventListener("click", () => openParty());
  }

  const inventoryBtn = document.getElementById("inventory-btn");
  if (inventoryBtn) {
    inventoryBtn.addEventListener("click", () => openInventory());
  }

  const recipesBtn = document.getElementById("recipes-btn");
  if (recipesBtn) {
    recipesBtn.addEventListener("click", () => openRecipes());
  }

  const inviteDismiss = document.getElementById("invite-url-dismiss");
  if (inviteDismiss) {
    inviteDismiss.addEventListener("click", () => hideManualInviteUrl());
  }
}
