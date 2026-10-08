import Phaser from "phaser";
import { effectsEnabled, prefersReducedMotion } from "../../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../../render/fx/fxTextures";
import type { BattleCombatant, MoveDefinition, MoveRole, StatusId } from "../../creatures/types";
import {
  battleTimings,
  burstCount,
  fastBattleEnabled,
  hitPauseMs,
  shakeFor,
  usesProjectile,
  vfxFamily,
  zoomPunchFor,
  type BattleFxMode,
  type BattleTimings,
  type IntentGlow,
  type VfxFamily,
} from "./battleTiming";
import type { DamageNumberStyle } from "./damageNumbers";

/**
 * Battle presentation layer (#365): entrances, idle breathing, lunges,
 * per-type particle bursts, hit-pause, damage numbers, status auras, guard
 * shimmer, faint. BattleScene owns the rules; this only draws.
 *
 * Every emitter / pooled object is created once per battle; per-hit work is
 * `explode()` on an existing emitter and tweens on pooled objects, so a
 * turn allocates nothing per frame.
 */

export type Side = "wild" | "player";
type Sprite = Phaser.GameObjects.Sprite;
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

const FX_DEPTH = 9;
const NUMBER_DEPTH = 10_000;
const NUMBER_POOL = 6;
const STATUS_IDS: readonly StatusId[] = ["burn", "soaked", "rooted", "dazed"];

/** Main hue per family (projectile, ring flash, trail). */
export const FAMILY_COLOR: Readonly<Record<VfxFamily, number>> = {
  ember: 0xff8a2a,
  tide: 0x6cc4ff,
  grove: 0x8fd36a,
  storm: 0xfff07a,
  mist: 0xc9b4ff,
  neutral: 0xf0e6d2,
};

function burstRecipe(family: VfxFamily): EmitterConfig {
  const common: EmitterConfig = { emitting: false, maxParticles: 80, angle: { min: 0, max: 360 } };
  switch (family) {
    case "ember":
      return {
        ...common,
        texture: FX_TEX.glow,
        speed: { min: 70, max: 230 },
        gravityY: -160,
        lifespan: { min: 320, max: 640 },
        scale: { start: 0.9, end: 0 },
        tint: [0xffe080, 0xff9a2a, 0xff5a1a],
        blendMode: Phaser.BlendModes.ADD,
      };
    case "tide":
      return {
        ...common,
        texture: FX_TEX.glow,
        speed: { min: 110, max: 260 },
        angle: { min: 200, max: 340 },
        gravityY: 620,
        lifespan: { min: 420, max: 720 },
        scale: { start: 0.6, end: 0.15 },
        tint: [0xe6f6ff, 0x8ad4ff, 0x3a8fd8],
        blendMode: Phaser.BlendModes.ADD,
      };
    case "grove":
      return {
        ...common,
        texture: FX_TEX.leaf,
        speed: { min: 80, max: 220 },
        gravityY: 120,
        lifespan: { min: 520, max: 900 },
        rotate: { min: 0, max: 720 },
        scale: { min: 1.3, max: 2.1 },
        alpha: { start: 1, end: 0 },
        tint: [0x5f9a4a, 0x8fd36a, 0xb8e07a, 0x3f7a3a],
      };
    case "storm":
      return {
        ...common,
        texture: FX_TEX.spark,
        speed: { min: 180, max: 380 },
        lifespan: { min: 120, max: 320 },
        scale: { start: 1.5, end: 0 },
        rotate: { min: 0, max: 90 },
        tint: [0xffffff, 0xfff6a0, 0x9ad8ff],
        blendMode: Phaser.BlendModes.ADD,
      };
    case "mist":
      return {
        ...common,
        texture: FX_TEX.puff,
        speed: { min: 20, max: 90 },
        lifespan: { min: 600, max: 950 },
        scale: { start: 0.6, end: 2.6 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xf0ecff, 0xc9b4ff, 0x9a86d8],
      };
    case "neutral":
      return {
        ...common,
        texture: FX_TEX.chip,
        speed: { min: 110, max: 260 },
        gravityY: 520,
        lifespan: { min: 300, max: 600 },
        rotate: { min: 0, max: 540 },
        scale: { min: 0.8, max: 1.5 },
        tint: [0xfff7e0, 0xd8cfbc, 0xb7b2a5],
      };
  }
}

