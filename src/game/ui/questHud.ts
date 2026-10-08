import {
  getActiveQuestId,
  getQuestHint,
  getQuestNpcLine,
  getQuestSummary,
  peekQuestCompletionMessage,
} from "../story/questProgress";
import { getActiveSideQuestHint } from "../world/npcState";
import { getStorySparNpcLine } from "../battle/storySpar";
import {
  getSovereignVoyageHint,
  isSovereignVoyageStarted,
} from "../story/sovereignVoyage";

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

/** Refresh quest tracker copy — safe while IsometricScene is paused in sub-scenes. */
export function refreshQuestHud(): void {
  const questEl = document.getElementById("quest-hud-summary");
  const questHintEl = document.getElementById("quest-hud-hint");
  const questNpcEl = document.getElementById("quest-hud-npc");
  const completion = peekQuestCompletionMessage();

  if (questEl) {
    questEl.textContent = completion ?? getQuestSummary();
  }
  if (questHintEl) {
    const parts = [getQuestHint()];
    // A voyage already under way stays visible as an optional thread (#369);
    // after the finale it is the story hint itself.
    if (getActiveQuestId() && isSovereignVoyageStarted()) {
      parts.push(getSovereignVoyageHint() ?? "");
    }
    parts.push(getActiveSideQuestHint() ?? "");
    questHintEl.textContent = parts.filter(Boolean).join(" · ");
  }
  if (questNpcEl) {
    questNpcEl.textContent = getStorySparNpcLine() ?? getQuestNpcLine() ?? "";
  }
  syncQuestHudPosition();
}
