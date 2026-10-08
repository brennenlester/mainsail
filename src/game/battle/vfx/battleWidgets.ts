import Phaser from "phaser";
import { CARD, CARD_FONT } from "../../ui/encounterCard";
import type { Rect } from "./battleLayout";

/**
 * Battle chrome in the encounter-card style (#404): navy panels with a cream
 * rim, quoted Source Sans 3, rounded cards with hover / focus / press.
 * Widgets are containers built at base size and scaled by the layout's `ui`.
 */

export const INK = CARD.inkCss;

/** Navy card with a soft shadow and cream rim (local coords, top-left at x/y). */
export function drawCardPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  alpha = 0.97,
): void {
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 2, y + 6, w, h, r);
  g.fillStyle(CARD.panel, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(3, CARD.cream, 0.85);
  g.strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(1, CARD.line, 1);
  g.strokeRoundedRect(x + 6, y + 6, w - 12, h - 12, Math.max(4, r - 5));
}

/** Small rounded keycap ("1", "S"); desktop only — callers skip it on touch. */
export function addKeycap(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  dark = false,
): Phaser.GameObjects.Container {
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: CARD_FONT,
      fontSize: "12px",
      fontStyle: "bold",
      color: dark ? CARD.creamCss : INK,
    })
    .setOrigin(0.5);
  const w = Math.max(18, Math.ceil(text.width + 10));
  const g = scene.add.graphics();
  g.fillStyle(dark ? 0xffffff : 0x14243a, dark ? 0.14 : 0.12);
  g.fillRoundedRect(-w / 2, -9, w, 18, 5);
  g.lineStyle(1, dark ? CARD.cream : 0x14243a, 0.45);
  g.strokeRoundedRect(-w / 2, -9, w, 18, 5);
  const cap = scene.add.container(x + w / 2, y, [g, text]);
  cap.setSize(w, 18);
  return cap;
}

/**
 * Fit a one-line label into `maxW` (local px): step the font down to `minPx`,
 * then cut the end behind an ellipsis. Long nicknames never run into chips.
 */
export function fitText(text: Phaser.GameObjects.Text, maxW: number, minPx: number): void {
  const full = text.text;
  let size = Number.parseFloat(String(text.style.fontSize)) || minPx;
  while (text.width > maxW && size > minPx) {
    size -= 1;
    text.setFontSize(size);
  }
  if (text.width <= maxW) {
    return;
  }
  let chars = full.length;
  while (chars > 1 && text.width > maxW) {
    chars -= 1;
    text.setText(`${full.slice(0, chars).trimEnd()}…`);
  }
}

/** True on a fine pointer (mouse): show key hints. Touch screens skip them. */
export function showKeyHints(): boolean {
  return typeof window === "undefined" ? true : (window.matchMedia?.("(pointer: fine)").matches ?? true);
}

export type ToastOptions = {
  ui: number;
  /** Design px. */
  maxW: number;
  originY?: number;
  color?: string;
  fontPx?: number;
  depth?: number;
};

/** In-canvas toast / tip: cream text on a rounded navy pill. */
export function addToast(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  opts: ToastOptions,
): Phaser.GameObjects.Container {
  const pad = { x: 14, y: 8 };
  const text = scene.add
    .text(0, 0, message, {
      fontFamily: CARD_FONT,
      fontSize: `${opts.fontPx ?? 15}px`,
      fontStyle: "bold",
      color: opts.color ?? CARD.creamCss,
      align: "center",
      lineSpacing: 2,
      wordWrap: { width: Math.max(80, opts.maxW / opts.ui - pad.x * 2), useAdvancedWrap: true },
    })
    .setOrigin(0.5);
  const w = text.width + pad.x * 2;
  const h = text.height + pad.y * 2;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(-w / 2 + 1, -h / 2 + 3, w, h, 12);
  g.fillStyle(CARD.panelDeep, 0.95);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.lineStyle(2, CARD.cream, 0.6);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  const originY = opts.originY ?? 0.5;
  const c = scene.add.container(x, y, [g, text]);
  c.setScale(opts.ui);
  // Shift so (x, y) is the requested vertical anchor of the scaled pill.
  c.setY(y + (0.5 - originY) * h * opts.ui);
  c.setDepth(opts.depth ?? 12);
  return c;
}

