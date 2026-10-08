import Phaser from "phaser";
import type { FolkloreType } from "../creatures/folkloreTypes";

/**
 * Encounter card chrome (#366): palette, chips and a real button widget
 * (hover / focus / press / disabled, touch-sized hit area) that match the
 * dark-navy + cream DOM HUD.
 */

// Quoted: an unquoted family name containing a digit makes the canvas font string invalid.
export const CARD_FONT = '"Source Sans 3", system-ui, sans-serif';

export const CARD = {
  veil: 0x0b1626,
  panel: 0x14243a,
  panelDeep: 0x0e1b2c,
  line: 0x2f4a68,
  cream: 0xfff3dc,
  creamCss: "#fff3dc",
  mutedCss: "#a9bfd4",
  inkCss: "#14243a",
  goldCss: "#ffd98a",
  good: 0x7fd8a0,
  bad: 0xff9a8a,
} as const;

export const TYPE_CHIP_COLORS: Readonly<Record<FolkloreType, number>> = {
  woodland: 0x8fd36a,
  ember: 0xff9a5c,
  water: 0x6cc4ff,
  earth: 0xd4b07a,
  mist: 0xc9d6e8,
  storm: 0xffe06a,
  hearth: 0xffb38a,
  twilight: 0xb79cff,
  fen: 0x9ccf8a,
  "will-o-wisp": 0x9ff0e0,
};

export type ButtonTone = "primary" | "secondary" | "ghost";

const TONES: Readonly<Record<ButtonTone, { fill: number; hover: number; press: number; text: string; stroke: number }>> = {
  primary: { fill: 0xffc2a8, hover: 0xffd4c0, press: 0xf0a88c, text: "#2a1a14", stroke: 0xfff3dc },
  secondary: { fill: 0x8fd3f0, hover: 0xaee0f5, press: 0x74bfe0, text: "#0e1b2c", stroke: 0xfff3dc },
  ghost: { fill: 0x1d3250, hover: 0x26405f, press: 0x172a44, text: "#fff3dc", stroke: 0x6e8db0 },
};

/** Draw a rounded pill chip; returns the container (origin = center). */
export function addChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  fill: number,
  textColor: string = CARD.inkCss,
  fontSize = 16,
  /** Texture key of a small icon drawn inside the chip's left end. */
  iconKey?: string,
): Phaser.GameObjects.Container {
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: CARD_FONT,
      fontSize: `${fontSize}px`,
      fontStyle: "bold",
      color: textColor,
    })
    .setOrigin(0.5);
  const iconSize = iconKey ? Math.round(fontSize * 1.6) : 0;
  const w = Math.ceil(text.width + 22 + (iconKey ? iconSize + 2 : 0));
  const h = Math.ceil(text.height + 8);
  const bg = scene.add.graphics();
  bg.fillStyle(fill, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const parts: Phaser.GameObjects.GameObject[] = [bg, text];
  if (iconKey) {
    text.setX((iconSize + 2) / 2);
    parts.push(scene.add.image(-w / 2 + 8 + iconSize / 2, 0, iconKey).setDisplaySize(iconSize, iconSize));
  }
  const chip = scene.add.container(x, y, parts);
  chip.setSize(w, h);
  return chip;
}

export type CardButtonOptions = {
  width: number;
  height: number;
  label: string;
  tone: ButtonTone;
  /** Small keycap hint (e.g. "1"); hidden on narrow layouts by the caller. */
  key?: string;
  onActivate: () => void;
};

