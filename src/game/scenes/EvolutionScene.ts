import Phaser from "phaser";
import {
  playEvolveSfx,
  playShrineSfx,
  playUiClickSfx,
  setMusicDuck,
} from "../audio/gameAudio";
import { fastBattleEnabled } from "../battle/vfx/battleTiming";
import { getCreatureDefinition } from "../creatures/catalog";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { getCreatureInstance } from "../creatures/party";
import { ensureCreatureTextures } from "../creatures/sprites";
import {
  growthHeadline,
  growthSubtitle,
  growthSummaryLines,
  type GrowthReveal,
} from "../evolution/growthReveal";
import {
  acceptsResultKey,
  evolutionTimeline,
  flickerSchedule,
  shouldOfferShare,
  type EvolutionBeats,
} from "../evolution/timeline";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { runCutsceneCreate } from "../ui/hudLock";
import { presenceTintForCreature } from "../shrine/presence";
import {
  isCompanionShareAvailable,
  openCompanionShare,
} from "../share/shareActions";
import { notifyWorldChanged } from "../world/worldSaveSchedule";

/**
 * Growth unlock cutscene (#393). Launched by the shrine *after* the party
 * mutation, quest event and save flush, so closing the tab mid-scene loses
 * nothing — this scene only animates.
 */
export type EvolutionSceneData = {
  reveal: GrowthReveal;
  /** Sleeping scene to wake on Continue (the shrine menu). */
  returnTo?: string;
};

export const EVOLUTION_SCENE_KEY = "EvolutionScene";

const SERIF = '"Fraunces", Georgia, serif';
const SANS = '"Source Sans 3", system-ui, sans-serif';
const MOON = 0xbfe8ff;
const GOLD = 0xffedb0;
const TEAL = 0x8ed8cf;
export const BEAM_TEX = "evo-beam";
export const RAYS_TEX = "evo-rays";

const STAGE_X = DESIGN_SIZE / 2;
const STAGE_Y = 236;
const SPRITE_BOX = 210;

type Phase = "playing" | "done" | "leaving";

/** Moon beam + light-ray canvases, shared with the finale hatch (#401). */
export function ensureCutsceneTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BEAM_TEX)) {
    const tex = scene.textures.createCanvas(BEAM_TEX, 96, 512);
    if (tex) {
      const ctx = tex.getContext();
      const across = ctx.createLinearGradient(0, 0, 96, 0);
      across.addColorStop(0, "rgba(255,255,255,0)");
      across.addColorStop(0.5, "rgba(255,255,255,1)");
      across.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, 96, 512);
      // Fade the top so the beam pours out of darkness.
      ctx.globalCompositeOperation = "destination-in";
      const down = ctx.createLinearGradient(0, 0, 0, 512);
      down.addColorStop(0, "rgba(0,0,0,0)");
      down.addColorStop(0.45, "rgba(0,0,0,0.85)");
      down.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = down;
      ctx.fillRect(0, 0, 96, 512);
      tex.refresh();
    }
  }
  if (!scene.textures.exists(RAYS_TEX)) {
    const size = 512;
    const tex = scene.textures.createCanvas(RAYS_TEX, size, size);
    if (tex) {
      const ctx = tex.getContext();
      const r = size / 2;
      ctx.translate(r, r);
      const rays = 14;
      for (let i = 0; i < rays; i += 1) {
        ctx.rotate((Math.PI * 2) / rays);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r, -r * 0.09);
        ctx.lineTo(r, r * 0.09);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      const fade = ctx.createRadialGradient(r, r, 0, r, r, r);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.5, "rgba(0,0,0,0.45)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
  }
}

export class EvolutionScene extends Phaser.Scene {
  private reveal!: GrowthReveal;
  private returnTo?: string;
  private beats!: EvolutionBeats;
  private reducedMotion = false;
  private particlesOn = true;
  private phase: Phase = "playing";
  private stingPlayed = false;
  /** scene time the result panel became actionable (key debounce, #399). */
  private doneAt = 0;