export type MoveCardData = {
  title: string;
  effect: string;
  effectColor: string;
  sub: string;
  roleColor: number;
  ready: boolean;
  /** Keycap hint ("1"); omitted on touch. */
  key?: string;
};

/**
 * Two-line move card: name + effect, then role · type · extras (wraps to a
 * second line on narrow cards). Disabled while on cooldown.
 */
export class MoveCard {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private readonly h: number;
  private readonly ui: number;
  private hovered = false;
  private pressed = false;
  private dimmed = false;
  private readonly data: MoveCardData;
  private readonly onActivate: () => void;
  private readonly onBlocked?: () => void;
  private homeX = 0;

  constructor(
    scene: Phaser.Scene,
    rect: Rect,
    ui: number,
    data: MoveCardData,
    onActivate: () => void,
    /** Cooling-down card pressed (tap or its 1-5 key): the card already shook. */
    onBlocked?: () => void,
  ) {
    this.scene = scene;
    this.data = data;
    this.onActivate = onActivate;
    this.onBlocked = onBlocked;
    this.ui = ui;
    const w = (this.w = rect.w / ui);
    const h = (this.h = rect.h / ui);
    const ready = data.ready;
    this.bg = scene.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [this.bg];
    const left = -w / 2 + 16;
    let titleX = left;
    if (data.key) {
      const cap = addKeycap(scene, left, -h / 2 + 17, data.key, !ready);
      parts.push(cap);
      titleX += cap.width + 7;
    }
    const effect = scene.add
      .text(w / 2 - 12, -h / 2 + 7, data.effect, {
        fontFamily: CARD_FONT,
        fontSize: "15px",
        fontStyle: "bold",
        color: ready ? data.effectColor : CARD.mutedCss,
      })
      .setOrigin(1, 0);
    const title = scene.add
      .text(titleX, -h / 2 + 6, data.title, {
        fontFamily: CARD_FONT,
        fontSize: `${17}px`,
        fontStyle: "bold",
        color: ready ? INK : CARD.creamCss,
      })
      .setOrigin(0, 0);
    // Tight cards: shrink the effect first, then the name (never below 13).
    const room = (): number => w / 2 - 12 - effect.width - 8 - titleX;
    let effectSize = 15;
    while (title.width > room() && effectSize > 12) {
      effectSize -= 1;
      effect.setFontSize(effectSize);
    }
    let size = 17;
    while (title.width > room() && size > 13) {
      size -= 1;
      title.setFontSize(size);
    }
    if (title.width > room()) {
      // Still tight (small phones): keep the number, drop the matchup words
      // (the effect colour still says hunter / resisted).
      effect.setText(data.effect.split("  ")[0] ?? data.effect);
    }
    // Still tight: wrap the name onto a second line (never below 13px) rather
    // than cutting "Bark Hide" to "Bar…". Only a name that cannot wrap into two
    // lines inside the room is ellipsized.
    let titleLines = 1;
    if (title.width > room()) {
      title.setWordWrapWidth(room(), true);
      if (title.getWrappedText(title.text).length <= 2 && title.width <= room()) {
        titleLines = 2;
      } else {
        title.setWordWrapWidth(null);
        fitText(title, room(), 13);
      }
    }
    const subTop = -h / 2 + (titleLines === 2 ? 40 : 29);
    const lines = Math.max(1, Math.floor((h / 2 - 3 - subTop) / 16));
    const sub = scene.add
      .text(left, subTop, data.sub, {
        fontFamily: CARD_FONT,
        fontSize: "13px",
        color: ready ? "#3e5468" : CARD.mutedCss,
        lineSpacing: 0,
        maxLines: lines,
        wordWrap: { width: w - 28, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);
    // Never cut a sub-label mid-word: drop trailing details behind an ellipsis.
    const pieces = data.sub.split(" · ");
    while (pieces.length > 1 && sub.getWrappedText(sub.text).length > lines) {
      pieces.pop();
      sub.setText(`${pieces.join(" · ")} …`);
    }
    parts.push(title, effect, sub);
    this.container = scene.add.container(rect.x + rect.w / 2, rect.y + rect.h / 2, parts);
    this.container.setScale(ui).setDepth(6).setSize(w, h);
    this.homeX = this.container.x;
    if (!ready) {
      // A cooling-down card still answers a tap: shake + "ready in N" (#409).
      this.container.setInteractive(new Phaser.Geom.Rectangle(-2, -3, w + 4, h + 6), Phaser.Geom.Rectangle.Contains);
      this.container.on("pointerup", () => this.activate());
    }
    if (ready) {
      // Hit area: the face plus a little slack, measured from the size box's top-left.
      this.container.setInteractive(new Phaser.Geom.Rectangle(-2, -3, w + 4, h + 6), Phaser.Geom.Rectangle.Contains);
      if (this.container.input) {
        this.container.input.cursor = "pointer";
      }
      this.container.on("pointerover", () => {
        this.hovered = true;
        this.redraw();
      });
      this.container.on("pointerout", () => {
        this.hovered = false;
        this.pressed = false;
        this.redraw();
      });
      this.container.on("pointerdown", () => {
        this.pressed = true;
        this.redraw();
      });
      this.container.on("pointerup", () => {
        const was = this.pressed;
        this.pressed = false;
        this.redraw();
        if (was) {
          this.activate();
        }
      });
    }
    this.redraw();
  }

  get ready(): boolean {
    return this.data.ready;
  }

  /** Keyboard / tap: pop + run (ignored on cooldown or while dimmed). */
  activate(): void {
    if (this.dimmed) {
      return;
    }
    if (!this.data.ready) {
      this.shake();
      this.onBlocked?.();
      return;
    }
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: this.ui * 0.95, to: this.ui },
      duration: 140,
      ease: "Back.easeOut",
    });
    this.onActivate();
  }

  /** Quick side-to-side jiggle: "not yet". Restores the exact resting x. */
  shake(): void {
    // Always around the home x captured at build time, so rapid presses
    // (a killed tween never runs onComplete) cannot walk the card sideways.
    const restX = this.homeX;
    this.scene.tweens.killTweensOf(this.container);
    this.container.x = restX;
    this.scene.tweens.add({
      targets: this.container,
      x: { from: restX - 6 * this.ui, to: restX + 6 * this.ui },
      duration: 45,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.container.x = restX;
      },
    });
  }

  /** Turn in progress: fade and ignore input until the cards are rebuilt. */
  setDimmed(dimmed: boolean): void {
    this.dimmed = dimmed;
    this.container.setAlpha(dimmed ? 0.5 : 1);
  }

  private redraw(): void {
    const { w, h } = this;
    const ready = this.data.ready;
    const r = 12;
    const lift = ready && this.hovered && !this.pressed ? -2 : 0;
    const press = this.pressed ? 2 : 0;
    const face = !ready ? 0x2a3c52 : this.pressed ? 0xf0e2c4 : this.hovered ? 0xffffff : CARD.cream;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, this.pressed ? 0.18 : 0.3);
    g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    const top = -h / 2 + lift + press;
    g.fillStyle(face, 1);
    g.fillRoundedRect(-w / 2, top, w, h, r);
    g.fillStyle(ready ? this.data.roleColor : 0x5a6e84, 1);
    g.fillRoundedRect(-w / 2, top, 7, h, { tl: r, bl: r, tr: 0, br: 0 });
    g.lineStyle(2, ready ? this.data.roleColor : 0x5a6e84, ready ? 0.95 : 0.8);
    g.strokeRoundedRect(-w / 2, top, w, h, r);
  }
}
