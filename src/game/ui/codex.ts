import { getCreatureDefinition } from "../creatures/catalog";
import {
  getCreaturesForZone,
  ZONE_ENCOUNTERS,
} from "../encounters/tables";
import { creatureArtSlot, fillCreatureArt } from "./creatureArt";
import { worldState } from "../world/worldState";
import {
  isAchievementUnlocked,
  isCodexComplete,
} from "../progression/achievements";
import { ZONES } from "../world/zones";
import type { ZoneId } from "../world/zoneTypes";
import { popOverlay, pushOverlay } from "./overlayStack";
import { getFavoriteMaterial } from "../companions/favorites";
import { getMaterialName } from "../inventory/materials";

let codexOpen = false;

function ensureCodexRoot(): HTMLElement {
  let root = document.getElementById("codex-overlay");
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "codex-overlay";
  root.className = "codex-overlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="codex-panel" role="dialog" aria-labelledby="codex-title">
      <div class="codex-header">
        <h2 id="codex-title">Creature Codex</h2>
        <button type="button" id="codex-close" class="codex-close" aria-label="Close">×</button>
      </div>
      <p class="codex-intro">What lives where — fills in as you encounter creatures.</p>
      <div id="codex-body" class="codex-body"></div>
      <p id="codex-footer" class="codex-footer"></p>
    </div>
  `;
  document.getElementById("app")?.appendChild(root);
  root.querySelector("#codex-close")?.addEventListener("click", closeCodex);
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      closeCodex();
    }
  });
  return root;
}

/** Entry for a creature the player has met: art, name, type, favorite. */
function knownEntryHtml(id: string): string {
  const def = getCreatureDefinition(id);
  // Favorite material unlocks with the first encounter (#367).
  const favorite = getMaterialName(getFavoriteMaterial(id));
  return `<li class="codex-entry">
    ${creatureArtSlot(id)}
    <div class="codex-entry-text">
      <strong>${def.name}</strong>
      <span class="codex-type">${def.folkloreType}</span>
      <span class="codex-fav">loves ${favorite}</span>
    </div>
  </li>`;
}

/** Entry for a creature that lives here but has not been met: a silhouette. */
function unknownEntryHtml(id: string): string {
  return `<li class="codex-entry codex-entry--unknown">
    ${creatureArtSlot(id, { silhouette: true })}
    <div class="codex-entry-text">
      <strong>???</strong>
      <span class="codex-type">Not yet met</span>
    </div>
  </li>`;
}

/** Zone sections with art for met creatures and silhouettes for the rest (#391). */
export function codexZonesHtml(discovered: ReadonlySet<string>): string {
  // Safe rooms have no encounter table and are not habitats.
  const zoneIds = (Object.keys(ZONE_ENCOUNTERS) as ZoneId[]).filter(
    (zoneId) => ZONE_ENCOUNTERS[zoneId].length > 0,
  );
  return zoneIds
    .map((zoneId) => {
      const zone = ZONES[zoneId];
      const dwellers = getCreaturesForZone(zoneId).filter(
        (id) => !getCreatureDefinition(id).excludeFromCodex,
      );
      const rows = dwellers.map((id) =>
        discovered.has(id) ? knownEntryHtml(id) : unknownEntryHtml(id),
      );
      if (rows.length === 0) {
        return "";
      }
      const known = dwellers.filter((id) => discovered.has(id)).length;
      return `<section class="codex-zone${known === 0 ? " codex-zone-locked" : ""}">
        <h3>${zone.name}</h3>
        <ul class="codex-grid">${rows.join("")}</ul>
      </section>`;
    })
    .join("");
}

function renderCodexBody(): void {
  const body = document.getElementById("codex-body");
  if (!body) {
    return;
  }
  const discovered = new Set(worldState.discoveredCreatures);

  if (discovered.size === 0) {
    body.innerHTML =
      "<p class=\"codex-empty\">Encounter a wild creature to learn where its kind dwells.</p>";
    return;
  }

  body.innerHTML = codexZonesHtml(discovered);
  void fillCreatureArt(body);
}

/**
 * Footer carries the only in-game nudge toward the secret achievement. It
 * never names the reward or shows a completion count until the codex is full.
 */
function renderCodexFooter(): void {
  const footer = document.getElementById("codex-footer");
  if (!footer) {
    return;
  }
  if (isAchievementUnlocked("full-codex")) {
    footer.textContent = "Codex Keeper — no blank pages remain.";
    return;
  }
  footer.textContent = isCodexComplete(worldState.discoveredCreatures)
    ? ""
    : "Blank pages nag at every keeper.";
}

export function openCodex(): void {
  const root = ensureCodexRoot();
  renderCodexBody();
  renderCodexFooter();
  root.hidden = false;
  codexOpen = true;
  pushOverlay("codex", closeCodex);
}

export function closeCodex(): void {
  popOverlay("codex");
  const root = document.getElementById("codex-overlay");
  if (root) {
    root.hidden = true;
  }
  codexOpen = false;
}

export function toggleCodex(): void {
  if (codexOpen) {
    closeCodex();
  } else {
    openCodex();
  }
}

export function isCodexOpen(): boolean {
  return codexOpen;
}