  private backdrop!: Phaser.GameObjects.Rectangle;
  private halo!: Phaser.GameObjects.Image;
  private beam!: Phaser.GameObjects.Image;
  private rays!: Phaser.GameObjects.Image;
  private dais!: Phaser.GameObjects.Container;
  private beforeArt!: Phaser.GameObjects.Image;
  private beforeSil!: Phaser.GameObjects.Image;
  private afterArt!: Phaser.GameObjects.Image;
  private afterSil!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private card!: Phaser.GameObjects.Container;
  private panel!: Phaser.GameObjects.Container;
  private skipHint!: Phaser.GameObjects.Text;
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;
  private rising?: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private baseScale = { before: 1, after: 1 };
  private buttons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: EVOLUTION_SCENE_KEY });
  }

  init(data: EvolutionSceneData): void {
    this.reveal = data.reveal;
    this.returnTo = data.returnTo;
    this.phase = "playing";
    this.stingPlayed = false;
    this.doneAt = 0;
    this.reducedMotion = prefersReducedMotion();
    this.particlesOn = effectsEnabled();
    this.beats = evolutionTimeline(this.reveal.kind, {
      fast: fastBattleEnabled(),
      reducedMotion: this.reducedMotion,
    });
  }

  create(): void {
    runCutsceneCreate(this, () => this.createScene());
  }

  private createScene(): void {
    bindOverlayPixelRatio(this);
    ensureFxTextures(this);
    ensureCreatureTextures(this);
    ensureCutsceneTextures(this);
    setMusicDuck(0.3);
    this.events.once("shutdown", () => setMusicDuck(1));

    this.buttons = [];
    this.buildStage();
    this.buildCard();
    this.buildPanel();
    this.bindInput();
    this.schedule();
  }

  // ---- Build ---------------------------------------------------------------

  private creatureImage(definitionId: string): Phaser.GameObjects.Image {
    const spriteKey = getCreatureDefinition(definitionId).spriteKey;
    // Encounter pose when it exists (bigger, posed); otherwise idle/base art.
    const [key, frame] = resolveCreaturePoseTexture(this, spriteKey, "encounter");
    return this.add.image(STAGE_X, STAGE_Y, key, frame).setOrigin(0.5, 0.55);
  }

  private fitScale(img: Phaser.GameObjects.Image): number {
    const w = Math.max(1, img.width);
    const h = Math.max(1, img.height);
    return Math.min(SPRITE_BOX / w, SPRITE_BOX / h);
  }

  private buildStage(): void {
    const evolving = this.reveal.kind === "evolution";
    this.backdrop = this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x04070f, 0)
      .setOrigin(0)
      .setInteractive();

    this.halo = this.add
      .image(STAGE_X, STAGE_Y, FX_TEX.halo)
      .setTint(evolving ? TEAL : GOLD)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(2.2)
      .setAlpha(0);

    this.rays = this.add
      .image(STAGE_X, STAGE_Y, RAYS_TEX)
      .setTint(GOLD)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.9)
      .setAlpha(0);

    this.beam = this.add
      .image(STAGE_X, STAGE_Y + 108, BEAM_TEX)
      .setOrigin(0.5, 1)
      .setTint(MOON)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.4, 1.25)
      .setAlpha(0);

    // Shrine dais: flattened glowing rings under the creature.
    const daisY = STAGE_Y + 104;
    const glow = this.add
      .image(0, 0, FX_TEX.halo)
      .setTint(TEAL)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(2.6, 0.7)
      .setAlpha(0.55);
    const outer = this.add.image(0, 0, FX_TEX.ring).setTint(GOLD).setScale(3.4, 0.9).setAlpha(0.75);
    const inner = this.add.image(0, 0, FX_TEX.ring).setTint(TEAL).setScale(2.2, 0.58).setAlpha(0.6);
    const runes = this.add.graphics();
    runes.fillStyle(GOLD, 0.9);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      runes.fillCircle(Math.cos(a) * 92, Math.sin(a) * 24, i % 3 === 0 ? 3 : 1.6);
    }
    this.dais = this.add.container(STAGE_X, daisY, [glow, outer, inner, runes]).setAlpha(0);

    this.beforeArt = this.creatureImage(this.reveal.before.definitionId);
    this.baseScale.before = this.fitScale(this.beforeArt);
    this.beforeArt.setScale(this.baseScale.before).setAlpha(0);
    this.beforeSil = this.creatureImage(this.reveal.before.definitionId)
      .setScale(this.baseScale.before)
      .setTintFill(0xeaf7ff)
      .setAlpha(0);

    this.afterArt = this.creatureImage(this.reveal.after.definitionId);
    this.baseScale.after = this.fitScale(this.afterArt);
    this.afterArt.setScale(this.baseScale.after).setVisible(false);
    if (!evolving) {
      const creature = getCreatureInstance(this.reveal.instanceId);
      if (creature) {
        this.afterArt.setTint(presenceTintForCreature(creature));
      }
    }
    this.afterSil = this.creatureImage(this.reveal.after.definitionId)
      .setScale(this.baseScale.after)
      .setTintFill(0xeaf7ff)
      .setVisible(false);

    if (this.particlesOn) {
      // Spawn on a rim around the creature; moveTo pulls each mote inward.
      const rim = {
        getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
          const a = Math.random() * Math.PI * 2;
          const r = 170 + Math.random() * 90;
          point.x = STAGE_X + Math.cos(a) * r;
          point.y = STAGE_Y + Math.sin(a) * r;
          return point;
        },
      };
      this.motes = this.add.particles(0, 0, FX_TEX.glow, {
        emitting: false,
        frequency: 70,
        lifespan: 900,
        moveToX: STAGE_X,
        moveToY: STAGE_Y,
        scale: { start: 0.9, end: 0.2 },
        alpha: { start: 0.25, end: 1 },
        tint: [MOON, TEAL, GOLD],
        blendMode: Phaser.BlendModes.ADD,
        emitZone: { type: "random", source: rim } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        maxParticles: 90,
      });
      this.rising = this.add.particles(STAGE_X, daisY, FX_TEX.spark, {
        emitting: false,
        frequency: 90,
        x: { min: -90, max: 90 },
        speedY: { min: -140, max: -60 },
        lifespan: { min: 700, max: 1300 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [GOLD, MOON],
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 60,
      });
      this.burst = this.add.particles(STAGE_X, STAGE_Y, FX_TEX.spark, {
        emitting: false,
        speed: { min: 140, max: 420 },
        lifespan: { min: 500, max: 1100 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [GOLD, 0xffffff, TEAL],
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 80,
      });
    }

    this.flash = this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0xffffff, 0)
      .setOrigin(0);

    this.skipHint = this.add
      .text(DESIGN_SIZE - 16, DESIGN_SIZE - 14, "Tap or Space to skip", {
        fontFamily: SANS,
        fontSize: "13px",
        color: "#9fb3c8",
      })
      .setOrigin(1, 1)
      .setAlpha(0);
  }

  private buildCard(): void {
    const headline = this.add
      .text(STAGE_X, 382, growthHeadline(this.reveal), {
        fontFamily: SERIF,
        fontSize: "34px",
        fontStyle: "bold",
        color: "#fff8ec",
        align: "center",
        stroke: "#0b1424",
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    // Long names (e.g. sovereigns) shrink rather than overflow on phones.
    const maxWidth = DESIGN_SIZE - 40;
    if (headline.width > maxWidth) {
      headline.setScale(maxWidth / headline.width);
    }
    const sub = this.add
      .text(STAGE_X, 416, growthSubtitle(this.reveal), {
        fontFamily: SANS,
        fontSize: "16px",
        color: "#c9eee1",
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    this.card = this.add.container(0, 0, [headline, sub]).setAlpha(0);
  }

  private buildPanel(): void {
    const lines = growthSummaryLines(this.reveal);
    const top = 440;
    const lineH = 22;
    const height = 44 + lines.length * lineH;
    const bg = this.add
      .rectangle(STAGE_X, top, 440, height, 0x16263f, 0.92)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, GOLD, 0.85);
    const header = this.add
      .text(STAGE_X, top + 16, "UNLOCKED", {
        fontFamily: SANS,
        fontSize: "13px",
        fontStyle: "bold",
        color: "#ffd860",
        letterSpacing: 4,
      })
      .setOrigin(0.5);
    const rows = lines.map((line, i) =>
      this.add
        .text(STAGE_X, top + 40 + i * lineH, line, {
          fontFamily: SANS,
          fontSize: "16px",
          color: "#f4ecd8",
          align: "center",
          wordWrap: { width: 410 },
        })
        .setOrigin(0.5, 0),
    );

    const buttonY = Math.min(DESIGN_SIZE - 30, top + height + 30);
    const offerShare = shouldOfferShare(this.reveal, isCompanionShareAvailable());
    const cont = this.makeButton(offerShare ? STAGE_X + 92 : STAGE_X, buttonY, "Continue", true, () =>
      this.finish(),
    );
    const parts: Phaser.GameObjects.GameObject[] = [bg, header, ...rows, cont];
    if (offerShare) {
      parts.push(
        this.makeButton(STAGE_X - 92, buttonY, "Share your companion", false, () => {
          playUiClickSfx(this);
          void openCompanionShare({
            title: "Show off your companion",
            subtitle: `${this.reveal.after.name} just grew — send your card to a friend.`,
          });
        }),
      );
    }
    this.panel = this.add.container(0, 0, parts).setAlpha(0);
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    primary: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: SANS,
        fontSize: primary ? "18px" : "15px",
        fontStyle: "bold",
        color: primary ? "#1a1a2e" : "#fff8ec",
        backgroundColor: primary ? "#ffedb0" : "#42658d",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5);
    this.buttons.push(btn);
    btn.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      if (this.phase === "done") {
        onClick();
      }
    });
    return btn;
  }

  private bindInput(): void {
    const advance = (event: KeyboardEvent): void => {
      // A held key auto-repeats: one press may skip, but only a fresh press
      // (key-up in between) after the panel settles may leave it (#399).
      if (event.repeat) {
        return;
      }
      if (this.phase === "playing") {
        this.skip();
      } else if (this.phase === "done" && acceptsResultKey(this.doneAt, this.time.now)) {
        this.finish();
      }
    };
    this.backdrop.on("pointerdown", () => {
      // Taps on the stage skip; once done, only the buttons act.
      if (this.phase === "playing") {
        this.skip();
      }
    });
    this.input.keyboard?.on("keydown-SPACE", advance);
    this.input.keyboard?.on("keydown-ENTER", advance);
    this.input.keyboard?.on("keydown-ESC", advance);
  }

  // ---- Timeline -------------------------------------------------------------

  private at(ms: number, fn: () => void): void {
    this.time.delayedCall(ms, () => {
      if (this.phase === "playing") {
        fn();
      }
    });
  }

  private schedule(): void {
    const b = this.beats;
    const evolving = this.reveal.kind === "evolution";
    const rm = this.reducedMotion;

    // Intro: darken the stage, show the creature as it is now.
    this.tweens.add({ targets: this.backdrop, fillAlpha: 0.94, duration: b.intro.duration + 150 });
    this.tweens.add({ targets: [this.beforeArt, this.dais], alpha: 1, duration: b.intro.duration });
    this.tweens.add({ targets: this.halo, alpha: 0.35, duration: b.intro.duration });
    this.tweens.add({ targets: this.skipHint, alpha: 0.85, delay: 300, duration: 400 });
    playShrineSfx(this);

    // Sting climax (~1.45 s in) lands on the flash.
    this.at(Math.max(0, b.flash.start - 1450), () => this.playSting());

    // Build-up: silhouette fades in and breathes, light gathers.
    this.at(b.buildUp.start, () => {
      const d = b.buildUp.duration;
      this.tweens.add({ targets: this.beforeSil, alpha: evolving ? 1 : 0.55, duration: Math.min(700, d * 0.4) });
      if (evolving) {
        this.tweens.add({ targets: this.beforeArt, alpha: 0, delay: Math.min(700, d * 0.4), duration: 200 });
      }
      this.tweens.add({ targets: this.beam, alpha: evolving ? 0.85 : 0.55, scaleX: evolving ? 1.1 : 0.8, duration: d, ease: "Sine.easeIn" });
      this.tweens.add({ targets: this.halo, alpha: 0.95, scale: evolving ? 4.2 : 3.2, duration: d, ease: "Sine.easeIn" });
      if (!rm) {
        const breaths = Math.max(1, Math.round(d / 520));
        this.tweens.add({
          targets: [this.beforeSil, this.beforeArt],
          scale: this.baseScale.before * 1.07,
          duration: d / breaths / 2,
          yoyo: true,
          repeat: breaths - 1,
          ease: "Sine.easeInOut",
        });
      }
      this.motes?.start();
      this.rising?.start();
      if (this.motes) {
        // Pull harder as the moment approaches.
        this.tweens.addCounter({
          from: 70,
          to: 18,
          duration: d,
          onUpdate: (tw) => {
            if (this.motes) this.motes.frequency = tw.getValue() ?? 18;
          },
        });
      }
      if (rm && evolving) {
        // Reduced motion: a slow crossfade to the new silhouette, no flicker.
        this.afterSil.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.afterSil, alpha: 1, delay: d * 0.5, duration: d * 0.5 });
        this.tweens.add({ targets: this.beforeSil, alpha: 0, delay: d * 0.5, duration: d * 0.5 });
      }
    });

    // Flicker: alternate before/after silhouettes, faster and faster.
    if (evolving && b.flicker.duration > 0) {
      let showingAfter = false;
      for (const offset of flickerSchedule(b.flicker.duration)) {
        this.at(b.flicker.start + offset, () => {
          showingAfter = !showingAfter;
          this.beforeSil.setVisible(!showingAfter);
          this.afterSil.setVisible(showingAfter).setAlpha(1);
          this.cameras.main.shake(60, 0.002);
        });
      }
    }

    this.at(b.flash.start, () => this.doFlash());
    this.at(b.reveal.start, () => this.doReveal(false));
    this.at(b.card.start, () => this.showCard(false));
    this.at(b.panel.start, () => this.showPanel(false));
  }

  private playSting(): void {
    if (this.stingPlayed) {
      return;
    }
    this.stingPlayed = true;
    playEvolveSfx(this);
  }

  private doFlash(): void {
    const evolving = this.reveal.kind === "evolution";
    const peak = this.reducedMotion ? 0.5 : evolving ? 1 : 0.7;
    this.flash.setFillStyle(evolving ? 0xffffff : 0xfff6d8, peak);
    this.tweens.add({
      targets: this.flash,
      fillAlpha: 0,
      delay: this.beats.flash.duration,
      duration: this.reducedMotion ? 700 : 520,
      ease: "Quad.easeOut",
    });
    if (!this.reducedMotion) {
      this.cameras.main.shake(evolving ? 260 : 140, evolving ? 0.008 : 0.004);
    }
  }

  private doReveal(instant: boolean): void {
    const evolving = this.reveal.kind === "evolution";
    this.motes?.stop();
    this.rising?.stop();
    this.beforeSil.setVisible(false);
    this.afterSil.setVisible(false);
    // Presence keeps the same body; the after image carries its new colours.
    this.beforeArt.setVisible(false);
    this.afterArt.setVisible(true).setAlpha(1);
    const base = this.baseScale.after;
    this.tweens.add({ targets: this.beam, alpha: 0, duration: instant ? 0 : 600 });
    this.halo.setAlpha(0.6).setScale(3);
    this.rays.setAlpha(evolving ? 0.55 : 0.35);

    if (instant || this.reducedMotion) {
      this.afterArt.setScale(base);
      if (!instant) {
        this.afterArt.setAlpha(0);
        this.tweens.add({ targets: this.afterArt, alpha: 1, duration: this.beats.reveal.duration });
      }
    } else {
      this.afterArt.setScale(base * 0.5);
      this.tweens.add({
        targets: this.afterArt,
        scale: base,
        duration: this.beats.reveal.duration,
        ease: "Back.easeOut",
        easeParams: [2.6],
      });
      const ring = this.add
        .image(STAGE_X, STAGE_Y, FX_TEX.ring)
        .setTint(GOLD)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.6);
      this.tweens.add({
        targets: ring,
        scale: 9,
        alpha: 0,
        duration: 800,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      });
      this.burst?.explode(evolving ? 60 : 30);
    }

    if (!this.reducedMotion) {
      this.tweens.add({ targets: this.rays, angle: 360, duration: 24000, repeat: -1 });
      // Settle into a gentle idle breath.
      this.tweens.add({
        targets: this.afterArt,
        scaleY: base * 1.025,
        y: STAGE_Y - 2,
        delay: instant ? 0 : this.beats.reveal.duration,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private showCard(instant: boolean): void {
    if (instant || this.reducedMotion) {
      this.card.setY(0);
      this.tweens.add({ targets: this.card, alpha: 1, duration: instant ? 0 : this.beats.card.duration });
      return;
    }
    this.card.setY(14);
    this.tweens.add({
      targets: this.card,
      alpha: 1,
      y: 0,
      duration: this.beats.card.duration,
      ease: "Cubic.easeOut",
    });
  }

  private showPanel(instant: boolean): void {
    this.tweens.add({ targets: this.skipHint, alpha: 0, duration: 200 });
    this.tweens.add({ targets: this.panel, alpha: 1, duration: instant ? 0 : this.beats.panel.duration });
    for (const btn of this.buttons) {
      btn.setInteractive({ useHandCursor: true });
    }
    this.phase = "done";
    this.doneAt = this.time.now;
  }

  // ---- Skip / exit ------------------------------------------------------------

  /** Jump to the finished frame: after form, name card and panel. */
  private skip(): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "done";
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.cameras.main.resetFX();
    this.playSting();
    this.backdrop.setFillStyle(0x04070f, 0.94);
    this.flash.setFillStyle(0xffffff, 0);
    this.dais.setAlpha(1);
    this.doReveal(true);
    this.showCard(true);
    this.showPanel(true);
  }

  private finish(): void {
    if (this.phase === "leaving") {
      return;
    }
    this.phase = "leaving";
    // Data was saved before launch; re-notify so any late edits persist too.
    notifyWorldChanged();
    setMusicDuck(1);
    const returnTo = this.returnTo;
    this.scene.stop();
    if (returnTo && this.scene.manager.keys[returnTo]) {
      this.scene.wake(returnTo);
    } else {
      this.scene.resume("IsometricScene");
    }
  }
}
