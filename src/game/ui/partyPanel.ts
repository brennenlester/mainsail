import "./menuPanels.css";
import { getCreatureDefinition } from "../creatures/catalog";
import { displayNameIn } from "../creatures/displayName";
import { creatureArtSlot, fillCreatureArt } from "./creatureArt";
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
import { notifyPartyChanged } from "../creatures/partyEvents";
import type { CreatureInstance } from "../creatures/types";
import { refreshPartyStatusLine } from "./statusPanel";
import { popOverlay, pushOverlay } from "./overlayStack";
import { isVisitorMode } from "../world/worldSession";
import { isRareVariant, rareVariantAccentCss, rareVariantGlowCss } from "../share/rareVariant";
import { speciesOf } from "../companions/companionState";
import {
  BOND_MAX,
  bondTier,
  bondTierName,
  bondTierProgress,
  BOND_TIER_NAMES,
} from "../companions/bond";
import {
  canGift,
  GIFT_COST,
  giftCooldownLeftMs,
  giftFavorite,
} from "../companions/companionState";
import { getPersonality } from "../companions/personality";
import { getMaterialCount } from "../inventory/playerInventory";
import { getMaterialName } from "../inventory/materials";
import { promptNickname } from "./nicknamePrompt";

/** Hearts on a card: tier + 1 of one per bond tier (matches the Companion Card). */
const BOND_HEARTS = BOND_TIER_NAMES.length;

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
  root.className = "party-overlay menu-root party-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="menu-panel party-panel" role="dialog" aria-labelledby="party-title">
      <div class="menu-head">
        <h2 id="party-title" class="menu-title">Party</h2>
        <button type="button" id="party-close" class="menu-close" aria-label="Close">×</button>
      </div>
      <div class="menu-body">
        <p class="menu-intro">Active party holds up to ${ACTIVE_PARTY_LIMIT}. Select one from each list to swap.</p>
        <div class="party-columns">
          <section class="party-column">
            <h3>Active <span id="party-active-count"></span></h3>
            <ul id="party-active-list" class="party-list"></ul>
          </section>
          <section class="party-column">
            <h3>Reserve</h3>
            <ul id="party-reserve-list" class="party-list"></ul>
          </section>
        </div>
        <div class="party-actions">
          <button type="button" id="party-swap" class="menu-btn party-action-btn" disabled>Swap</button>
          <button type="button" id="party-promote" class="menu-btn party-action-btn" disabled>To active</button>
          <button type="button" id="party-demote" class="menu-btn party-action-btn" disabled>To reserve</button>
        </div>
        <section id="party-detail" class="party-detail" aria-live="polite"></section>
        <p id="party-hint" class="menu-hint"></p>
      </div>
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

/** Name as the panel shows it: two "Pip"s read "Pip" and "Pip ·2" (#423). */
function partyName(creature: CreatureInstance): string {
  return displayNameIn(creature, [...getActiveCreatures(), ...getReserveCreatures()]);
}

/** Spoken summary for a party card (the visible card is mostly icons and bars). */
export function creatureCardLabel(creature: CreatureInstance): string {
  const def = getCreatureDefinition(creature.definitionId);
  const maxHp = getEffectiveMaxHp(creature);
  const tier = bondTier(creature.bond);
  const parts = [
    partyName(creature),
    creature.nickname ? def.name : "",
    isRareVariant(creature) ? "rare" : "",
    `level ${creature.level}`,
    def.folkloreType,
    creature.currentHp <= 0 ? "fainted" : `${creature.currentHp} of ${maxHp} HP`,
    `bond ${bondTierName(tier)}`,
  ];
  return parts.filter(Boolean).join(", ");
}

/** "healthy" / "hurt" / "low" / "fainted", for the HP bar colour. */
export function hpBarState(currentHp: number, maxHp: number): "healthy" | "hurt" | "low" | "fainted" {
  if (currentHp <= 0) {
    return "fainted";
  }
  const ratio = maxHp > 0 ? currentHp / maxHp : 0;
  return ratio > 0.6 ? "healthy" : ratio > 0.3 ? "hurt" : "low";
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
  const giftBtn = el("button", "menu-btn party-action-btn", `Gift ${GIFT_COST}× ${favorite}`);
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
  const renameBtn = el("button", "menu-btn party-action-btn", creature.nickname ? "Rename" : "Nickname");
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
  const note = el("p", "party-detail-note", giftNoteText(detailNote, check));
  root.appendChild(note);
  scheduleGiftRefresh(creature, giftBtn, note);
}

let giftTimer: number | undefined;

/**
 * While the gift cools down, tick the countdown and re-enable the button
 * when it ends (#426: it stayed disabled until something re-rendered).
 * Updates in place so keyboard focus stays put.
 */
