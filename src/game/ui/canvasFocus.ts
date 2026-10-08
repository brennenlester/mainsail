import { getTopOverlayId } from "./overlayStack";

/**
 * Keyboard focus hand-back (#390). After a mouse/touch click on a HUD button
 * (or a HUD panel closing back onto it), focus would otherwise stay on that
 * DOM button: Space/Enter re-trigger it and the game feels deaf. Return focus
 * to the game canvas instead, and again when the window regains focus.
 *
 * Keyboard users keep normal Tab navigation: once Tab is pressed, HUD focus is
 * left alone until the next pointer press. Text fields and open overlays are
 * never robbed of focus. Touch controls are not HUD buttons and are untouched.
 */

const HUD_SCOPE = "#status-panel, #quest-hud";

let pointerMode = false;
let installed = false;

function gameCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("#game canvas");
}

/**
 * A focused DOM control that owns the keyboard (text fields, sliders, selects,
 * contenteditable): the game must not read E/WASD/arrows or swallow them.
 */
export function isDomKeyboardTarget(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** True when `el` is a HUD control focus should not linger on. */
function isHudControl(el: Element | null): boolean {
  return (
    el instanceof HTMLElement &&
    !isDomKeyboardTarget(el) &&
    el.closest(HUD_SCOPE) !== null
  );
}

/**
 * Focus the game canvas unless a DOM overlay is open or a text field is
 * being typed in. Returns whether the canvas now has focus.
 */
export function focusGameCanvas(): boolean {
  if (getTopOverlayId() !== null || isDomKeyboardTarget(document.activeElement)) {
    return false;
  }
  const canvas = gameCanvas();
  if (!canvas) {
    return false;
  }
  if (!canvas.hasAttribute("tabindex")) {
    // Focusable without joining the Tab order; no focus ring on the playfield.
    canvas.tabIndex = -1;
    canvas.style.outline = "none";
  }
  canvas.focus({ preventScroll: true });
  return document.activeElement === canvas;
}

function shouldReclaim(el: Element | null): boolean {
  return el === null || el === document.body || (pointerMode && isHudControl(el));
}

function reclaimSoon(): void {
  // After the click / panel-close handlers that moved focus have finished.
  window.setTimeout(() => {
    if (shouldReclaim(document.activeElement)) {
      focusGameCanvas();
    }
  }, 0);
}

/** Install once (idempotent). */
export function initCanvasFocusReturn(): void {
  if (installed) {
    return;
  }
  installed = true;
  document.addEventListener(
    "pointerdown",
    () => {
      pointerMode = true;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") {
        pointerMode = false;
      }
    },
    true,
  );
  document.addEventListener("focusin", (event) => {
    if (pointerMode && isHudControl(event.target as Element | null)) {
      reclaimSoon();
    }
  });
  window.addEventListener("focus", reclaimSoon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reclaimSoon();
    }
  });
}

/** Test-only reset. */
export function resetCanvasFocusForTest(): void {
  pointerMode = false;
}
