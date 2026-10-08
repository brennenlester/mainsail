import Phaser from "phaser";
import { playBossStingSfx } from "../../audio/gameAudio";
import { BATTLE_CREATURE_DISPLAY, NPC_DISPLAY } from "../../render/displaySizes";
import { getCreatureDefinition } from "../../creatures/catalog";
import { resolveCreaturePoseTexture } from "../../creatures/creaturePoses";
import { hasWorldTexture } from "../../render/imagineAssets";
import { ensureFxTextures, FX_TEX } from "../../render/fx/fxTextures";
import { arenaLayerKeys, type ArenaVariant } from "../../render/arenaLayers";
import { applyNpcSprite } from "../../render/worldTextures";
import type { BossForm } from "../../story/storySpars";
import { RIVAL_NPC_ID } from "../../story/storySpars";
import { getNpcById } from "../../world/npcs";
import type { BattleFx } from "../vfx/battleFx";
import type { AssistAction, IntentNote, StoryBattle } from "./storyBattle";
import { WARD_CHIP_FONT_PX, WARD_CHIP_TEXT, WARD_HINT_FONT_PX, wardHintText } from "./wardHint";

/**
 * Story battle presentation (#385): boss bar with phase pips, VS banner,
 * transformation, signature warning, Wren's assist card, ember ambience and
 * the boss arena. BattleScene keeps the rules; this only draws.
 */

const HUD_FONT = '"Source Sans 3", system-ui, sans-serif';
const DEPTH_BANNER = 9_990;
export const BOSS_BAR = { x: 70, y: 40, width: 500, barWidth: 400 } as const;
/** The boss intent plate sits under the wide boss bar. */
export const STORY_INTENT_Y = 112;
/** Boss art is drawn larger than a wild. */
const BOSS_SCALE = 1.3;

/** Ember arena PNGs ship standalone (not atlas frames) and load only for the boss. */
export function storyArenaVariant(battle: StoryBattle): ArenaVariant {
  return battle.def.theme === "boss" ? "ember" : "village";
}

export function preloadStoryArena(scene: Phaser.Scene, variant: ArenaVariant): void {
  if (variant !== "ember") {
    return;
  }
  const keys = arenaLayerKeys(variant);
  for (const key of Object.values(keys)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `assets/world/${key}.png`);
    }
  }
}

/** HpHud-compatible plate, wider, with phase pips. */
export type StoryHud = {
  name: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  chips: Phaser.GameObjects.Text[];
  chipX: number;
  chipY: number;
  barWidth: number;
};

