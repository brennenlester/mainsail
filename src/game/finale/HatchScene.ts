import Phaser from "phaser";
import { playEvolveSfx, playShrineSfx, playUiClickSfx, setMusicDuck } from "../audio/gameAudio";
import { fastBattleEnabled } from "../battle/vfx/battleTiming";
import { acceptsResultKey } from "../evolution/timeline";
import { NPC_DISPLAY } from "../render/displaySizes";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { RENDER_DPR } from "../render/pixelRatio";
import { applyNpcSprite } from "../render/worldTextures";
import { BEAM_TEX, ensureCutsceneTextures, RAYS_TEX } from "../scenes/EvolutionScene";
import {
  addHatchling,
  altarTop,
  drawEmberEgg,
  stageScale,
  type StoryStage,
} from "../story/storyCueFx";
import { FINALE_HATCHLING, RIVAL_NPC_ID } from "../story/storySpars";
import { runCutsceneCreate } from "../ui/hudLock";
import { getNpcById } from "../world/npcs";
import { flushPendingHostSave, notifyWorldChanged } from "../world/worldSaveSchedule";
import { hatchTimeline, wobbleAngle, type HatchBeats } from "./hatchTimeline";

/**
 * The finale hatch (#401), staged on the Moon Shrine altar in the
 * EvolutionScene vocabulary: the world dims to a pool of moonlight, light
 * builds on the altar, the ember egg rocks and cracks, a flash, Cinderling
 * springs out with a name card, and Wren reacts. Skippable; Fast and
 * reduced motion respected; the HUD is locked while it runs.
 *
 * Launched by DialogueScene *after* the companion was added and saved
 * (the conversation build does that), so this scene only animates. Lays
 * out in stage CSS px like DialogueScene (camera zoom = DPR).
 *
 * ponytail: laid out once at launch; a resize mid-cutscene (~6 s, or one tap
 * to skip) keeps the old framing rather than re-anchoring every object.
 */
export const HATCH_SCENE_KEY = "HatchScene";

export type HatchSceneData = {
  stage: StoryStage;
  onDone: () => void;
};

const SERIF = '"Fraunces", Georgia, serif';
const SANS = '"Source Sans 3", system-ui, sans-serif';
const MOON = 0xcfe6ff;
const GOLD = 0xffedb0;
const EMBER = 0xff9a3a;
const VIGNETTE_TEX = "hatch-vignette";
const WREN_LINE = "Ha — look at it glow! It's got her spark... and it already likes you.";

type Phase = "playing" | "done" | "leaving";

export class HatchScene extends Phaser.Scene {
  private stage!: StoryStage;
  private onDone!: () => void;
  private beats!: HatchBeats;
  private reduced = false;
  private particlesOn = true;
  private phase: Phase = "playing";
  private doneAt = 0;
  private stingPlayed = false;

  private vignette!: Phaser.GameObjects.Image;
  private beam!: Phaser.GameObjects.Image;
  private halo!: Phaser.GameObjects.Image;
  private rays!: Phaser.GameObjects.Image;
  private dais!: Phaser.GameObjects.Container;
  private egg!: Phaser.GameObjects.Container;
  private eggGlow!: Phaser.GameObjects.Image;
  private cracks!: Phaser.GameObjects.Graphics;
  private hatchling!: Phaser.GameObjects.Image;
  private hatchScale = 1;
  private flash!: Phaser.GameObjects.Rectangle;
  private card!: Phaser.GameObjects.Container;
  private wren!: Phaser.GameObjects.Container;
  private skipHint!: Phaser.GameObjects.Text;
  private continueHint!: Phaser.GameObjects.Text;
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards: Phaser.GameObjects.Triangle[] = [];

  constructor() {
    super({ key: HATCH_SCENE_KEY });
  }

  init(data: HatchSceneData): void {
    this.stage = data.stage;
    this.onDone = data.onDone;
    this.phase = "playing";
    this.shards = [];
    this.doneAt = 0;
    this.stingPlayed = false;
    this.reduced = prefersReducedMotion();
    this.particlesOn = effectsEnabled();
    this.beats = hatchTimeline({ fast: fastBattleEnabled(), reducedMotion: this.reduced });
  }

  create(): void {
    try {
      runCutsceneCreate(this, () => this.build());
    } catch (error) {
      // Never strand the dialogue underneath: stop, and its shutdown hook
      // hands the stage back (#401).
      console.error("Hatch cutscene failed; skipping it.", error);
      this.phase = "leaving";
      this.scene.stop();
    }
  }