function scheduleGiftRefresh(creature: CreatureInstance, btn: HTMLButtonElement, note: HTMLElement): void {
  window.clearTimeout(giftTimer);
  giftTimer = undefined;
  const left = giftCooldownLeftMs(creature);
  if (left <= 0) {
    return;
  }
  giftTimer = window.setTimeout(() => {
    giftTimer = undefined;
    if (!btn.isConnected) {
      return;
    }
    const check = canGift(creature);
    btn.disabled = isVisitorMode() || !check.ok;
    btn.title = check.ok ? "Raise bond" : check.reason;
    note.textContent = giftNoteText(detailNote, check);
    scheduleGiftRefresh(creature, btn, note);
  }, Math.min(1000, left));
}

/**
 * Line under the gift button (#423): the last gift's result, and while the
 * gift is unavailable, why (cooldown or daily cap) — inline, never only a tooltip.
 */
export function giftNoteText(last: string, check: { ok: true } | { ok: false; reason: string }): string {
  if (check.ok) {
    return last;
  }
  return last && last !== check.reason ? `${last} ${check.reason}` : check.reason;
}

/** One creature card: portrait, name, level, type chip, HP bar, bond hearts, nickname edit. */
function buildCreatureCard(
  creature: CreatureInstance,
  selected: boolean,
  onSelect: (id: string) => void,
): HTMLLIElement {
  const def = getCreatureDefinition(creature.definitionId);
  const maxHp = getEffectiveMaxHp(creature);
  const name = partyName(creature);
  const li = document.createElement("li");
  li.className = "party-card";
  li.dataset.instanceId = creature.instanceId;

  const btn = el("button", selected ? "party-creature-btn party-creature-selected" : "party-creature-btn");
  btn.type = "button";
  btn.disabled = isVisitorMode();
  btn.setAttribute("aria-pressed", selected ? "true" : "false");
  btn.setAttribute("aria-label", creatureCardLabel(creature));
  btn.addEventListener("click", () => onSelect(creature.instanceId));

  const portrait = el("span", "party-portrait");
  portrait.setAttribute("aria-hidden", "true");
  // Internal definition id only; names below go through textContent.
  portrait.innerHTML = creatureArtSlot(creature.definitionId, { size: 56 });
  if (isRareVariant(creature)) {
    // Same glow as the finale / share cards (#418); the art keeps its palette.
    portrait.classList.add("party-portrait--rare");
    portrait.style.setProperty("--rare-glow", rareVariantGlowCss(speciesOf(creature), 0.7));
  }

  const main = el("span", "party-card-main");
  // textContent everywhere: nicknames are player input.
  const nameRow = el("span", "party-card-name", name);
  if (isRareVariant(creature)) {
    const rare = el("span", "party-rare", " ✦");
    rare.style.color = rareVariantAccentCss(speciesOf(creature));
    rare.title = "Rare variant";
    nameRow.appendChild(rare);
  }
  const sub = el("span", "party-card-sub");
  const chip = el("span", "party-chip", def.folkloreType);
  chip.dataset.type = def.folkloreType;
  sub.append(chip, el("span", "party-level", `Lv ${creature.level}`));

  const hp = el("span", "party-card-hp");
  hp.dataset.state = hpBarState(creature.currentHp, maxHp);
  const bar = el("span", "party-card-hp-bar");
  const fill = el("span", "party-card-hp-fill");
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, maxHp > 0 ? creature.currentHp / maxHp : 0)) * 100)}%`;
  bar.appendChild(fill);
  hp.append(bar, el("span", "party-card-hp-text", creature.currentHp <= 0 ? "Fainted" : `${creature.currentHp}/${maxHp}`));

  const hearts = bondTier(creature.bond) + 1;
  const bond = el("span", "party-hearts");
  bond.setAttribute("aria-hidden", "true");
  bond.appendChild(document.createTextNode("♥".repeat(hearts)));
  bond.appendChild(el("span", "party-heart-empty", "♥".repeat(BOND_HEARTS - hearts)));

  main.append(nameRow, sub, hp, bond);
  btn.append(portrait, main);

  const rename = el("button", "party-card-rename", "✎");
  rename.type = "button";
  rename.disabled = isVisitorMode();
  rename.setAttribute("aria-label", creature.nickname ? `Rename ${name}` : `Give ${name} a nickname`);
  rename.title = creature.nickname ? "Rename" : "Nickname";
  rename.addEventListener("click", () => {
    void promptNickname(creature).then(() => {
      detailNote = "";
      refreshPartyUi();
    });
  });

  li.append(btn, rename);
  return li;
}

function renderList(
  listEl: HTMLElement,
  creatures: CreatureInstance[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  listEl.replaceChildren();
  if (creatures.length === 0) {
    listEl.appendChild(el("li", "menu-empty party-empty", "None"));
    return;
  }
  for (const creature of creatures) {
    listEl.appendChild(buildCreatureCard(creature, creature.instanceId === selectedId, onSelect));
  }
  void fillCreatureArt(listEl);
}

function refreshPartyUi(): void {
  notifyPartyChanged();
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
  window.clearTimeout(giftTimer);
  giftTimer = undefined;
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
