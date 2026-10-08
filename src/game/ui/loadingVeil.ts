/**
 * Branded loading veil (#410): covers the stage while world assets finish
 * streaming in behind the title, while the world builds its first frame,
 * and while a scene fetches late-game art. Sits above the HUD and panels;
 * callers hide it before showing the name form.
 */
const VEIL_ID = "loading-veil";

function veilElement(): HTMLElement {
  let veil = document.getElementById(VEIL_ID);
  if (veil) {
    return veil;
  }
  veil = document.createElement("div");
  veil.id = VEIL_ID;
  veil.className = "loading-veil";
  veil.hidden = true;
  veil.innerHTML = `
    <p class="loading-veil-title">Ivyward</p>
    <p class="loading-veil-caption" role="status" aria-live="polite"></p>
    <div class="loading-veil-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Loading">
      <div class="loading-veil-fill"></div>
    </div>
    <button type="button" class="loading-veil-action" hidden></button>`;
  document.body.append(veil);
  return veil;
}

/** Show (or update) the veil; `progress` is 0..1, omitted for an indeterminate bar. */
export function showLoadingVeil(caption: string, progress?: number): void {
  const veil = veilElement();
  veil.hidden = false;
  const text = veil.querySelector<HTMLElement>(".loading-veil-caption");
  if (text && text.textContent !== caption) {
    text.textContent = caption;
  }
  const track = veil.querySelector<HTMLElement>(".loading-veil-track");
  const fill = veil.querySelector<HTMLElement>(".loading-veil-fill");
  if (!track || !fill) {
    return;
  }
  const known = typeof progress === "number" && Number.isFinite(progress);
  track.classList.toggle("loading-veil-track--busy", !known);
  if (known) {
    const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
    fill.style.width = `${pct}%`;
    track.setAttribute("aria-valuenow", String(pct));
  } else {
    fill.style.width = "";
    track.removeAttribute("aria-valuenow");
  }
}

/**
 * Offer a way out of a stalled load (e.g. Reload); cleared by the next
 * hide. The caption should already say what went wrong.
 */
export function showLoadingVeilAction(label: string, onClick: () => void): void {
  const button = veilElement().querySelector<HTMLButtonElement>(".loading-veil-action");
  if (!button) {
    return;
  }
  button.textContent = label;
  button.onclick = onClick;
  button.hidden = false;
  button.focus();
}

export function hideLoadingVeil(): void {
  const veil = document.getElementById(VEIL_ID);
  if (veil) {
    veil.hidden = true;
    const button = veil.querySelector<HTMLButtonElement>(".loading-veil-action");
    if (button) {
      button.hidden = true;
      button.onclick = null;
    }
  }
}

export function isLoadingVeilShown(): boolean {
  const veil = document.getElementById(VEIL_ID);
  return Boolean(veil && !veil.hidden);
}