  private build(): void {
    const { width, height } = this.stage;
    const cam = this.cameras.main;
    cam.setZoom(RENDER_DPR);
    cam.centerOn(width / 2, height / 2);
    ensureFxTextures(this);
    ensureCutsceneTextures(this);
    setMusicDuck(0.3);
    this.events.once("shutdown", () => setMusicDuck(1));

    this.buildStage();
    this.buildCard();
    this.buildWren();
    this.bindInput();
    this.schedule();
  }

  /** Dark stage with a soft pool of light left open around the altar. */
  private makeVignette(): void {
    const { width, height, anchor } = this.stage;
    if (this.textures.exists(VIGNETTE_TEX)) {
      this.textures.remove(VIGNETTE_TEX);
    }
    // Half resolution: it is all soft gradient.
    const w = Math.max(2, Math.ceil(width / 2));
    const h = Math.max(2, Math.ceil(height / 2));
    const tex = this.textures.createCanvas(VIGNETTE_TEX, w, h);
    if (tex) {
      const ctx = tex.getContext();
      const s = stageScale(this.stage);
      const cx = anchor.x / 2;
      const cy = (anchor.y - 30 * s) / 2;
      const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, far);
      const inner = Math.min(0.9, (70 * s) / 2 / far);
      grad.addColorStop(0, "rgba(4,8,20,0.05)");
      grad.addColorStop(inner, "rgba(4,8,20,0.25)");
      grad.addColorStop(Math.min(0.95, inner * 2.6), "rgba(4,8,20,0.78)");
      grad.addColorStop(1, "rgba(4,8,20,0.93)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      tex.refresh();
    }
    this.vignette = this.add.image(0, 0, VIGNETTE_TEX).setOrigin(0).setScale(2).setAlpha(0);
  }

  private buildStage(): void {
    const { width, height } = this.stage;
    const s = stageScale(this.stage);
    const top = altarTop(this.stage);
    this.makeVignette();
    // Full-stage hit area: taps skip, then continue.
    this.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0).setInteractive().on("pointerdown", () => this.onTap());

