import { getCreatureDefinition } from "../creatures/catalog";
import {
  getActiveCreatures,
  getEffectiveMaxHp,
  getReserveCreatures,
  hasLivingPartyMembers,
} from "../creatures/party";
import { hasCraftedWeapon } from "../battle/wandererWeapons";
import type { CreatureInstance } from "../creatures/types";
import { hasPresenceGrowth } from "../shrine/presence";
import { isRareVariant } from "../share/rareVariant";

export const HP_PIP_SEGMENTS = 5;

export type HpPipState = "full" | "hurt" | "fainted";

export function hpPipState(currentHp: number, maxHp: number): HpPipState {
  if (currentHp <= 0) {
    return "fainted";
  }
  if (currentHp >= maxHp) {
    return "full";
  }
  return "hurt";
}

/** How many of `segments` read as filled for a living creature. */
export function hpPipFillCount(
  currentHp: number,
  maxHp: number,
  segments = HP_PIP_SEGMENTS,
): number {
  if (currentHp <= 0 || maxHp <= 0) {
    return 0;
  }
  if (currentHp >= maxHp) {
    return segments;
  }
  // Hurt must never look identical to full (ceil can map >80% to all segments).
  return Math.min(
    segments - 1,
    Math.max(1, Math.ceil((currentHp / maxHp) * segments)),
  );
}

function shortName(creature: CreatureInstance): string {
  return getCreatureDefinition(creature.definitionId).name;
}

function appendPipRow(parent: HTMLElement, creature: CreatureInstance): void {
  const maxHp = getEffectiveMaxHp(creature);
  const state = hpPipState(creature.currentHp, maxHp);
  const filled = hpPipFillCount(creature.currentHp, maxHp);

  const row = document.createElement("div");
  row.className = "party-hp-row";
  row.dataset.hpState = state;

  const name = document.createElement("span");
  name.className = "party-hp-name";
  if (hasPresenceGrowth(creature)) {
    const moon = document.createElement("span");
    moon.className = "party-hp-presence";
    moon.setAttribute("aria-hidden", "true");
    moon.textContent = "◦";
    name.append(moon, document.createTextNode(` ${shortName(creature)}`));
  } else {
    name.textContent = shortName(creature);
  }
  if (isRareVariant(creature)) {
    const star = document.createElement("span");
    star.className = "party-hp-rare";
    star.title = "Rare variant";
    star.textContent = " ✦";
    name.append(star);
  }

  const pips = document.createElement("span");
  pips.className = "party-hp-pips";
  pips.setAttribute("aria-hidden", "true");

  for (let i = 0; i < HP_PIP_SEGMENTS; i += 1) {
    const pip = document.createElement("span");
    if (state === "fainted") {
      pip.className = "hp-pip hp-pip--fainted";
    } else if (i < filled) {
      pip.className = "hp-pip hp-pip--filled";
    } else {
      pip.className = "hp-pip hp-pip--empty";
    }
    pips.appendChild(pip);
  }

  const sr = document.createElement("span");
  sr.className = "visually-hidden";
  sr.textContent =
    state === "fainted"
      ? "fainted"
      : state === "full"
        ? "full HP"
        : `${creature.currentHp} of ${maxHp} HP`;

  row.append(name, pips, sr);
  parent.appendChild(row);
}

/**
 * Render active-party HP as shaped pip rows into `#status-party`.
 * Reserve members are listed as a count only (no pips).
 */
export function renderPartyHpHud(partyEl: HTMLElement): void {
  partyEl.replaceChildren();
  partyEl.classList.add("status-party-hp");

  const active = getActiveCreatures();
  const reserveCount = getReserveCreatures().length;

  if (active.length === 0 && reserveCount === 0) {
    partyEl.textContent = "Party: (empty)";
    return;
  }

  const root = document.createElement("div");
  root.className = "party-hp";
  root.setAttribute("aria-label", "Active party HP");

  if (active.length === 0) {
    const empty = document.createElement("div");
    empty.className = "party-hp-empty";
    empty.textContent = "Party: (none)";
    root.appendChild(empty);
  } else {
    for (const creature of active) {
      appendPipRow(root, creature);
    }
  }

  if (reserveCount > 0) {
    const reserve = document.createElement("div");
    reserve.className = "party-hp-reserve";
    reserve.textContent = `Reserve ×${reserveCount}`;
    root.appendChild(reserve);
  }

  if (!hasLivingPartyMembers() && !hasCraftedWeapon()) {
    const warn = document.createElement("div");
    warn.className = "party-hp-warn";
    warn.textContent =
      "Craft a weapon from wood/stone, or revive at Moon Shrine.";
    root.appendChild(warn);
  }

  partyEl.appendChild(root);
}
