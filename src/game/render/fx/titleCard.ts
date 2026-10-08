import "./titleCard.css";

const CARD_ID = "zone-title-card";

/**
 * Zone-entry title card (#362): DOM over the canvas so text stays crisp at
 * any camera zoom / DPR. Decorative only — the status panel already names
 * the zone for assistive tech, so the card is aria-hidden.
 */
export function showZoneTitleCard(name: string, subtitle: string): void {
  const host = document.getElementById("game");
  if (!host) {
    return;
  }
  let card = document.getElementById(CARD_ID);
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "zone-title-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML =
      '<span class="zone-title-card__name"></span>' +
      '<span class="zone-title-card__rule"></span>' +
      '<span class="zone-title-card__sub"></span>';
    // Fade-out ends the animation: the card is then no longer "showing" (#401).
    card.addEventListener("animationend", () => card?.classList.remove("is-showing"));
    host.appendChild(card);
  }
  card.querySelector(".zone-title-card__name")!.textContent = name;
  card.querySelector(".zone-title-card__sub")!.textContent = subtitle;
  // Restart the CSS animation for back-to-back zone hops.
  card.classList.remove("is-showing");
  void card.offsetWidth;
  card.classList.add("is-showing");
}

export function hideZoneTitleCard(): void {
  document.getElementById(CARD_ID)?.classList.remove("is-showing");
}

/** True while the card is on screen; toasts wait their turn instead of overlapping it (#401). */
export function isZoneTitleCardShowing(): boolean {
  return document.getElementById(CARD_ID)?.classList.contains("is-showing") ?? false;
}
