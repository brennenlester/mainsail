import Phaser from "phaser";
import { playUiClickSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import type { CreatureInstance } from "../creatures/types";
import { ensureCreatureTextures } from "../creatures/sprites";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { rareVariantTint } from "../share/rareVariant";
import {
  isCompanionShareAvailable,
  openCompanionShare,
} from "../share/shareActions";
import {
  buildFinaleRecap,
  finaleShareParty,
  type FinaleCompanion,
  type FinaleRecap,
} from "./finaleRecap";

export const FINALE_SCENE_KEY = "FinaleScene";

export type FinaleSceneData = {
  playerName: string | null | undefined;
  party: readonly CreatureInstance[];
  /** Scene paused under the card; resumed on "Keep exploring". */
  returnTo?: string;
  onContinue?: () => void;
};

const SERIF = '"Fraunces", Georgia, serif';
const SANS = '"Source Sans 3", system-ui, sans-serif';
const GOLD = 0xf0c878;
const NAVY = 0x1a3048;
const CELL_W = 136;
const CELL_H = 150;
const CELL_GAP = 12;

/** Credits-style closing card with a companion recap and Share (#393). */
export class FinaleScene extends Phaser.Scene {
  private data_!: FinaleSceneData;
  private recap!: FinaleRecap;
  private leaving = false;

  constructor() {
    super({ key: FINALE_SCENE_KEY });
  }

  init(data: FinaleSceneData): void {
    this.data_ = data;
    this.recap = buildFinaleRecap(data);
    this.leaving = false;
  }

  create(): void {
    bindOverlayPixelRatio(this);
    ensureFxTextures(this);
    ensureCreatureTextures(this);
    const rm = prefersReducedMotion();
    const cx = DESIGN_SIZE / 2;

    this.add.rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x0d1a2e, 0.97).setOrigin(0).setInteractive();
    if (effectsEnabled()) {
      this.add.particles(0, 0, FX_TEX.glow, {
        x: { min: 0, max: DESIGN_SIZE },
        y: { min: 0, max: DESIGN_SIZE },
        frequency: 220,
        lifespan: 5000,
        speedY: rm ? 0 : { min: -14, max: -4 },
        scale: { start: 0.4, end: 1.1 },
        alpha: { start: 0, end: 0.35, ease: "Sine.easeInOut" },
        tint: [GOLD, 0x6eb8a8, 0xfff8ec],
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 26,
      });
    }

    const header = this.add.container(0, 0, [
      this.add
        .text(cx, 50, this.recap.title.toUpperCase(), {
          fontFamily: SANS,
          fontSize: "16px",
          fontStyle: "bold",
          color: "#f0c878",
          letterSpacing: 8,
        })
        .setOrigin(0.5),
      this.add
        .text(cx, 92, this.recap.tagline, {
          fontFamily: SERIF,
          fontSize: "42px",
          fontStyle: "bold",
          color: "#fff8ec",
        })
        .setOrigin(0.5),
      this.add
        .text(cx, 136, this.recap.heading, {
          fontFamily: SERIF,
          fontSize: "19px",
          color: "#e8d8c0",
        })
        .setOrigin(0.5),
    ]);

    const cells = this.layoutCells(cx, 166);
    const footerY = 166 + 2 * CELL_H + CELL_GAP + 26;
    const summaryText = this.recap.overflow > 0
      ? `${this.recap.summary} · +${this.recap.overflow} more`
      : this.recap.summary;
    const summary = this.add
      .text(cx, footerY, summaryText, {
        fontFamily: SANS,
        fontSize: "15px",
        color: "#c9eee1",
        align: "center",
        wordWrap: { width: DESIGN_SIZE - 48 },
      })
      .setOrigin(0.5);

    const buttons: Phaser.GameObjects.Text[] = [];
    const btnY = footerY + 52;
    const share = isCompanionShareAvailable() && this.recap.companions.length > 0;
    if (share) {
      buttons.push(
        this.button(cx - 100, btnY, "Share your companions", true, () => {
          playUiClickSfx(this);
          void openCompanionShare({
            creatures: finaleShareParty(this.recap, this.data_.party),
            title: "Share your companions",
            subtitle: "Your whole journey on one card — friends can challenge it from the link.",
          });
        }),
      );
    }
    buttons.push(this.button(share ? cx + 128 : cx, btnY, "Keep exploring", !share, () => this.finish()));

    // Entrance: header, then the cells, then the call to action.
    const all = [header, ...cells, summary, ...buttons];
    for (const obj of all) obj.setAlpha(0);
    this.tweens.add({ targets: header, alpha: 1, duration: 600 });
    cells.forEach((cell, i) => {
      const y = cell.y;
      if (!rm) cell.setY(y + 16);
      this.tweens.add({ targets: cell, alpha: 1, y, delay: 350 + i * 90, duration: 420, ease: "Cubic.easeOut" });
    });
    const tail = 350 + cells.length * 90 + 200;
    this.tweens.add({ targets: [summary, ...buttons], alpha: 1, delay: tail, duration: 400 });

    this.input.keyboard?.on("keydown-ESC", () => this.finish());
    this.input.keyboard?.on("keydown-ENTER", () => this.finish());
  }

  private layoutCells(cx: number, top: number): Phaser.GameObjects.Container[] {
    const list = this.recap.companions;
    const rows = list.length > 4 ? [list.slice(0, 4), list.slice(4)] : [list];
    const out: Phaser.GameObjects.Container[] = [];
    rows.forEach((row, r) => {
      const width = row.length * CELL_W + (row.length - 1) * CELL_GAP;
      row.forEach((companion, i) => {
        const x = cx - width / 2 + CELL_W / 2 + i * (CELL_W + CELL_GAP);
        const y = top + CELL_H / 2 + r * (CELL_H + CELL_GAP) + (rows.length === 1 ? CELL_H / 2 : 0);
        out.push(this.cell(x, y, companion));
      });
    });
    return out;
  }

  private cell(x: number, y: number, c: FinaleCompanion): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, CELL_W, CELL_H, NAVY, 0.92).setStrokeStyle(2, c.rare ? 0xd4b0ff : GOLD, 0.7);
    const glow = this.add.image(0, -28, FX_TEX.halo).setTint(GOLD).setAlpha(0.22).setScale(1.1).setBlendMode(Phaser.BlendModes.ADD);
    const spriteKey = getCreatureDefinition(c.definitionId).spriteKey;
    const [key, frame] = resolveCreaturePoseTexture(this, spriteKey, "encounter");
    const sprite = this.add.image(0, -28, key, frame);
    const fit = Math.min(88 / Math.max(1, sprite.width), 88 / Math.max(1, sprite.height));
    sprite.setScale(fit);
    if (c.rare) sprite.setTint(rareVariantTint(c.definitionId));
    const name = this.add
      .text(0, 26, c.name, { fontFamily: SANS, fontSize: "15px", fontStyle: "bold", color: "#fff8ec" })
      .setOrigin(0.5);
    if (name.width > CELL_W - 12) name.setScale((CELL_W - 12) / name.width);
    const tags = [c.evolved ? "grown" : "", c.presence ? "presence" : ""].filter(Boolean).join(" · ");
    const meta = this.add
      .text(0, 42, `Lv ${c.level}  ${"♥".repeat(c.hearts)}${tags ? `\n${tags}` : ""}`, {
        fontFamily: SANS,
        fontSize: "12px",
        color: "#f0c878",
        align: "center",
      })
      .setOrigin(0.5, 0);
    return this.add.container(x, y, [bg, glow, sprite, name, meta]);
  }

  private button(x: number, y: number, label: string, primary: boolean, onClick: () => void): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: SANS,
        fontSize: primary ? "19px" : "16px",
        fontStyle: "bold",
        color: primary ? "#1a1a2e" : "#fff8ec",
        backgroundColor: primary ? "#ffedb0" : "#42658d",
        padding: { x: primary ? 22 : 16, y: 11 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  private finish(): void {
    if (this.leaving) return;
    this.leaving = true;
    const { returnTo, onContinue } = this.data_;
    this.scene.stop();
    if (returnTo && this.scene.manager.keys[returnTo]) {
      this.scene.resume(returnTo);
    }
    onContinue?.();
  }
}
