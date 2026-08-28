/** Pin the quest tracker to the top-right of the game board (not the status panel). */
export function syncQuestHudPosition(): void {
  const playfield = document.getElementById("playfield");
  const gameEl = document.getElementById("game");
  const hud = document.getElementById("quest-hud");
  if (!playfield || !gameEl || !hud) {
    return;
  }

  const playfieldRect = playfield.getBoundingClientRect();
  const gameRect = gameEl.getBoundingClientRect();
  const inset = 8;

  hud.style.top = `${Math.max(0, gameRect.top - playfieldRect.top + inset)}px`;
  hud.style.right = `${Math.max(0, playfieldRect.right - gameRect.right + inset)}px`;
  hud.style.left = "auto";
}