    this.beam = this.add
      .image(top.x, top.y + 8 * s, BEAM_TEX)
      .setOrigin(0.5, 1)
      .setTint(MOON)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.beam.setDisplaySize(64 * s, Math.max(120, top.y + 12));
    this.halo = this.add
      .image(top.x, top.y - 28 * s, FX_TEX.halo)
      .setTint(MOON)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.6 * s)
      .setAlpha(0);
    this.rays = this.add
      .image(top.x, top.y - 36 * s, RAYS_TEX)
      .setTint(GOLD)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5 * s)
      .setAlpha(0);

    // The shrine's carved rings light up under the egg.
    const glow = this.add.image(0, 0, FX_TEX.halo).setTint(0x8ed8cf).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5, 0.45).setAlpha(0.6);
    const outer = this.add.image(0, 0, FX_TEX.ring).setTint(GOLD).setScale(1.9, 0.55).setAlpha(0.8);
    const inner = this.add.image(0, 0, FX_TEX.ring).setTint(MOON).setScale(1.2, 0.36).setAlpha(0.7);
    const runes = this.add.graphics();
    runes.fillStyle(GOLD, 0.9);
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      runes.fillCircle(Math.cos(a) * 50, Math.sin(a) * 14, i % 2 === 0 ? 2.2 : 1.2);
    }
    this.dais = this.add.container(top.x, top.y + 2 * s, [glow, outer, inner, runes]).setScale(s).setAlpha(0);

    this.eggGlow = this.add
      .image(top.x, top.y - 28 * s, FX_TEX.halo)
      .setTint(EMBER)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.3 * s)
      .setAlpha(0.55);
    this.egg = drawEmberEgg(this, top.x, top.y, s * 1.15);
    this.cracks = this.add.graphics();
    this.egg.add(this.cracks);

    this.hatchling = addHatchling(this, top.x, top.y, 120 * s).setVisible(false);
    this.hatchScale = this.hatchling.scale;

    if (this.particlesOn) {
      const rim = {
        getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
          const a = Math.random() * Math.PI * 2;
          const r = (110 + Math.random() * 80) * s;
          point.x = top.x + Math.cos(a) * r;
          point.y = top.y - 30 * s + Math.sin(a) * r * 0.7;
          return point;
        },
      };
      this.motes = this.add.particles(0, 0, FX_TEX.glow, {
        emitting: false,
        frequency: 80,
        lifespan: 900,
        moveToX: top.x,
        moveToY: top.y - 30 * s,
        scale: { start: 0.7 * s, end: 0.15 },
        alpha: { start: 0.2, end: 1 },
        tint: [MOON, GOLD, 0x8ed8cf],
        blendMode: Phaser.BlendModes.ADD,
        emitZone: { type: "random", source: rim } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        maxParticles: 70,
      });
      this.burst = this.add.particles(top.x, top.y - 30 * s, FX_TEX.spark, {
        emitting: false,
        speed: { min: 120 * s, max: 360 * s },
        lifespan: { min: 500, max: 1100 },
        scale: { start: 1 * s, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [GOLD, 0xffffff, EMBER],
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 80,
      });
    }

    this.flash = this.add.rectangle(0, 0, width, height, 0xfff6e0, 0).setOrigin(0);
    this.skipHint = this.add
      .text(width - 14, 14, "Tap or Space to skip", { fontFamily: SANS, fontSize: "14px", color: "#c8d6e8" })
      .setOrigin(1, 0)
      .setAlpha(0);
  }

  /** Bottom speech panel height (shared by the name card placement). */
  private wrenPanel(): { left: number; top: number; w: number; h: number } {
    const { width, height } = this.stage;
    const w = Math.min(540, width - 24);
    const h = width < 480 ? 124 : 104;
    return { left: (width - w) / 2, top: height - h - 14, w, h };
  }

  private buildCard(): void {
    const { width } = this.stage;
    const s = stageScale(this.stage);
    const top = altarTop(this.stage);
    const narrow = width < 480;
    const head = this.add
      .text(0, 0, `${FINALE_HATCHLING.nickname} hatched!`, {
        fontFamily: SERIF,
        fontSize: narrow ? "30px" : "36px",
        fontStyle: "bold",
        color: "#fff8ec",
        stroke: "#1a0c06",
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, narrow ? 30 : 34, "Rare Cinder Toad · joined your party", {
        fontFamily: SANS,
        fontSize: narrow ? "15px" : "17px",
        fontStyle: "bold",
        color: "#ffd8a0",
        stroke: "#1a0c06",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    // Under the altar when there is room above Wren's panel, else over the hatchling.
    const below = top.y + 40 * s + 28;
    const room = this.wrenPanel().top - 70;
    const y = below <= room ? below : Math.max(40, top.y - 96 * s - 64);
    this.card = this.add.container(width / 2, y, [head, sub]).setAlpha(0);
  }

  private buildWren(): void {
    const p = this.wrenPanel();
    const bg = this.add.graphics();
    bg.fillStyle(0xfff8ec, 0.98).fillRoundedRect(0, 0, p.w, p.h, 18);
    bg.lineStyle(4, 0xd8a05c, 1).strokeRoundedRect(0, 0, p.w, p.h, 18);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    const npc = getNpcById(RIVAL_NPC_ID);
    if (npc) {
      const portrait = this.add.sprite(p.w - 50, 4, npc.spriteKey).setOrigin(0.5, 1);
      applyNpcSprite(this, portrait, npc, { width: NPC_DISPLAY.width * 1.6, height: NPC_DISPLAY.height * 1.6 }, "talk");
      parts.push(portrait);
    }
    const name = this.add.text(18, 12, "Wren", { fontFamily: SANS, fontSize: "20px", fontStyle: "bold", color: "#8a4a20" });
    const line = this.add.text(18, 40, WREN_LINE, {
      fontFamily: SANS,
      fontSize: "18px",
      fontStyle: "600",
      color: "#1c3140",
      lineSpacing: 4,
      wordWrap: { width: p.w - 36, useAdvancedWrap: true },
    });
    this.continueHint = this.add
      .text(p.w - 14, p.h - 10, "Tap to continue ▸", { fontFamily: SANS, fontSize: "14px", fontStyle: "bold", color: "#8a4a20" })
      .setOrigin(1, 1)
      .setAlpha(0);
    parts.push(name, line, this.continueHint);
    this.wren = this.add.container(p.left, p.top, parts).setAlpha(0);
  }

  private bindInput(): void {
    const onKey = (event: KeyboardEvent): void => {
      // One held key may skip; leaving needs a fresh press after it settles.
      if (!event.repeat) this.onTap();
    };
    for (const key of ["SPACE", "ENTER", "ESC", "E"]) {
      this.input.keyboard?.on(`keydown-${key}`, onKey);
    }
  }

  private onTap(): void {
    if (this.phase === "playing") {
      this.skip();
    } else if (this.phase === "done" && acceptsResultKey(this.doneAt, this.time.now)) {
      this.finish();
    }
  }

  // ---- Timeline -------------------------------------------------------------

  private at(ms: number, fn: () => void): void {
    this.time.delayedCall(ms, () => {
      if (this.phase === "playing") fn();
    });
  }

  private schedule(): void {
    const b = this.beats;
    const rm = this.reduced;
    const s = stageScale(this.stage);

    // Dim: the world falls away to a pool of moonlight on the altar.
    this.tweens.add({ targets: this.vignette, alpha: 1, duration: b.dim.duration });
    this.tweens.add({ targets: this.skipHint, alpha: 0.85, delay: 300, duration: 400 });
    playShrineSfx(this);
    this.at(Math.max(0, b.flash.start - 1450), () => this.playSting());

    // Light: the beam pours down, the rings wake, motes gather.
    this.at(b.light.start, () => {
      const d = b.light.duration;
      this.tweens.add({ targets: this.beam, alpha: 0.75, duration: d * 0.7, ease: "Sine.easeIn" });
      this.tweens.add({ targets: this.halo, alpha: 0.75, scale: 2.6 * s, duration: d, ease: "Sine.easeIn" });
      this.tweens.add({ targets: this.dais, alpha: 1, duration: d * 0.6 });
      this.tweens.add({ targets: this.eggGlow, alpha: 0.9, scale: 1.8 * s, duration: d });
      this.motes?.start();
    });

    // Wobble: the egg rocks, harder and harder (a glow pulse under reduced motion).
    this.at(b.wobble.start, () => {
      const d = b.wobble.duration + b.crack.duration;
      if (rm) {
        this.tweens.add({ targets: this.eggGlow, alpha: { from: 0.6, to: 1 }, duration: 420, yoyo: true, repeat: -1 });
        return;
      }
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: d,
        onUpdate: (tw) => this.egg.setAngle(wobbleAngle(tw.getValue() ?? 0)),
      });
    });

    // Crack: three splits, light leaking through, a jolt on each.
    for (let i = 0; i < 3; i += 1) {
      this.at(b.crack.start + (b.crack.duration / 3) * i, () => this.crack(i));
    }

    this.at(b.flash.start, () => this.doFlash());
    this.at(b.pop.start, () => this.doPop(false));
    this.at(b.card.start, () => this.showCard(false));
    this.at(b.wren.start, () => this.showWren(false));
  }

  private crack(step: number): void {
    const paths: number[][] = [
      [-4, -66, 2, -54, -6, -44, 4, -34],
      [4, -34, 14, -28, 10, -18, 20, -12],
      [-6, -44, -18, -36, -14, -24, -24, -16],
    ];
    const pts = paths[step]!;
    this.cracks.lineStyle(3, 0xfff0a0, 1).beginPath().moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) this.cracks.lineTo(pts[i]!, pts[i + 1]!);
    this.cracks.strokePath();
    this.eggGlow.setAlpha(1).setScale(this.eggGlow.scale * 1.12);
    playUiClickSfx(this);
    if (!this.reduced) this.cameras.main.shake(120, 0.003 + step * 0.002);
  }

  private playSting(): void {
    if (this.stingPlayed) return;
    this.stingPlayed = true;
    playEvolveSfx(this);
  }

  private doFlash(): void {
    this.flash.setFillStyle(0xfff6e0, this.reduced ? 0.55 : 1);
    this.tweens.add({
      targets: this.flash,
      fillAlpha: 0,
      delay: this.beats.flash.duration,
      duration: this.reduced ? 700 : 520,
      ease: "Quad.easeOut",
    });
    if (!this.reduced) this.cameras.main.shake(220, 0.007);
  }

  /** Shell gives way; Cinderling springs out. */
  private doPop(instant: boolean): void {
    const s = stageScale(this.stage);
    const top = altarTop(this.stage);
    this.motes?.stop();
    if (!instant && !this.reduced && this.egg.active) {
      // Shell shards fly off.
      for (let i = 0; i < 8; i += 1) {
        const a = -Math.PI / 2 + (i - 3.5) * 0.42;
        const shard = this.add.triangle(top.x, top.y - 34 * s, 0, 0, 12 * s, 3 * s, 4 * s, 12 * s, i % 2 ? 0xc8522a : 0x7a2a1a);
        this.tweens.add({
          targets: shard,
          x: top.x + Math.cos(a) * 90 * s,
          y: top.y - 34 * s + Math.sin(a) * 70 * s + 60 * s,
          angle: 260 * (i % 2 ? 1 : -1),
          alpha: 0,
          duration: 700,
          ease: "Quad.easeOut",
          onComplete: () => shard.destroy(),
        });
        this.shards.push(shard);
      }
    }
    this.egg.destroy();
    this.eggGlow.setTint(0xffc070).setAlpha(0.7).setScale(2.2 * s);
    this.tweens.add({ targets: this.beam, alpha: 0.3, duration: instant ? 0 : 600 });
    this.rays.setAlpha(0.45);
    this.hatchling.setVisible(true).setAlpha(1).setY(top.y);
    const base = this.hatchScale;
    if (instant || this.reduced) {
      this.hatchling.setScale(base);
      if (!instant) {
        this.hatchling.setAlpha(0);
        this.tweens.add({ targets: this.hatchling, alpha: 1, duration: this.beats.pop.duration });
      }
    } else {
      // Spring pop: squash up out of the shell, overshoot, settle.
      this.hatchling.setScale(base * 1.3, base * 0.3);
      this.tweens.add({
        targets: this.hatchling,
        scaleX: base,
        scaleY: base,
        duration: this.beats.pop.duration,
        ease: "Back.easeOut",
        easeParams: [3],
      });
      const ring = this.add.image(top.x, top.y - 34 * s, FX_TEX.ring).setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5 * s);
      this.tweens.add({ targets: ring, scale: 7 * s, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
      this.burst?.explode(50);
    }
    if (!this.reduced) {
      this.tweens.add({ targets: this.rays, angle: 360, duration: 24000, repeat: -1 });
      this.tweens.add({
        targets: this.hatchling,
        y: top.y - 6 * s,
        delay: instant ? 0 : this.beats.pop.duration,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private showCard(instant: boolean): void {
    if (instant || this.reduced) {
      this.tweens.add({ targets: this.card, alpha: 1, duration: instant ? 0 : this.beats.card.duration });
      return;
    }
    const y = this.card.y;
    this.card.setY(y + 14).setScale(0.9);
    this.tweens.add({ targets: this.card, alpha: 1, y, scale: 1, duration: this.beats.card.duration, ease: "Back.easeOut" });
  }

  /** Wren's reaction; then the scene waits for Continue. */
  private showWren(instant: boolean): void {
    this.tweens.add({ targets: this.skipHint, alpha: 0, duration: 200 });
    const y = this.wren.y;
    if (!instant && !this.reduced) this.wren.setY(y + 30);
    this.tweens.add({ targets: this.wren, alpha: 1, y, duration: instant ? 0 : this.beats.wren.duration, ease: "Cubic.easeOut" });
    this.continueHint.setAlpha(1);
    if (!this.reduced) {
      this.tweens.add({ targets: this.continueHint, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, delay: 600 });
    }
    this.phase = "done";
    this.doneAt = this.time.now;
  }

  // ---- Skip / exit ------------------------------------------------------------

  /** Jump to the finished frame: hatchling, name card and Wren. */
  private skip(): void {
    if (this.phase !== "playing") return;
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.cameras.main.resetFX();
    this.shards.forEach((shard) => shard.destroy());
    this.playSting();
    this.vignette.setAlpha(1);
    this.flash.setFillStyle(0xfff6e0, 0);
    this.dais.setAlpha(1);
    this.halo.setAlpha(0.75).setScale(2.6 * stageScale(this.stage));
    this.doPop(true);
    this.showCard(true);
    this.showWren(true);
  }

  private finish(): void {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    setMusicDuck(1);
    const onDone = this.onDone;
    this.scene.stop();
    onDone();
  }
}

/**
 * Register (lazily) and run the hatch over `from`, which stays up underneath.
 * The companion is already in the party: flush the save first so closing
 * the tab mid-cutscene loses nothing.
 */
export function launchHatchScene(from: Phaser.Scene, data: HatchSceneData): void {
  notifyWorldChanged();
  flushPendingHostSave();
  const manager = from.scene.manager;
  if (!manager.keys[HATCH_SCENE_KEY]) {
    manager.add(HATCH_SCENE_KEY, HatchScene, false);
  }
  from.scene.launch(HATCH_SCENE_KEY, data);
  from.scene.bringToTop(HATCH_SCENE_KEY);
}