/** Rounded game button with hover / focus / press / disabled states. */
export class CardButton {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly keyText?: Phaser.GameObjects.Text;
  private hovered = false;
  private pressed = false;
  private focused = false;
  private enabled = true;
  private readonly baseY: number;
  /** Layout scale (battle chrome scales buttons with the stage). */
  private uiScale = 1;
  private readonly scene: Phaser.Scene;
  private readonly opts: CardButtonOptions;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: CardButtonOptions) {
    this.scene = scene;
    this.opts = opts;
    const { width: w, height: h } = opts;
    this.baseY = y;
    this.ring = scene.add.graphics();
    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, opts.label, {
        fontFamily: CARD_FONT,
        fontSize: "21px",
        fontStyle: "bold",
        color: TONES[opts.tone].text,
        align: "center",
      })
      .setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [this.ring, this.bg, this.text];
    if (opts.key) {
      this.keyText = scene.add
        .text(w / 2 - 10, -h / 2 + 7, opts.key, {
          fontFamily: CARD_FONT,
          fontSize: "12px",
          fontStyle: "bold",
          color: TONES[opts.tone].text,
        })
        .setOrigin(1, 0)
        .setAlpha(0.55);
      parts.push(this.keyText);
    }
    this.container = scene.add.container(x, y, parts);
    this.container.setSize(w, h);
    // Hit area overshoots the face so phone taps (~0.53× scale) stay forgiving.
    // Container hit areas are measured from the top-left of its size box.
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-4, -10, w + 8, h + 20),
      Phaser.Geom.Rectangle.Contains,
    );
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
      const wasPressed = this.pressed;
      this.pressed = false;
      this.redraw();
      if (wasPressed) {
        this.activate();
      }
    });
    this.fitLabel();
    this.redraw();
  }

  activate(): void {
    if (!this.enabled) {
      return;
    }
    // Brief press pop so keyboard activation reads the same as a tap.
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: this.uiScale * 0.95, to: this.uiScale },
      duration: 140,
      ease: "Back.easeOut",
    });
    this.opts.onActivate();
  }

  /** Scale the whole button (hit area included) for the current layout. */
  setUiScale(scale: number): this {
    this.uiScale = scale;
    this.container.setScale(scale);
    return this;
  }

  setLabel(label: string): void {
    this.text.setText(label);
    this.fitLabel();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.container.setAlpha(enabled ? 1 : 0.42);
    if (this.container.input) {
      this.container.input.cursor = enabled ? "pointer" : "default";
    }
    this.redraw();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.redraw();
  }

  /** Shrink long labels ("Befriend (assured)") to fit the button. */
  private fitLabel(): void {
    const max = this.opts.width - 20;
    let size = 21;
    this.text.setFontSize(size);
    while (this.text.width > max && size > 14) {
      size -= 1;
      this.text.setFontSize(size);
    }
  }

  private redraw(): void {
    const { width: w, height: h, tone } = this.opts;
    const palette = TONES[tone];
    const active = this.enabled;
    const fill = !active
      ? palette.fill
      : this.pressed
        ? palette.press
        : this.hovered || this.focused
          ? palette.hover
          : palette.fill;
    const lift = active && this.hovered && !this.pressed ? -2 : 0;
    const r = Math.min(18, h / 2);
    this.bg.clear();
    // Drop shadow, then face.
    this.bg.fillStyle(0x000000, this.pressed ? 0.18 : 0.32);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r);
    this.bg.fillStyle(fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + lift + (this.pressed ? 2 : 0), w, h, r);
    // Top highlight for a little depth.
    this.bg.fillStyle(0xffffff, tone === "ghost" ? 0.05 : 0.22);
    this.bg.fillRoundedRect(-w / 2 + 4, -h / 2 + lift + 3, w - 8, h * 0.38, {
      tl: r - 3,
      tr: r - 3,
      bl: 6,
      br: 6,
    });
    this.bg.lineStyle(2, palette.stroke, tone === "ghost" ? 0.9 : 0.35);
    this.bg.strokeRoundedRect(-w / 2, -h / 2 + lift + (this.pressed ? 2 : 0), w, h, r);
    this.text.setY(lift + (this.pressed ? 2 : 0));
    this.keyText?.setY(-h / 2 + 7 + lift);

    this.ring.clear();
    if (this.focused && active) {
      this.ring.lineStyle(3, CARD.cream, 1);
      this.ring.strokeRoundedRect(-w / 2 - 5, -h / 2 - 5 + lift, w + 10, h + 10, r + 5);
    }
    this.container.setY(this.baseY);
  }
}
