import { hideOpeningCaption } from "../opening/openingCaption";

/**
 * Full-screen scenes (battle, encounter, boss, evolution, finale) own the
 * canvas: the DOM story card, caption, touch stick and Party / Inventory
 * buttons must not sit over them (#391). Battle and encounter already toggle
 * their own body class; cutscenes use `cutscene-active` through
 * `bindCutscene`. Every class in HUD_LOCK_CLASSES hides the floating chrome
 * (style.css) and makes the status dock inert (this module).
 */
export const HUD_LOCK_CLASSES = [
  "battle-active",
  "encounter-active",
  "cutscene-active",
] as const;

const CUTSCENE_CLASS = "cutscene-active";
let cutsceneDepth = 0;

export function isCutsceneActive(): boolean {
  return cutsceneDepth > 0;
}

export function isHudLocked(): boolean {
  return HUD_LOCK_CLASSES.some((cls) => document.body.classList.contains(cls));
}

/** Mark a cutscene as running; returns an idempotent release. */
export function enterCutscene(): () => void {
  cutsceneDepth += 1;
  document.body.classList.add(CUTSCENE_CLASS);
  syncHudLock();
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    cutsceneDepth = Math.max(0, cutsceneDepth - 1);
    if (cutsceneDepth === 0) {
      document.body.classList.remove(CUTSCENE_CLASS);
    }
    syncHudLock();
  };
}

/** Hold the cutscene class for a scene's lifetime (start -> shutdown). */
export function bindCutscene(scene: {
  events: { once(event: string, fn: () => void): unknown };
}): void {
  const release = enterCutscene();
  scene.events.once("shutdown", release);
  scene.events.once("destroy", release);
}

/** Make the dock inert while locked; drop transient DOM hints. */
export function syncHudLock(): void {
  const locked = isHudLocked();
  const dock = document.getElementById("status-panel");
  if (dock) {
    dock.toggleAttribute("inert", locked);
  }
  if (locked) {
    hideOpeningCaption();
    const menu = document.getElementById("status-overflow-menu");
    if (menu) {
      menu.hidden = true;
      menu.dataset.open = "0";
    }
  }
}

let observer: MutationObserver | null = null;

/** Watch body classes so battle / encounter get the same lock as cutscenes. */
export function initHudLock(): void {
  if (observer || typeof MutationObserver === "undefined") {
    return;
  }
  observer = new MutationObserver(() => syncHudLock());
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  syncHudLock();
}
