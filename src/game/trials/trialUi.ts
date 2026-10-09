import type Phaser from "phaser";
import "./trials.css";
import { creatureArtSlot, fillCreatureArt } from "../ui/creatureArt";
import { getTopOverlayId, popOverlay, pushOverlay } from "../ui/overlayStack";
import { isTouchControlsEnabled, setTouchControlsEnabled } from "../ui/touchControls";
import { BOONS, boonThisRoundText, type BoonId } from "./boons";
import { MODIFIERS, type ModifierId } from "./modifiers";

/**
 * Eclipse Trial DOM screens (#420): round preview, boon pick, results. All
 * dynamic text goes through textContent. While a screen is up the game's
 * keyboard is muted (like the share sheet) and keys map to the buttons:
 * Enter = primary, 1-3 = boon cards, 4 / S = skip, Esc = the screen's back.
 */

export type PipState = "done" | "lost" | "now" | "todo";

export type PreviewView = {
  kicker: string;
  pips: PipState[];
  score: number;
  banner: string;
  foeLine: string;
  foeId: string;
  mods: readonly ModifierId[];
  /** Boons shaping this round. */
  boons: readonly BoonId[];
  note?: string;
  animate: boolean;
};

export type BoonView = {
  kicker: string;
  pips: PipState[];
  score: number;
  banner: string;
  sub: string;
  party: { name: string; hp: number; max: number }[];
  nextLine: string;
  nextMods: readonly ModifierId[];
  offers: readonly BoonId[];
  skipPoints: number;
  animate: boolean;
};

export type ResultsView = {
  kicker: string;
  pips: PipState[];
  title: string;
  score: number;
  breakdown: [string, string][];
  rewards: string[];
  lines: string[];
  animate: boolean;
};

