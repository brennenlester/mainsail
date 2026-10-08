import "./opening.css";
import { getActiveQuestId } from "../story/questProgress";
import { isVisitorMode } from "../world/worldSession";
import { OPENING_ARRIVAL_CAPTION, OPENING_ENCOUNTERS } from "./openingScript";

const CAPTION_ID = "opening-caption";
const CAPTION_MS = 4200;

let captionShowing = false;
let captionTimer: ReturnType<typeof setTimeout> | undefined;

/** True while the story caption is up; it outranks the interact / WASD hints (#391). */
export function isOpeningCaptionShowing(): boolean {
  return captionShowing;
}

/**
 * Non-modal story line over the board (#363). Not a dialog box: no focus
 * steal, no button, fades on its own — the player can walk immediately.
 */
export function showOpeningCaption(text: string): void {
  const host = document.getElementById("game");
  if (!host) {
    return;
  }
  let el = document.getElementById(CAPTION_ID);
  if (!el) {
    el = document.createElement("p");
    el.id = CAPTION_ID;
    el.className = "opening-caption";
    el.setAttribute("role", "status");
    host.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove("is-showing");
  void el.offsetWidth;
  el.classList.add("is-showing");
  captionShowing = true;
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => {
    captionShowing = false;
    el?.classList.remove("is-showing");
  }, CAPTION_MS);
}

export function hideOpeningCaption(): void {
  captionShowing = false;
  clearTimeout(captionTimer);
  document.getElementById(CAPTION_ID)?.classList.remove("is-showing");
}

/** Called once the player is named and standing in the world. */
export function startOpeningBeat(): void {
  if (isVisitorMode()) {
    return;
  }
  const active = getActiveQuestId();
  if (OPENING_ENCOUNTERS[0] && active === OPENING_ENCOUNTERS[0].questId) {
    showOpeningCaption(OPENING_ARRIVAL_CAPTION);
  }
}