function statusRecipe(id: StatusId): EmitterConfig {
  switch (id) {
    case "burn":
      return {
        texture: FX_TEX.glow,
        frequency: 90,
        lifespan: { min: 500, max: 900 },
        speedY: { min: -70, max: -30 },
        speedX: { min: -12, max: 12 },
        scale: { start: 0.55, end: 0 },
        tint: [0xffc060, 0xff7a2a],
        blendMode: Phaser.BlendModes.ADD,
      };
    case "soaked":
      return {
        texture: FX_TEX.glow,
        frequency: 130,
        lifespan: { min: 450, max: 700 },
        speedY: { min: 20, max: 50 },
        gravityY: 360,
        scale: { start: 0.32, end: 0.18 },
        alpha: { start: 0.95, end: 0.2 },
        tint: [0xbfe8ff, 0x6cc4ff],
        blendMode: Phaser.BlendModes.ADD,
      };
    case "rooted":
      return {
        texture: FX_TEX.leaf,
        frequency: 170,
        lifespan: { min: 700, max: 1000 },
        speedY: { min: -26, max: -10 },
        speedX: { min: -16, max: 16 },
        rotate: { min: -40, max: 40 },
        scale: { min: 1, max: 1.5 },
        alpha: { start: 1, end: 0 },
        tint: [0x5f9a4a, 0x8fd36a, 0x7a5a3a],
      };
    case "dazed":
      return {
        texture: FX_TEX.spark,
        frequency: 150,
        lifespan: 700,
        speed: { min: 18, max: 34 },
        angle: { min: 160, max: 380 },
        scale: { start: 0.9, end: 0.2 },
        rotate: { start: 0, end: 180 },
        tint: [0xffe45a, 0xd9a8ff, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
      };
  }
}

type FloatText = { main: Phaser.GameObjects.Text; callout: Phaser.GameObjects.Text };

type SideState = {
  home: { x: number; y: number };
  baseScale: { x: number; y: number };
  breath?: Phaser.Tweens.Tween;
  /** Suspends breathing while hurt / squashed. */
  hurt: boolean;
  /** Set from faint() until the next entrance; impact follow-ups must not touch the sprite. */
  fainting: boolean;
  auras: Record<StatusId, Emitter>;
  shield: Phaser.GameObjects.Image;
  shieldTween?: Phaser.Tweens.Tween;
  guarding: boolean;
};

/** Phaser anim key for a rendered creature pose, e.g. `creature-mossling-battle__attack` (#377). */
export function creatureAnimKey(poseKey: string, anim: "idle" | "attack" | "hurt" | "faint"): string {
  return `${poseKey}__${anim}`;
}

export class BattleFx {
  private readonly scene: Phaser.Scene;
  private readonly sprites: () => Record<Side, Sprite>;
  private readonly restoreTint: (side: Side) => void;
  private bursts!: Record<VfxFamily, Emitter>;
  private trail!: Emitter;
  private dust!: Emitter;
  private confetti!: Emitter;
  private projectile!: Phaser.GameObjects.Image;
  private rings: Phaser.GameObjects.Image[] = [];
  private ringIndex = 0;
  private screenFlash!: Phaser.GameObjects.Rectangle;
  private floats: FloatText[] = [];
  private floatIndex = 0;
  private side!: Record<Side, SideState>;
  private glow?: { rect: Phaser.GameObjects.Rectangle; tween?: Phaser.Tweens.Tween };

  constructor(
    scene: Phaser.Scene,
    sprites: () => Record<Side, Sprite>,
    restoreTint: (side: Side) => void,
  ) {
    this.scene = scene;
    this.sprites = sprites;
    this.restoreTint = restoreTint;
    ensureFxTextures(scene);
    this.build();
    if (import.meta.env.DEV) {
      // ponytail: dev-only QA handle for driving battle FX from Playwright.
      (window as unknown as { __ivyBattleFx?: BattleFx }).__ivyBattleFx = this;
    }
  }

  /** Read live so the Fast toggle / Effects toggle apply mid-battle. */
  mode(): BattleFxMode {
    return {
      fast: fastBattleEnabled(),
      reducedMotion: prefersReducedMotion(),
      particles: effectsEnabled(),
    };
  }

  timings(): BattleTimings {
    return battleTimings(this.mode());
  }

  private build(): void {
    const s = this.scene;
    const families: VfxFamily[] = ["ember", "tide", "grove", "storm", "mist", "neutral"];
    this.bursts = Object.fromEntries(
      families.map((f) => {
        const cfg = burstRecipe(f);
        return [f, s.add.particles(0, 0, cfg.texture as string, cfg).setDepth(FX_DEPTH)];
      }),
    ) as Record<VfxFamily, Emitter>;
    this.trail = s.add
      .particles(0, 0, FX_TEX.glow, {
        emitting: false,
        frequency: 14,
        lifespan: 260,
        speed: { min: 0, max: 20 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.9, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        maxParticles: 40,
      })
      .setDepth(FX_DEPTH);
    this.dust = s.add
      .particles(0, 0, FX_TEX.puff, {
        emitting: false,
        speed: { min: 30, max: 110 },
        angle: { min: 180, max: 360 },
        gravityY: -20,
        lifespan: { min: 400, max: 700 },
        scale: { start: 0.8, end: 2.2 },
        alpha: { start: 0.6, end: 0 },
        tint: [0xf3ead3, 0xd8cfbc],
        maxParticles: 40,
      })
      .setDepth(1);
    this.confetti = s.add
      .particles(0, 0, FX_TEX.petal, {
        emitting: false,
        speed: { min: 140, max: 320 },
        angle: { min: 220, max: 320 },
        gravityY: 300,
        lifespan: { min: 900, max: 1500 },
        rotate: { min: 0, max: 720 },
        scale: { min: 1.2, max: 1.9 },
        tint: [0xffe45a, 0xff8a6a, 0x8fd36a, 0x6cc4ff, 0xd9a8ff],
        maxParticles: 70,
      })
      .setDepth(NUMBER_DEPTH - 1);
    this.projectile = s.add
      .image(0, 0, FX_TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.6)
      .setDepth(FX_DEPTH)
      .setVisible(false);
    for (let i = 0; i < 3; i++) {
      this.rings.push(
        s.add.image(0, 0, FX_TEX.ring).setDepth(FX_DEPTH).setVisible(false).setBlendMode(Phaser.BlendModes.ADD),
      );
    }
    this.screenFlash = s.add
      .rectangle(320, 320, 2000, 2000, 0xffffff, 1)
      .setDepth(NUMBER_DEPTH - 2)
      .setAlpha(0)
      .setVisible(false);
    for (let i = 0; i < NUMBER_POOL; i++) {
      const main = s.add
        .text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontStyle: "bold", fontSize: "22px", strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(NUMBER_DEPTH)
        .setVisible(false);
      const callout = s.add
        .text(0, 0, "", { fontFamily: '"Source Sans 3", system-ui, sans-serif', fontStyle: "bold", fontSize: "13px", stroke: "#101820", strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(NUMBER_DEPTH)
        .setVisible(false);
      this.floats.push({ main, callout });
    }
    const makeSide = (): SideState => {
      const auras = Object.fromEntries(
        STATUS_IDS.map((id) => {
          const cfg = statusRecipe(id);
          const emitter = s.add
            .particles(0, 0, cfg.texture as string, { ...cfg, emitting: false, maxParticles: 24 })
            .setDepth(FX_DEPTH - 1);
          return [id, emitter];
        }),
      ) as Record<StatusId, Emitter>;
      return {
        home: { x: 0, y: 0 },
        baseScale: { x: 1, y: 1 },
        hurt: false,
        fainting: false,
        auras,
        shield: s.add
          .image(0, 0, FX_TEX.halo)
          .setTint(0x7ec8e8)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(3)
          .setVisible(false),
        guarding: false,
      };
    };
    this.side = { wild: makeSide(), player: makeSide() };
  }

  // --- Sprite bookkeeping ---------------------------------------------------

  /** Record where a combatant rests and its fitted scale (call after fitDisplay). */
  setHome(side: Side, x: number, y: number): void {
    const st = this.side[side];
    const sprite = this.sprites()[side];
    st.home = { x, y };
    st.baseScale = { x: sprite.scaleX, y: sprite.scaleY };
    const h = sprite.displayHeight;
    for (const id of STATUS_IDS) {
      const emitter = st.auras[id];
      emitter.stopFollow();
      emitter.startFollow(sprite, 0, id === "soaked" ? -h * 0.95 : id === "dazed" ? -h * 0.98 : id === "rooted" ? -6 : -h * 0.45);
      emitter.clearEmitZones();
      emitter.addEmitZone({
        type: "random",
        source: new Phaser.Geom.Rectangle(-sprite.displayWidth * 0.32, -6, sprite.displayWidth * 0.64, 12) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource,
      });
    }
    st.shield.setPosition(x, y - h * 0.48).setDisplaySize(sprite.displayWidth * 1.5, h * 1.25);
  }

  private poseKey(sprite: Sprite): string {
    const frame = sprite.frame?.name;
    return frame && frame !== "__BASE" ? frame : sprite.texture.key;
  }

  /** Play a rendered creature anim (#377) when registered; false → caller tweens. */
  private playAnim(side: Side, anim: "idle" | "attack" | "hurt" | "faint"): boolean {
    const sprite = this.sprites()[side];
    const base = sprite.getData("poseKey") as string | undefined;
    const key = creatureAnimKey(base ?? this.poseKey(sprite), anim);
    if (!this.scene.anims.exists(key)) {
      return false;
    }
    if (!base) {
      sprite.setData("poseKey", this.poseKey(sprite));
    }
    sprite.play(key, true);
    // Faint holds its last frame (#361); attack / hurt return to idle.
    if (anim === "attack" || anim === "hurt") {
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (!this.playAnim(side, "idle")) {
          sprite.anims.stop();
        }
      });
    }
    return true;
  }

  /** Reset the pose key cache when the sprite texture changes (switch-in). */
  resetPose(side: Side): void {
    const sprite = this.sprites()[side];
    sprite.anims.stop();
    sprite.setData("poseKey", undefined);
  }

  // --- Idle -----------------------------------------------------------------

  startIdle(side: Side): void {
    const st = this.side[side];
    st.breath?.remove();
    st.breath = undefined;
    const sprite = this.sprites()[side];
    if (this.playAnim(side, "idle")) {
      return;
    }
    if (this.mode().reducedMotion) {
      return;
    }
    const proxy = { t: 0 };
    st.breath = this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: side === "wild" ? 1300 : 1500,
      delay: side === "wild" ? 0 : 340,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        if (st.hurt) {
          return;
        }
        sprite.setScale(st.baseScale.x * (1 + 0.012 * proxy.t), st.baseScale.y * (1 + 0.035 * proxy.t));
      },
    });
  }

  // --- Entrance -------------------------------------------------------------

  /** Slide + hop in from the side's edge; `done` fires when both have landed. */
  enter(side: Side, delayMs = 0, done?: () => void): void {
    const sprite = this.sprites()[side];
    const st = this.side[side];
    const t = this.timings();
    st.fainting = false;
    st.hurt = false;
    sprite.setAlpha(1).setAngle(0).setScale(st.baseScale.x, st.baseScale.y);
    this.restoreTint(side);
    if (t.entrance <= 0) {
      sprite.setPosition(st.home.x, st.home.y);
      this.startIdle(side);
      done?.();
      return;
    }
    const mode = this.mode();
    if (mode.reducedMotion) {
      sprite.setPosition(st.home.x, st.home.y).setAlpha(0);
      this.scene.tweens.add({
        targets: sprite,
        alpha: 1,
        delay: delayMs,
        duration: t.entrance,
        onComplete: () => {
          this.startIdle(side);
          done?.();
        },
      });
      return;
    }
    const dir = side === "wild" ? 1 : -1;
    sprite.setPosition(st.home.x + dir * 260, st.home.y);
    const proxy = { p: 0 };
    this.scene.tweens.add({
      targets: proxy,
      p: 1,
      delay: delayMs,
      duration: t.entrance,
      ease: "Quad.easeOut",
      onUpdate: () => {
        // Two hops while sliding in.
        const hop = Math.abs(Math.sin(proxy.p * Math.PI * 2)) * 26 * (1 - proxy.p * 0.6);
        sprite.setPosition(st.home.x + dir * 260 * (1 - proxy.p), st.home.y - hop);
      },
      onComplete: () => {
        sprite.setPosition(st.home.x, st.home.y);
        this.land(side);
        this.startIdle(side);
        done?.();
      },
    });
  }

  /** Landing squash + dust. */
  private land(side: Side): void {
    const sprite = this.sprites()[side];
    const st = this.side[side];
    if (this.mode().particles) {
      this.dust.explode(10, st.home.x, st.home.y - 4);
    }
    st.hurt = true;
    sprite.setScale(st.baseScale.x * 1.12, st.baseScale.y * 0.86);
    this.scene.tweens.add({
      targets: sprite,
      scaleX: st.baseScale.x,
      scaleY: st.baseScale.y,
      duration: 220,
      ease: "Back.easeOut",
      onComplete: () => {
        st.hurt = false;
      },
    });
  }

  /** Camera push-in that settles back to the framing zoom. */
  cameraPush(): void {
    const cam = this.scene.cameras.main;
    const base = this.frameZoom();
    const t = this.timings();
    if (t.entrance <= 0 || this.mode().reducedMotion) {
      return;
    }
    cam.setZoom(base * 1.14);
    cam.zoomTo(base, t.entrance + t.entranceStagger + 260, "Cubic.easeOut");
  }

  /** The overlay framing zoom (same formula as applyOverlayPixelRatio), read fresh after resizes. */
  private frameZoom(): number {
    const { width, height } = this.scene.scale;
    return Math.min(width / 640, height / 640);
  }

  /** "VS" banner for sovereign / boss spars. */
  vsBanner(left: string, right: string): number {
    const t = this.timings();
    if (t.vsBanner <= 0) {
      return 0;
    }
    const s = this.scene;
    const band = s.add.rectangle(320, 300, 700, 96, 0x101820, 0.88).setDepth(NUMBER_DEPTH - 3).setScale(1, 0);
    const stripeA = s.add.rectangle(320, 254, 700, 4, 0xff7a5c, 1).setDepth(NUMBER_DEPTH - 3).setScale(0, 1);
    const stripeB = s.add.rectangle(320, 346, 700, 4, 0x7ec8e8, 1).setDepth(NUMBER_DEPTH - 3).setScale(0, 1);
    const vs = s.add
      .text(320, 300, "VS", {
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold italic",
        fontSize: "58px",
        color: "#ffe45a",
        stroke: "#5a1800",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(NUMBER_DEPTH - 2)
      .setScale(3)
      .setAlpha(0);
    const nameStyle = {
      fontFamily: '"Source Sans 3", system-ui, sans-serif',
      fontStyle: "bold",
      fontSize: "20px",
      color: "#fff7e0",
      stroke: "#101820",
      strokeThickness: 4,
    };
    const l = s.add.text(-200, 300, left, nameStyle).setOrigin(1, 0.5).setDepth(NUMBER_DEPTH - 2);
    const r = s.add.text(840, 300, right, nameStyle).setOrigin(0, 0.5).setDepth(NUMBER_DEPTH - 2);
    const parts = [band, stripeA, stripeB, vs, l, r];
    s.tweens.add({ targets: band, scaleY: 1, duration: 160, ease: "Quad.easeOut" });
    s.tweens.add({ targets: [stripeA, stripeB], scaleX: 1, duration: 260, ease: "Quad.easeOut" });
    s.tweens.add({ targets: l, x: 270, duration: 300, delay: 100, ease: "Back.easeOut" });
    s.tweens.add({ targets: r, x: 370, duration: 300, delay: 100, ease: "Back.easeOut" });
    s.tweens.add({
      targets: vs,
      scale: 1,
      alpha: 1,
      duration: 260,
      delay: 220,
      ease: "Back.easeOut",
      onComplete: () => {
        if (!this.mode().reducedMotion) {
          s.cameras.main.shake(140, 0.006);
        }
        if (this.mode().particles) {
          this.bursts.storm.explode(18, 320, 300);
        }
      },
    });
    s.tweens.add({
      targets: parts,
      alpha: 0,
      delay: t.vsBanner - 220,
      duration: 220,
      onComplete: () => {
        for (const p of parts) {
          p.destroy();
        }
      },
    });
    return t.vsBanner;
  }

  // --- Attacks --------------------------------------------------------------

  /**
   * Attacker wind-up → lunge (or projectile) → `onImpact` at contact.
   * Fast mode calls `onImpact` synchronously.
   */
  attack(side: Side, move: MoveDefinition, role: MoveRole, onImpact: () => void): void {
    const t = this.timings();
    if (t.lunge <= 0 && t.projectile <= 0) {
      onImpact();
      return;
    }
    const s = this.scene;
    const sprites = this.sprites();
    const attacker = sprites[side];
    const target = side === "wild" ? sprites.player : sprites.wild;
    const st = this.side[side];
    const family = vfxFamily(move.type);
    const mode = this.mode();
    const animated = this.playAnim(side, "attack");

    if (role === "guard" || move.power <= 0) {
      // Self-cast: a small hop + shimmer, effect resolves right away.
      this.castSparkle(side, family);
      if (!mode.reducedMotion && !animated) {
        s.tweens.add({ targets: attacker, y: st.home.y - 14, duration: 120, yoyo: true, ease: "Quad.easeOut" });
      }
      s.time.delayedCall(140, onImpact);
      return;
    }

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ranged = usesProjectile(role);
    const reach = mode.reducedMotion ? 10 : ranged ? 22 : 64;
    const nx = (dx / len) * reach;
    const ny = (dy / len) * reach;

    if (!animated) {
      s.tweens.chain({
        targets: attacker,
        tweens: [
          { x: st.home.x - nx * 0.18, y: st.home.y - ny * 0.18, duration: 70, ease: "Quad.easeOut" },
          { x: st.home.x + nx, y: st.home.y + ny, duration: t.lunge, ease: "Quad.easeIn" },
          { x: st.home.x, y: st.home.y, duration: 220, ease: "Sine.easeOut" },
        ],
      });
    }

    if (!ranged) {
      s.time.delayedCall(70 + t.lunge, onImpact);
      return;
    }

    const color = FAMILY_COLOR[family];
    const fromY = attacker.y - attacker.displayHeight * 0.5;
    const toY = target.y - target.displayHeight * 0.5;
    this.castSparkle(side, family);
    this.projectile.setPosition(attacker.x, fromY).setTint(color).setVisible(true).setAlpha(1).setScale(role === "finisher" ? 2.3 : 1.6);
    if (mode.particles) {
      this.trail.setParticleTint(color);
      this.trail.startFollow(this.projectile);
      this.trail.start();
    }
    s.tweens.add({
      targets: this.projectile,
      x: target.x,
      y: toY,
      delay: 70,
      duration: t.projectile,
      ease: "Quad.easeIn",
      onUpdate: (tw) => {
        // Arc over the field.
        this.projectile.y -= Math.sin(tw.progress * Math.PI) * 2.2;
      },
      onComplete: () => {
        this.projectile.setVisible(false);
        this.trail.stop();
        onImpact();
      },
    });
  }

  private castSparkle(side: Side, family: VfxFamily): void {
    const sprite = this.sprites()[side];
    const mode = this.mode();
    if (!mode.particles || mode.fast) {
      return;
    }
    this.bursts[family].explode(8, sprite.x, sprite.y - sprite.displayHeight * 0.55);
    this.ring(sprite.x, sprite.y - sprite.displayHeight * 0.5, FAMILY_COLOR[family], 0.4, 1.4);
  }

  private ring(x: number, y: number, color: number, from: number, to: number): void {
    const ring = this.rings[this.ringIndex];
    this.ringIndex = (this.ringIndex + 1) % this.rings.length;
    this.scene.tweens.killTweensOf(ring);
    ring.setPosition(x, y).setTint(color).setScale(from).setAlpha(0.95).setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      scale: to,
      alpha: 0,
      duration: 340,
      ease: "Cubic.easeOut",
      onComplete: () => ring.setVisible(false),
    });
  }

  /**
   * Contact: flash + family burst + hit-pause, then recoil / squash, shake,
   * zoom punch on finishers. `number` is drawn during the freeze.
   */
  impact(
    target: Side,
    hit: {
      damage: number;
      maxHp: number;
      type: string;
      role: MoveRole;
      effective: boolean;
      resisted: boolean;
      strong: boolean;
    },
    number: DamageNumberStyle,
  ): void {
    const s = this.scene;
    const mode = this.mode();
    const t = this.timings();
    const sprite = this.sprites()[target];
    const st = this.side[target];
    const family = vfxFamily(hit.type);
    const finisher = hit.role === "finisher";
    const cx = sprite.x;
    const cy = sprite.y - sprite.displayHeight * 0.5;

    const count = burstCount(hit.role, hit.effective, mode);
    if (count > 0) {
      this.bursts[family].explode(count, cx, cy);
      if (hit.effective) {
        this.bursts.storm.explode(10, cx, cy);
      }
      this.ring(cx, cy, hit.effective ? 0xffe45a : FAMILY_COLOR[family], 0.3, finisher ? 2.6 : 1.8);
    }
    sprite.setTintFill(hit.effective ? 0xffffff : hit.resisted ? 0xb8b0a0 : target === "wild" ? 0xffd9d2 : 0xffe0a8);
    this.number(target, number);
    if (number.screenFlash && !mode.fast) {
      this.flashScreen(hit.effective ? 0xfff2b0 : 0xffffff, number.screenFlash);
    }

    const pause = hitPauseMs(hit.damage, hit.maxHp, { effective: hit.effective, finisher }, mode);
    const afterPause = (): void => {
      if (!st.fainting) {
        this.restoreTint(target);
      }
      if (t.recoil <= 0) {
        return;
      }
      if (!st.fainting && !this.playAnim(target, "hurt") && !mode.reducedMotion) {
        const away = target === "wild" ? 1 : -1;
        const knock = (hit.strong || finisher ? 22 : 12) * (hit.resisted ? 0.5 : 1);
        st.hurt = true;
        s.tweens.killTweensOf(sprite);
        sprite.setScale(st.baseScale.x * 1.1, st.baseScale.y * 0.88);
        s.tweens.add({
          targets: sprite,
          x: st.home.x + away * knock,
          y: st.home.y - (finisher ? 6 : 0),
          angle: away * (finisher ? 8 : 4),
          duration: t.recoil * 0.4,
          ease: "Quad.easeOut",
          yoyo: true,
          onComplete: () => {
            sprite.setPosition(st.home.x, st.home.y).setAngle(0);
          },
        });
        s.tweens.add({
          targets: sprite,
          scaleX: st.baseScale.x,
          scaleY: st.baseScale.y,
          duration: t.recoil,
          ease: "Back.easeOut",
          onComplete: () => {
            st.hurt = false;
          },
        });
      }
      const shake = shakeFor(hit.damage, hit.strong || hit.effective, finisher, mode);
      if (shake.ms > 0) {
        s.cameras.main.shake(shake.ms, shake.amp);
      }
      const punch = zoomPunchFor(finisher, mode);
      if (punch > 1) {
        const cam = s.cameras.main;
        const base = this.frameZoom();
        // Chain on ZOOM_COMPLETE: starting a zoom from the progress callback gets cancelled.
        cam.once(Phaser.Cameras.Scene2D.Events.ZOOM_COMPLETE, () => {
          cam.zoomTo(base, 300, "Sine.easeInOut", true);
        });
        cam.zoomTo(base * punch, 70, "Quad.easeOut", true);
      }
    };
    if (pause > 0) {
      // Freeze-frame: every tween (lunge return, breathing, number pop) holds.
      s.tweens.pauseAll();
      s.time.delayedCall(pause, () => {
        s.tweens.resumeAll();
        afterPause();
      });
    } else {
      s.time.delayedCall(Math.max(60, t.recoil * 0.3), afterPause);
    }
  }

  /** Small flash used by fixed-damage sovereign blows and the dev kill cheat. */
  quickFlash(target: Side, color: number, ms = 120): void {
    const sprite = this.sprites()[target];
    sprite.setTintFill(color);
    this.scene.time.delayedCall(ms, () => this.restoreTint(target));
  }

  private flashScreen(color: number, alpha: number): void {
    if (this.mode().reducedMotion) {
      alpha *= 0.5;
    }
    const r = this.screenFlash;
    this.scene.tweens.killTweensOf(r);
    r.setFillStyle(color, 1).setAlpha(alpha).setVisible(true);
    this.scene.tweens.add({ targets: r, alpha: 0, duration: 220, onComplete: () => r.setVisible(false) });
  }

  /** Pooled floating number with pop + rise; optional callout under it. */
  number(target: Side, style: DamageNumberStyle): void {
    const sprite = this.sprites()[target];
    const f = this.floats[this.floatIndex];
    this.floatIndex = (this.floatIndex + 1) % this.floats.length;
    this.scene.tweens.killTweensOf([f.main, f.callout]);
    const x = sprite.x + (target === "wild" ? -40 : 46);
    const y = sprite.y - sprite.displayHeight * 0.78;
    const fast = this.mode().fast;
    f.main
      .setText(style.text)
      .setStyle({ color: style.color, stroke: style.stroke, fontSize: `${style.fontSize}px` })
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(fast ? 1 : style.pop)
      .setVisible(true);
    this.scene.tweens.add({ targets: f.main, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.scene.tweens.add({
      targets: f.main,
      y: y - style.rise,
      alpha: 0,
      delay: fast ? 250 : 380,
      duration: 620,
      ease: "Cubic.easeIn",
      onComplete: () => f.main.setVisible(false),
    });
    if (style.callout) {
      f.callout
        .setText(style.callout.text)
        .setFontSize(style.fontSize >= 30 ? 16 : 13)
        .setColor(style.callout.color)
        .setPosition(x, y + style.fontSize * 0.75)
        .setAlpha(1)
        .setVisible(true);
      this.scene.tweens.add({
        targets: f.callout,
        alpha: 0,
        y: y + style.fontSize * 0.75 - style.rise * 0.5,
        delay: fast ? 300 : 520,
        duration: 520,
        onComplete: () => f.callout.setVisible(false),
      });
    } else {
      f.callout.setVisible(false);
    }
  }

  /** Burst of the status colour when a status lands. */
  statusApplied(target: Side, id: StatusId): void {
    const mode = this.mode();
    const sprite = this.sprites()[target];
    if (!mode.particles || mode.fast) {
      return;
    }
    const family: VfxFamily =
      id === "burn" ? "ember" : id === "soaked" ? "tide" : id === "rooted" ? "grove" : "storm";
    this.bursts[family].explode(12, sprite.x, sprite.y - sprite.displayHeight * 0.4);
  }

  /** Healing sparkle (guard heal). */
  heal(side: Side): void {
    const sprite = this.sprites()[side];
    if (this.mode().particles && !this.mode().fast) {
      this.bursts.grove.explode(8, sprite.x, sprite.y - sprite.displayHeight * 0.3);
    }
  }

  // --- Status auras + guard shimmer ------------------------------------------

  syncStatuses(side: Side, who: BattleCombatant): void {
    const st = this.side[side];
    const mode = this.mode();
    const live = mode.particles && !mode.fast;
    for (const id of STATUS_IDS) {
      const on = live && (who.statuses ?? []).some((s) => s.id === id && s.turns > 0);
      const emitter = st.auras[id];
      if (on && !emitter.emitting) {
        emitter.start();
      } else if (!on && emitter.emitting) {
        emitter.stop();
      }
    }
    const guarding = who.guarding === true;
    if (guarding === st.guarding) {
      return;
    }
    st.guarding = guarding;
    st.shieldTween?.remove();
    st.shieldTween = undefined;
    if (!guarding) {
      this.scene.tweens.add({ targets: st.shield, alpha: 0, duration: 180, onComplete: () => st.shield.setVisible(false) });
      return;
    }
    st.shield.setVisible(true).setAlpha(0.55);
    if (!mode.reducedMotion && !mode.fast) {
      st.shieldTween = this.scene.tweens.add({
        targets: st.shield,
        alpha: { from: 0.75, to: 0.3 },
        scaleX: st.shield.scaleX * 1.05,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      const sprite = this.sprites()[side];
      this.ring(sprite.x, sprite.y - sprite.displayHeight * 0.48, 0x7ec8e8, 0.6, 2.2);
    }
  }

  // --- Faint ----------------------------------------------------------------

  faint(side: Side, done?: () => void): void {
    const s = this.scene;
    const sprite = this.sprites()[side];
    const st = this.side[side];
    const t = this.timings();
    st.breath?.remove();
    st.breath = undefined;
    st.hurt = true;
    st.fainting = true;
    sprite.anims.stop();
    // Rendered slump (#361) plays first; the fade below then waits for it.
    const slumped = !this.mode().reducedMotion && this.playAnim(side, "faint");
    for (const id of STATUS_IDS) {
      st.auras[id].stop();
    }
    st.shieldTween?.remove();
    st.shield.setVisible(false);
    st.guarding = false;
    s.tweens.killTweensOf(sprite);
    sprite.setTint(0x8a8aa0);
    if (this.mode().particles && !this.mode().fast) {
      this.dust.explode(16, st.home.x, st.home.y - 6);
    }
    const reduced = this.mode().reducedMotion;
    s.tweens.add({
      targets: sprite,
      y: reduced ? st.home.y : st.home.y + (slumped ? 8 : 26),
      scaleY: reduced || slumped ? st.baseScale.y : st.baseScale.y * 0.55,
      scaleX: reduced || slumped ? st.baseScale.x : st.baseScale.x * 1.08,
      alpha: 0,
      delay: slumped ? Math.min(520, t.faint) : t.faint > 200 ? 160 : 0,
      duration: t.faint,
      ease: "Quad.easeIn",
      onComplete: () => {
        st.hurt = false;
        done?.();
      },
    });
  }

  /** Celebration confetti behind the victory card. */
  confettiBurst(x: number, y: number): void {
    if (this.mode().particles && !this.mode().fast) {
      this.confetti.explode(46, x, y);
    }
  }

  // --- Intent telegraph -----------------------------------------------------

  /** Glow behind the intent plate; pulses faster as the finisher approaches. */
  intentGlow(plate: Phaser.GameObjects.Rectangle, glow: IntentGlow, color: number): void {
    this.clearIntentGlow();
    if (glow.level === 0) {
      return;
    }
    const rect = this.scene.add
      .rectangle(plate.x, plate.y, plate.width + 10, plate.height + 10, color, glow.level === 2 ? 0.55 : 0.3)
      .setDepth(plate.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.glow = { rect };
    if (this.mode().reducedMotion) {
      return;
    }
    this.glow.tween = this.scene.tweens.add({
      targets: [rect, plate],
      alpha: { from: 1, to: glow.minAlpha },
      scaleX: { from: 1, to: glow.level === 2 ? 1.06 : 1.02 },
      scaleY: { from: 1, to: glow.level === 2 ? 1.25 : 1.1 },
      duration: glow.periodMs,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  clearIntentGlow(): void {
    this.glow?.tween?.remove();
    this.glow?.rect.destroy();
    this.glow = undefined;
  }
}