type Button = { label: string; variant?: "primary" | "quiet"; onClick: () => void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

const OVERLAY_ID = "trial-overlay";

export class TrialOverlay {
  readonly root: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private keyMap = new Map<string, () => void>();
  private escape: (() => void) | null = null;
  private visible = false;
  private touchWasEnabled = false;
  /** Results card image (set by the scene once the PNG is painted). */
  cardImage: HTMLImageElement | null = null;
  status: HTMLParagraphElement | null = null;
  private readonly game: Phaser.Game | null;

  constructor(game: Phaser.Game | null) {
    this.game = game;
    document.getElementById(OVERLAY_ID)?.remove();
    this.root = el("div", "trial-overlay");
    this.root.id = OVERLAY_ID;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "trial-title");
    this.root.hidden = true;
    this.sheet = el("div", "trial-sheet");
    this.root.append(this.sheet);
    // Phaser listens on window for pointer up/down: keep taps on the sheet off the canvas.
    for (const type of ["mousedown", "mouseup", "touchstart", "touchend", "touchcancel"] as const) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    (document.getElementById("app") ?? document.body).append(this.root);
    window.addEventListener("keydown", this.onKey, true);
  }

  private onKey = (event: KeyboardEvent): void => {
    if (
      !this.visible ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      // The share sheet (or anything else) open on top owns the keys.
      getTopOverlayId() !== OVERLAY_ID
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "escape") {
      // overlayStack routes Esc to `close`.
      return;
    }
    const action = this.keyMap.get(key);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  };

  show(): void {
    if (this.visible) {
      return;
    }
    this.visible = true;
    this.root.hidden = false;
    document.getElementById("playfield")?.setAttribute("inert", "");
    const keyboard = this.game?.input?.keyboard;
    if (keyboard) {
      keyboard.enabled = false;
    }
    this.touchWasEnabled = isTouchControlsEnabled();
    setTouchControlsEnabled(false);
    pushOverlay(OVERLAY_ID, () => this.escape?.());
  }

  /** Battles own the screen between trial screens. */
  hide(): void {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.root.hidden = true;
    popOverlay(OVERLAY_ID);
    document.getElementById("playfield")?.removeAttribute("inert");
    const keyboard = this.game?.input?.keyboard;
    if (keyboard) {
      keyboard.enabled = true;
      for (const scene of this.game?.scene.getScenes(true) ?? []) {
        scene.input.keyboard?.resetKeys();
      }
    }
    if (this.touchWasEnabled) {
      setTouchControlsEnabled(true);
    }
  }

  destroy(): void {
    this.hide();
    window.removeEventListener("keydown", this.onKey, true);
    if (this.cardImage?.src.startsWith("blob:")) {
      URL.revokeObjectURL(this.cardImage.src);
    }
    this.root.remove();
  }

  private reset(animate: boolean, escape: (() => void) | null): void {
    this.sheet.replaceChildren();
    this.sheet.classList.toggle("trial-anim", animate);
    this.keyMap = new Map();
    this.escape = escape;
    this.cardImage = null;
    this.status = null;
    this.show();
    this.root.scrollTop = 0;
  }

  private header(kicker: string, pips: PipState[], score: number | null): void {
    const head = el("div", "trial-head");
    head.append(el("span", "trial-kicker", kicker));
    const list = el("ol", "trial-pips");
    list.setAttribute("aria-label", "Rounds");
    pips.forEach((state, i) => {
      const pip = el("li", `trial-pip trial-pip--${state}${i === pips.length - 1 ? " trial-pip--boss" : ""}`);
      pip.setAttribute("aria-label", `Round ${i + 1}: ${state === "todo" ? "ahead" : state}`);
      list.append(pip);
    });
    head.append(list);
    if (score !== null) {
      head.append(el("span", "trial-score", `★ ${score.toLocaleString("en-US")}`));
    }
    this.sheet.append(head);
  }

  private banner(title: string, sub: string): void {
    const box = el("div", "trial-banner");
    const h = el("h2", "", title);
    h.id = "trial-title";
    box.append(h);
    if (sub) {
      box.append(el("p", "", sub));
    }
    this.sheet.append(box);
  }

  private modifiers(label: string, ids: readonly ModifierId[]): void {
    if (ids.length === 0) {
      return;
    }
    this.sheet.append(el("p", "trial-section-label", label));
    const list = el("ul", "trial-mods");
    for (const id of ids) {
      const def = MODIFIERS[id];
      const item = el("li", "trial-mod");
      const glyph = el("span", "trial-glyph", def.glyph);
      glyph.style.background = def.color;
      glyph.setAttribute("aria-hidden", "true");
      const text = el("span", "");
      text.append(el("span", "trial-mod-name", def.name), el("span", "trial-mod-text", def.summary));
      item.append(glyph, text);
      list.append(item);
    }
    this.sheet.append(list);
  }

  private chips(ids: readonly ModifierId[]): HTMLElement {
    const row = el("div", "trial-chips");
    for (const id of ids) {
      const chip = el("span", "trial-chip", MODIFIERS[id].chip);
      chip.style.background = MODIFIERS[id].color;
      chip.title = MODIFIERS[id].summary;
      row.append(chip);
    }
    return row;
  }

  private actions(buttons: Button[]): HTMLButtonElement[] {
    const row = el("div", "trial-actions");
    const made = buttons.map((spec) => {
      const button = el("button", `trial-btn${spec.variant ? ` trial-btn--${spec.variant}` : ""}`, spec.label);
      button.type = "button";
      button.addEventListener("click", () => spec.onClick());
      row.append(button);
      if (spec.variant === "primary") {
        this.keyMap.set("enter", spec.onClick);
      }
      return button;
    });
    this.sheet.append(row);
    // No scroll-to-focus: a tall sheet on a short screen must open at its heading (#423).
    made[0]?.focus({ preventScroll: true });
    return made;
  }

  renderPreview(view: PreviewView, onBegin: () => void, onLeave: () => void): void {
    this.reset(view.animate, onLeave);
    this.header(view.kicker, view.pips, view.score);
    this.banner(view.banner, view.foeLine);
    const foe = el("div", "trial-foe");
    foe.innerHTML = creatureArtSlot(view.foeId, { size: 96 });
    this.sheet.append(foe);
    void fillCreatureArt(foe);
    if (view.note) {
      this.sheet.append(el("p", "trial-note", view.note));
    }
    this.modifiers("Eclipse modifiers", view.mods);
    if (view.boons.length > 0) {
      this.sheet.append(el("p", "trial-section-label", "Your boon this round"));
      this.sheet.append(el("p", "trial-note", view.boons.map(boonThisRoundText).join(" ")));
    }
    this.actions([
      { label: "Begin round", variant: "primary", onClick: onBegin },
      { label: "Leave trial", variant: "quiet", onClick: onLeave },
    ]);
  }

  renderBoon(view: BoonView, onPick: (id: BoonId | null) => void, onLeave: () => void): void {
    this.reset(view.animate, onLeave);
    this.header(view.kicker, view.pips, view.score);
    this.banner(view.banner, view.sub);
    const party = el("div", "trial-party");
    for (const member of view.party) {
      const row = el("div", "trial-hp");
      row.append(el("span", "", `${member.name} ${member.hp}/${member.max}`));
      const bar = el("div", "trial-hp-bar");
      const fill = el("span", "");
      const ratio = member.max > 0 ? member.hp / member.max : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.style.background = ratio > 0.5 ? "#6cd86a" : ratio > 0.25 ? "#f2c94c" : "#eb5757";
      bar.append(fill);
      row.append(bar);
      party.append(row);
    }
    this.sheet.append(party);
    this.sheet.append(el("p", "trial-section-label", view.nextLine));
    this.sheet.append(this.chips(view.nextMods));
    this.sheet.append(el("p", "trial-section-label", "Choose a boon"));
    const grid = el("div", "trial-boons");
    view.offers.forEach((id, i) => {
      const def = BOONS[id];
      const card = el("button", "trial-boon");
      card.type = "button";
      card.dataset.boon = id;
      const key = el("span", "trial-boon-key", String(i + 1));
      key.setAttribute("aria-hidden", "true");
      const glyph = el("span", "trial-glyph", def.glyph);
      glyph.style.background = def.color;
      glyph.setAttribute("aria-hidden", "true");
      const text = el("span", "");
      text.append(el("span", "trial-boon-name", def.name), el("br", ""), el("span", "trial-boon-text", def.summary));
      card.append(key, glyph, text);
      card.setAttribute("aria-label", `${i + 1}: ${def.name}. ${def.summary}`);
      card.addEventListener("click", () => onPick(id));
      this.keyMap.set(String(i + 1), () => onPick(id));
      grid.append(card);
    });
    this.sheet.append(grid);
    const skip = (): void => onPick(null);
    this.keyMap.set("4", skip);
    this.keyMap.set("s", skip);
    const [skipBtn] = this.actions([
      { label: `Skip boon (+${view.skipPoints} score)`, variant: "quiet", onClick: skip },
    ]);
    skipBtn?.setAttribute("aria-keyshortcuts", "4 S");
    (grid.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  renderResults(view: ResultsView, buttons: Button[]): void {
    this.reset(view.animate, buttons.find((b) => b.variant !== "primary")?.onClick ?? buttons[0]?.onClick ?? null);
    this.header(view.kicker, view.pips, null);
    const title = el("h2", "trial-result-title", view.title);
    title.id = "trial-title";
    this.sheet.append(title, el("p", "trial-result-score", view.score.toLocaleString("en-US")));
    const dl = el("dl", "trial-breakdown");
    for (const [label, value] of view.breakdown) {
      dl.append(el("dt", "", label), el("dd", "", value));
    }
    this.sheet.append(dl);
    if (view.rewards.length > 0) {
      const list = el("ul", "trial-rewards");
      for (const line of view.rewards) {
        list.append(el("li", "", line));
      }
      this.sheet.append(list);
    }
    for (const line of view.lines) {
      this.sheet.append(el("p", "trial-note", line));
    }
    const img = el("img", "trial-card-img");
    img.alt = "Eclipse Trial result card";
    img.hidden = true;
    this.sheet.append(img);
    this.cardImage = img;
    this.actions(buttons);
    const status = el("p", "trial-status");
    status.setAttribute("role", "status");
    this.sheet.append(status);
    this.status = status;
  }

  renderMessage(title: string, text: string, onBack: () => void): void {
    this.reset(false, onBack);
    this.banner(title, text);
    this.actions([{ label: "Back", variant: "primary", onClick: onBack }]);
  }

  /** Show the painted result card (dropped if the screen moved on). */
  showCard(blob: Blob): void {
    const img = this.cardImage;
    if (!img || !img.isConnected) {
      return;
    }
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
  }
}
