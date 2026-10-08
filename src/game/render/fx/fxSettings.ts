/** Player-facing FX preferences (#362): Effects toggle + reduced motion. */

const STORAGE_KEY = "ivyward-fx-enabled";
const TOGGLE_ID = "fx-toggle-btn";

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function effectsEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setEffectsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still applies for this session.
  }
}

/** `?time=0.8` pins the day/night phase (QA / screenshots). */
export function parseForcedPhase(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("time");
  if (raw === null || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return ((value % 1) + 1) % 1;
}

/** `?fx=high|low|off` pins FX quality (QA on software GL, perf checks). */
export function parseForcedQuality(search: string): "high" | "low" | "off" | undefined {
  const raw = new URLSearchParams(search).get("fx");
  return raw === "high" || raw === "low" || raw === "off" ? raw : undefined;
}

export function toggleLabel(enabled: boolean): string {
  return `Effects: ${enabled ? "On" : "Off"}`;
}

/**
 * Add an "Effects" item to the status overflow menu (once) and route clicks
 * to `onChange`. Re-binding replaces the handler for the current scene.
 */
let currentHandler: ((enabled: boolean) => void) | undefined;

export function bindEffectsToggle(onChange: (enabled: boolean) => void): void {
  currentHandler = onChange;
  const menu = document.getElementById("status-overflow-menu");
  if (!menu) {
    return;
  }
  let btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = TOGGLE_ID;
    btn.type = "button";
    btn.className = "status-mute-btn";
    btn.setAttribute("role", "menuitemcheckbox");
    menu.prepend(btn);
    btn.addEventListener("click", () => {
      const next = !effectsEnabled();
      setEffectsEnabled(next);
      syncButton(btn!);
      currentHandler?.(next);
    });
  }
  syncButton(btn);
}

function syncButton(btn: HTMLButtonElement): void {
  const enabled = effectsEnabled();
  btn.textContent = toggleLabel(enabled);
  btn.setAttribute("aria-checked", enabled ? "true" : "false");
}