export class StoryBattleUi {
  private readonly scene: Phaser.Scene;
  private readonly battle: StoryBattle;
  private readonly fx: BattleFx;
  private pips: Phaser.GameObjects.Text[] = [];
  private phaseLabel?: Phaser.GameObjects.Text;
  private warning: Phaser.GameObjects.GameObject[] = [];
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, battle: StoryBattle, fx: BattleFx) {
    this.scene = scene;
    this.battle = battle;
    this.fx = fx;
    ensureFxTextures(scene);
  }

  private get motion(): { particles: boolean; reduced: boolean; fast: boolean } {
    const mode = this.fx.mode();
    return { particles: mode.particles && !mode.fast, reduced: mode.reducedMotion, fast: mode.fast };
  }

  /** Boss art: bigger, tinted per form. Call before fx.setHome. */
  decorateFoe(sprite: Phaser.GameObjects.Sprite): void {
    const art = this.customArt();
    const key = art ?? getCreatureDefinition(this.battle.spriteCreatureId).spriteKey;
    sprite.setTexture(...resolveCreaturePoseTexture(this.scene, key, "battle"));
    const scale = this.battle.isBoss ? BOSS_SCALE : 1;
    sprite.setDisplaySize(BATTLE_CREATURE_DISPLAY.width * scale, BATTLE_CREATURE_DISPLAY.height * scale);
    this.applyFoeTint(sprite);
  }

  /**
   * Bespoke art key for the foe when its frames are loaded (#392:
   * `creature-cinder-matriarch[-phase2]` + `-battle`), else null (species
   * art + form tint).
   */
  private customArt(): string | null {
    const key = this.battle.foeArtKey;
    return key && (hasWorldTexture(this.scene, key) || hasWorldTexture(this.scene, `${key}-battle`))
      ? key
      : null;
  }

  applyFoeTint(sprite: Phaser.GameObjects.Sprite): void {
    const tint = this.customArt() ? null : (this.battle.form?.tint ?? null);
    if (tint === null) {
      sprite.clearTint();
    } else {
      sprite.setTint(tint);
    }
  }

  /** Wide boss bar with a pip per form threshold ("II" marks the next form). */
  createHud(): StoryHud {
    const s = this.scene;
    const { x, y, width, barWidth } = BOSS_BAR;
    const boss = this.battle.isBoss;
    s.add
      .rectangle(x, y, width, 62, 0x140c14, 0.88)
      .setOrigin(0)
      .setStrokeStyle(2, boss ? 0xff7a3a : 0xd8603c, 0.95)
      .setDepth(4);
    const name = s.add
      .text(x + 12, y + 6, "", { color: "#fff0d8", fontFamily: HUD_FONT, fontSize: "15px", fontStyle: "bold" })
      .setDepth(5);
    const barX = x + 12;
    const barY = y + 34;
    s.add.rectangle(barX, barY, barWidth, 12, 0x2a1c22, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000, 0.7).setDepth(5);
    const bar = s.add.rectangle(barX, barY, barWidth, 12, 0xff7a3a, 1).setOrigin(0, 0.5).setDepth(6);
    const hp = s.add
      .text(x + width - 12, barY, "", { color: "#ffe8c8", fontFamily: HUD_FONT, fontSize: "13px", fontStyle: "bold" })
      .setOrigin(1, 0.5)
      .setDepth(6);
    this.pips = this.battle.phaseMarks.map((mark, i) => {
      const px = barX + barWidth * mark;
      s.add.rectangle(px, barY, 3, 18, 0xffe45a, 1).setDepth(7);
      return s.add
        .text(px, barY - 14, ["II", "III", "IV"][i] ?? "", {
          color: "#ffe45a",
          fontFamily: HUD_FONT,
          fontSize: "11px",
          fontStyle: "bold",
          stroke: "#140c14",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(7);
    });
    if (boss) {
      this.phaseLabel = s.add
        .text(x + width - 12, y + 6, "", { color: "#ffb070", fontFamily: HUD_FONT, fontSize: "13px", fontStyle: "bold" })
        .setOrigin(1, 0)
        .setDepth(5);
    }
    this.syncPhase();
    this.createWardRow();
    return { name, hp, bar, chips: [], chipX: x + 12, chipY: y + 52, barWidth };
  }

  /**
   * Hearth Ward chip by the boss bar (#399): it changes the foe, so it sits
   * with the foe's plate, sized to stay >= 11 CSS px on a 360 px phone
   * (640 design px -> 0.5625x), plus a quiet "tries until it strengthens" line.
   */
  private createWardRow(): void {
    if (this.battle.ward >= 1) {
      return;
    }
    const s = this.scene;
    const y = BOSS_BAR.y - 18;
    const chip = s.add
      .text(BOSS_BAR.x, y, WARD_CHIP_TEXT, {
        color: "#101820",
        backgroundColor: "#ffd27a",
        fontFamily: HUD_FONT,
        fontSize: `${WARD_CHIP_FONT_PX}px`,
        fontStyle: "bold",
        padding: { x: 8, y: 2 },
      })
      .setOrigin(0, 0.5)
      .setDepth(6);
    const hint = wardHintText(this.battle.wardNextIn);
    if (hint) {
      s.add
        .text(BOSS_BAR.x + chip.width + 10, y, hint, {
          color: "#ffe8c8",
          fontFamily: HUD_FONT,
          fontSize: `${WARD_HINT_FONT_PX}px`,
          fontStyle: "italic",
          stroke: "#140c14",
          strokeThickness: 4,
        })
        .setOrigin(0, 0.5)
        .setAlpha(0.8)
        .setDepth(6);
    }
  }

  /** Phase label + spent pips after a transformation. */
  syncPhase(): void {
    const form = this.battle.form;
    if (this.phaseLabel && form) {
      const total = this.battle.def.boss?.forms.length ?? 1;
      this.phaseLabel.setText(`Phase ${this.battle.formIndex + 1}/${total} · ${form.label}`);
    }
    this.pips.forEach((pip, i) => pip.setAlpha(i < this.battle.formIndex ? 0.35 : 1));
  }

  /** Story chips on the foe plate: Doused on a soaked Cinder form (the ward has its own row). */
  extraChips(side: "wild" | "player"): { text: string; color: string }[] {
    if (side === "player") {
      return [];
    }
    return this.battle.isDoused ? [{ text: "DOUSED", color: "#9ad8ff" }] : [];
  }

  /** Extra words on the intent plate for the boss's special beats. */
  intentDetail(note: IntentNote, detail: string): string {
    switch (note) {
      case "signature":
        // Short on purpose: the plate must fit at phone width (#385 review).
        return "SIGNATURE · Guard!";
      case "charge":
        return "winding up — Cinderfall NEXT turn. Save your Guard!";
      case "stagger":
        return "reeling — exposed, your hits land harder!";
      default:
        return detail;
    }
  }

  /** VS banner with the story title; returns ms until input. */
  playIntro(playerName: string): number {
    playBossStingSfx(this.scene);
    const ms = this.fx.vsBanner(playerName, this.battle.def.title);
    if (this.battle.isBoss) {
      this.startEmbers();
    }
    return ms;
  }

  private ensureBurst(): Phaser.GameObjects.Particles.ParticleEmitter {
    if (!this.burst) {
      this.burst = this.scene.add
        .particles(0, 0, FX_TEX.glow, {
          emitting: false,
          speed: { min: 120, max: 380 },
          angle: { min: 0, max: 360 },
          gravityY: -120,
          lifespan: { min: 500, max: 1100 },
          scale: { start: 1.1, end: 0 },
          tint: [0xffe080, 0xff9a2a, 0xff4a1a],
          blendMode: Phaser.BlendModes.ADD,
          maxParticles: 120,
        })
        .setDepth(9);
    }
    return this.burst;
  }

  /** Rising embers over the boss arena. */
  private startEmbers(): void {
    if (!this.motion.particles || this.embers) {
      return;
    }
    this.embers = this.scene.add
      .particles(0, 0, FX_TEX.glow, {
        x: { min: 0, max: 640 },
        y: 470,
        speedY: { min: -70, max: -30 },
        speedX: { min: -14, max: 14 },
        lifespan: { min: 2600, max: 4200 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.9, end: 0 },
        frequency: 140,
        tint: [0xffb04a, 0xff7a2a, 0xffd88a],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(-9);
  }

  /** Big centred banner; fades by itself. */
  private banner(title: string, subtitle: string, color: string, holdMs: number): void {
    const s = this.scene;
    const band = s.add.rectangle(320, 230, 700, 104, 0x140810, 0.9).setDepth(DEPTH_BANNER).setScale(1, 0);
    const head = s.add
      .text(320, 210, title, {
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold italic",
        fontSize: "40px",
        color,
        stroke: "#2a0800",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_BANNER + 1)
      .setAlpha(0);
    const sub = s.add
      .text(320, 258, subtitle, {
        fontFamily: HUD_FONT,
        fontStyle: "bold",
        fontSize: "15px",
        color: "#fff0d8",
        align: "center",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_BANNER + 1)
      .setAlpha(0);
    const parts = [band, head, sub];
    s.tweens.add({ targets: band, scaleY: 1, duration: 160, ease: "Quad.easeOut" });
    s.tweens.add({ targets: [head, sub], alpha: 1, duration: 220, delay: 120 });
    if (!this.motion.reduced) {
      head.setScale(1.8);
      s.tweens.add({ targets: head, scale: 1, duration: 300, delay: 120, ease: "Back.easeOut" });
    }
    s.tweens.add({
      targets: parts,
      alpha: 0,
      delay: holdMs,
      duration: 260,
      onComplete: () => parts.forEach((p) => p.destroy()),
    });
  }

  /**
   * The boss changes form: flash, shake, ember nova, a swelling pulse into
   * the new tint, then the form banner. `done` fires when input may resume.
   */
  playTransform(form: BossForm, sprite: Phaser.GameObjects.Sprite, done: () => void): void {
    const s = this.scene;
    playBossStingSfx(s);
    const { particles, reduced, fast } = this.motion;
    const cx = sprite.x;
    const cy = sprite.y - sprite.displayHeight * 0.45;
    if (!reduced) {
      s.cameras.main.flash(260, 255, 140, 60);
      s.cameras.main.shake(420, 0.01);
    }
    if (particles) {
      this.ensureBurst().explode(70, cx, cy);
      const ring = s.add.image(cx, cy, FX_TEX.ring).setTint(0xff8a3a).setBlendMode(Phaser.BlendModes.ADD).setDepth(9).setScale(0.4);
      s.tweens.add({ targets: ring, scale: 4.2, alpha: 0, duration: 700, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    }
    const scaleX = sprite.scaleX;
    const scaleY = sprite.scaleY;
    const swap = (): void => {
      // New form: its own art (or tint), re-fitted; the idle breath follows the new size.
      this.decorateFoe(sprite);
      this.fx.setHome("wild", sprite.x, sprite.y);
    };
    if (fast || reduced) {
      swap();
    } else {
      sprite.setTintFill(0xffd27a);
      s.tweens.add({
        targets: sprite,
        scaleX: scaleX * 1.18,
        scaleY: scaleY * 1.18,
        duration: 260,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
        onComplete: () => {
          sprite.setScale(scaleX, scaleY);
          swap();
        },
      });
    }
    this.banner(form.label.toUpperCase(), form.telegraph, "#ffb04a", fast ? 900 : 2200);
    this.syncPhase();
    s.time.delayedCall(fast ? 300 : 1100, done);
  }

  /** Pulsing warning under the intent while the signature is telegraphed. */
  setSignatureWarning(on: boolean): void {
    for (const part of this.warning) {
      part.destroy();
    }
    this.warning = [];
    if (!on) {
      return;
    }
    const s = this.scene;
    const text = s.add
      .text(320, STORY_INTENT_Y + 26, "▲ CINDERFALL INCOMING — GUARD TO PARRY AND STAGGER HER ▲", {
        color: "#ffe45a",
        backgroundColor: "#3a0c08e0",
        fontFamily: HUD_FONT,
        fontSize: "12px",
        fontStyle: "bold",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.warning.push(text);
    if (!this.motion.reduced) {
      s.tweens.add({ targets: text, alpha: { from: 1, to: 0.45 }, duration: 380, yoyo: true, repeat: -1 });
    }
  }

  /** Parried signature: gold flash + "STAGGERED" pop over the boss. */
  playParry(sprite: Phaser.GameObjects.Sprite): void {
    const s = this.scene;
    if (!this.motion.reduced) {
      s.cameras.main.flash(160, 255, 236, 160);
    }
    const pop = s.add
      .text(sprite.x, sprite.y - sprite.displayHeight - 8, "PARRIED! STAGGERED", {
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
        fontSize: "22px",
        color: "#ffe45a",
        stroke: "#2a1000",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_BANNER);
    s.tweens.add({ targets: pop, y: pop.y - 30, alpha: 0, delay: 700, duration: 500, onComplete: () => pop.destroy() });
  }

  /** Rival: Wren sends her next creature. */
  announceNextFoe(name: string): void {
    this.banner(`WREN SENDS ${name.toUpperCase()}!`, `${this.battle.remainingFoes + 1} left`, "#ffc8a0", this.motion.fast ? 600 : 1200);
  }

  /** Wren's support card: portrait slides in from the left with the action. */
  playAssist(action: AssistAction): void {
    const s = this.scene;
    const npc = getNpcById(RIVAL_NPC_ID);
    const y = 372;
    const card = s.add.rectangle(-170, y, 300, 64, 0x2a1418, 0.94).setStrokeStyle(2, 0xd8603c, 1).setDepth(DEPTH_BANNER - 2).setOrigin(0, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [card];
    if (npc) {
      const portrait = s.add.sprite(-150, y + 30, npc.spriteKey).setOrigin(0.5, 1).setDepth(DEPTH_BANNER - 1);
      applyNpcSprite(s, portrait, npc, { width: NPC_DISPLAY.width * 1.1, height: NPC_DISPLAY.height * 1.1 }, "talk");
      parts.push(portrait);
    }
    const head = s.add
      .text(-110, y - 18, "WREN ASSISTS", { color: "#ffb070", fontFamily: HUD_FONT, fontSize: "13px", fontStyle: "bold" })
      .setDepth(DEPTH_BANNER - 1);
    const body = s.add
      .text(-110, y, action.kind === "daze" ? "Lantern Fox: Dazzle" : action.kind === "soak" ? "Brook Nymph: Drench" : action.kind === "cleanse" ? "Rootwalker: Cleanse" : "Rootwalker: Bloom", {
        color: "#fff0d8",
        fontFamily: HUD_FONT,
        fontSize: "15px",
        fontStyle: "bold",
      })
      .setDepth(DEPTH_BANNER - 1);
    parts.push(head, body);
    const slide = 180;
    s.tweens.add({ targets: parts, x: `+=${slide}`, duration: this.motion.fast ? 0 : 260, ease: "Back.easeOut" });
    s.tweens.add({
      targets: parts,
      alpha: 0,
      delay: this.motion.fast ? 700 : 1700,
      duration: 260,
      onComplete: () => parts.forEach((p) => p.destroy()),
    });
    if (action.kind === "daze" || action.kind === "soak") {
      this.fx.statusApplied("wild", action.kind === "daze" ? "dazed" : "soaked");
      this.fx.quickFlash("wild", action.kind === "daze" ? 0xd9a8ff : 0x6cc4ff);
    } else {
      this.fx.heal("player");
      this.fx.quickFlash("player", 0x9af0b0);
    }
  }

  destroy(): void {
    this.setSignatureWarning(false);
    this.embers?.destroy();
    this.burst?.destroy();
  }
}
