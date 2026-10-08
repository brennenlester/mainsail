import { getCreatureDefinition } from "../creatures/catalog";
import {
  ACTIVE_PARTY_LIMIT,
  getActiveCreatures,
  getCreatureInstance,
  getEffectiveMaxHp,
  getReserveCreatures,
  moveActiveToReserve,
  moveReserveToActive,
  swapActiveWithReserve,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { refreshPartyStatusLine } from "./statusPanel";
import { popOverlay, pushOverlay } from "./overlayStack";
import { isVisitorMode } from "../world/worldSession";
import { isRareVariant } from "../share/rareVariant";
import {
  BOND_MAX,
  bondTier,
  bondTierName,
  bondTierProgress,
} from "../companions/bond";
import {
  canGift,
  GIFT_COST,
  giftFavorite,
} from "../companions/companionState";
import { getPersonality } from "../companions/personality";
import { getMaterialCount } from "../inventory/playerInventory";
import { getMaterialName } from "../inventory/materials";
import { promptNickname } from "./nicknamePrompt";

let partyOpen = false;
let selectedActiveId: string | null = null;
let selectedReserveId: string | null = null;
/** Creature shown in the companion detail card (last one clicked). */
let detailId: string | null = null;
let detailNote = "";
/** Set while BattleScene (or other combat) is active — blocks party edits. */
let partyEditLocked = false;
let previouslyFocused: HTMLElement | null = null;

function onPartyKeyDown(event: KeyboardEvent): void {
  if (!partyOpen) {
    return;
  }
  // Esc owned by overlayStack (top-most only).
  if (event.key === "Escape") {
    return;
  }
}

export function setPartyEditLocked(locked: boolean): void {
  partyEditLocked = locked;
  if (locked && partyOpen) {
    closeParty();
  }
}

export function isPartyEditLocked(): boolean {
  return partyEditLocked;
}

function setBackgroundInert(inert: boolean): void {
  const playfield = document.getElementById("playfield");
  if (playfield) {
    if (inert) {
      playfield.setAttribute("inert", "");
    } else {
      playfield.removeAttribute("inert");
    }
  }
}

function ensurePartyRoot(): HTMLElement {
  let root = document.getElementById("party-overlay");
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "party-overlay";
  root.className = "party-overlay";
  root.hidden = true;
  root.innerHTML = `
    <div class="party-panel" role="dialog" aria-labelledby="party-title">
      <div class="party-header">
        <h2 id="party-title">Party</h2>
        <button type="button" id="party-close" class="party-close" aria-label="Close">×</button>
      </div>
      <p class="party-intro">Active party holds up to ${ACTIVE_PARTY_LIMIT}. Reserve scrolls — select one from each list to swap.</p>
      <div class="party-columns">
        <section class="party-column">
          <h3>Active <span id="party-active-count"></span></h3>
          <ul id="party-active-list" class="party-list"></ul>
        </section>
        <section class="party-column">
          <h3>Reserve</h3>
          <ul id="party-reserve-list" class="party-list party-list-scroll"></ul>
        </section>
      </div>
      <div class="party-actions">
        <button type="button" id="party-swap" class="party-action-btn" disabled>Swap</button>
        <button type="button" id="party-promote" class="party-action-btn" disabled>To active</button>
        <button type="button" id="party-demote" class="party-action-btn" disabled>To reserve</button>
      </div>
      <section id="party-detail" class="party-detail" aria-live="polite"></section>
      <p id="party-hint" class="party-hint"></p>
    </div>
  `;
  document.getElementById("app")?.appendChild(root);
  root.querySelector("#party-close")?.addEventListener("click", closeParty);
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      closeParty();
    }
  });
  root.querySelector("#party-swap")?.addEventListener("click", () => {
    if (partyEditLocked || isVisitorMode() || !selectedActiveId || !selectedReserveId) {
      return;
    }
    if (swapActiveWithReserve(selectedActiveId, selectedReserveId)) {
      selectedActiveId = null;
      selectedReserveId = null;
      refreshPartyUi();
      refreshPartyStatusLine();
    }
  });
  root.querySelector("#party-promote")?.addEventListener("click", () => {
    if (partyEditLocked || isVisitorMode() || !selectedReserveId) {
      return;
    }
    if (moveReserveToActive(selectedReserveId)) {
      selectedReserveId = null;
      refreshPartyUi();
      refreshPartyStatusLine();
    }
  });
  root.querySelector("#party-demote")?.addEventListener("click", () => {
    if (partyEditLocked || isVisitorMode() || !selectedActiveId) {
      return;
    }
    if (moveActiveToReserve(selectedActiveId)) {
      selectedActiveId = null;
      refreshPartyUi();
      refreshPartyStatusLine();
    }
  });
  return root;
}

function creatureRowLabel(creature: CreatureInstance): string {
  const def = getCreatureDefinition(creature.definitionId);
  const maxHp = getEffectiveMaxHp(creature);
  const name = creature.nickname ? `${creature.nickname} (${def.name})` : def.name;
  const trait = creature.personality ? ` · ${getPersonality(creature.personality).label}` : "";
  const hearts = "♥".repeat(bondTier(creature.bond));
  const rare = isRareVariant(creature) ? " ✦" : "";
  return `${name}${rare} Lv.${creature.level} (${creature.currentHp}/${maxHp} HP)${trait}${hearts ? ` ${hearts}` : ""}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** Companion card: personality, bond meter, favorite + gift, rename (#367). */
function renderDetail(): void {
  const root = document.getElementById("party-detail");
  if (!root) {
    return;
  }
  root.replaceChildren();
  const creature = detailId ? getCreatureInstance(detailId) : undefined;
  if (!creature) {
    root.appendChild(el("p", "party-detail-empty", "Select a companion to see their personality and bond."));
    return;
  }
  const def = getCreatureDefinition(creature.definitionId);
  // textContent everywhere: nicknames are player input.
  root.appendChild(el("h3", "party-detail-name", creature.nickname ? `${creature.nickname} the ${def.name}` : def.name));
  if (creature.personality) {
    const trait = getPersonality(creature.personality);
    const line = el("p", "party-detail-trait");
    line.appendChild(el("strong", "", trait.label));
    line.appendChild(document.createTextNode(` — ${trait.blurb}`));
    root.appendChild(line);
  }
  const tier = bondTier(creature.bond);
  const bondRow = el("div", "party-bond");
  bondRow.appendChild(el("span", "party-bond-label", `Bond: ${bondTierName(tier)}`));
  const meter = el("span", "party-bond-meter");
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(BOND_MAX));
  meter.setAttribute("aria-valuenow", String(creature.bond ?? 0));
  meter.setAttribute("aria-label", `Bond ${bondTierName(tier)}`);
  const fill = el("span", `party-bond-fill party-bond-tier-${tier}`);
  fill.style.width = `${Math.round(bondTierProgress(creature.bond) * 100)}%`;
  meter.appendChild(fill);
  bondRow.appendChild(meter);
  root.appendChild(bondRow);

  const check = canGift(creature);
  const favorite = getMaterialName(check.materialId);
  root.appendChild(
    el("p", "party-detail-fav", `Loves ${favorite} (you have ${getMaterialCount(check.materialId)}).`),
  );
  const actions = el("div", "party-detail-actions");
  const giftBtn = el("button", "party-action-btn", `Gift ${GIFT_COST}× ${favorite}`);
  giftBtn.type = "button";
  giftBtn.disabled = isVisitorMode() || !check.ok;
  giftBtn.title = check.ok ? "Raise bond" : check.reason;
  giftBtn.addEventListener("click", () => {
    const result = giftFavorite(creature);
    detailNote = result.ok
      ? result.tierUp !== undefined
        ? `Bond deepened to ${bondTierName(result.tierUp)}!`
        : `+${result.gained} bond`
      : result.reason;
    refreshPartyUi();
  });
  const renameBtn = el("button", "party-action-btn", creature.nickname ? "Rename" : "Nickname");
  renameBtn.type = "button";
  renameBtn.disabled = isVisitorMode();
  renameBtn.addEventListener("click", () => {
    void promptNickname(creature).then(() => {
      detailNote = "";
      refreshPartyUi();
    });
  });
  actions.append(giftBtn, renameBtn);
  root.appendChild(actions);
  const note = detailNote || (check.ok ? "" : check.reason);
  root.appendChild(el("p", "party-detail-note", note));
}

function renderList(
  listEl: HTMLElement,
  creatures: CreatureInstance[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  if (creatures.length === 0) {
    listEl.innerHTML = `<li class="party-empty">None</li>`;
    return;
  }
  listEl.innerHTML = "";
  for (const creature of creatures) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      creature.instanceId === selectedId
        ? "party-creature-btn party-creature-selected"
        : "party-creature-btn";
    btn.textContent = creatureRowLabel(creature);
    btn.disabled = isVisitorMode();
    btn.addEventListener("click", () => onSelect(creature.instanceId));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

function refreshPartyUi(): void {
  const activeList = document.getElementById("party-active-list");
  const reserveList = document.getElementById("party-reserve-list");
  const activeCount = document.getElementById("party-active-count");
  const swapBtn = document.getElementById("party-swap") as HTMLButtonElement | null;
  const promoteBtn = document.getElementById(
    "party-promote",
  ) as HTMLButtonElement | null;
  const demoteBtn = document.getElementById(
    "party-demote",
  ) as HTMLButtonElement | null;
  const hint = document.getElementById("party-hint");
  if (!activeList || !reserveList) {
    return;
  }

  const actives = getActiveCreatures();
  const reserves = getReserveCreatures();
  if (activeCount) {
    activeCount.textContent = `(${actives.length}/${ACTIVE_PARTY_LIMIT})`;
  }

  renderList(activeList, actives, selectedActiveId, (id) => {
    selectedActiveId = selectedActiveId === id ? null : id;
    detailId = id;
    detailNote = "";
    refreshPartyUi();
  });
  renderList(reserveList, reserves, selectedReserveId, (id) => {
    selectedReserveId = selectedReserveId === id ? null : id;
    detailId = id;
    detailNote = "";
    refreshPartyUi();
  });
  renderDetail();

  const locked = isVisitorMode() || partyEditLocked;
  if (swapBtn) {
    swapBtn.disabled = locked || !selectedActiveId || !selectedReserveId;
  }
  if (promoteBtn) {
    promoteBtn.disabled =
      locked ||
      !selectedReserveId ||
      actives.length >= ACTIVE_PARTY_LIMIT;
  }
  if (demoteBtn) {
    demoteBtn.disabled = locked || !selectedActiveId;
  }
  if (hint) {
    hint.textContent = partyEditLocked
      ? "Party edits are locked during battle."
      : isVisitorMode()
        ? "Visitor mode — party edits are host-only."
        : "";
  }
}

export function openParty(): void {
  if (partyEditLocked) {
    return;
  }
  const root = ensurePartyRoot();
  selectedActiveId = null;
  selectedReserveId = null;
  detailId = getActiveCreatures()[0]?.instanceId ?? null;
  detailNote = "";
  refreshPartyUi();
  previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.hidden = false;
  partyOpen = true;
  setBackgroundInert(true);
  pushOverlay("party", closeParty);
  document.addEventListener("keydown", onPartyKeyDown);
  const closeBtn = root.querySelector("#party-close") as HTMLButtonElement | null;
  closeBtn?.focus();
}

export function closeParty(): void {
  popOverlay("party");
  const root = document.getElementById("party-overlay");
  if (root) {
    root.hidden = true;
  }
  partyOpen = false;
  setBackgroundInert(false);
  document.removeEventListener("keydown", onPartyKeyDown);
  previouslyFocused?.focus();
  previouslyFocused = null;
}

export function toggleParty(): void {
  if (partyOpen) {
    closeParty();
  } else {
    openParty();
  }
}

export function isPartyOpen(): boolean {
  return partyOpen;
}
