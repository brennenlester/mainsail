import Phaser from "phaser";
import { getActiveCreatures } from "../../creatures/party";
import { screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "../../isometric";
import { selectOverworldFollowers } from "../../shrine/presence";
import { isSailing } from "../../world/dockBoat";
import { hasPlayerName } from "../../world/playerName";
import { getZoneProps } from "../../world/zoneProps";
import { TileType, type ZoneDefinition } from "../../world/zoneTypes";
import { MAX_FOLLOWERS } from "../partyOverworldFollowers";
import {
  ambientLayersFor,
  emitIntervalMs,
  targetAlive,
  type AmbientKind,
  type AmbientLayer,
  type FxQuality,
} from "./ambientProfiles";
import {
  colorMatrixFor,
  dayNightPhase,
  INTERIOR_LIGHT,
  sampleDayNight,
  type DayNightSample,
} from "./dayNight";
import {
  followerPose,
  nextEmoteDelayMs,
  pickEmote,
  type EmoteKind,
} from "./followerMotion";
import {
  bindEffectsToggle,
  effectsEnabled,
  parseForcedPhase,
  parseForcedQuality,
  prefersReducedMotion,
} from "./fxSettings";
import { emoteTextureKey, ensureFxTextures, FX_TEX } from "./fxTextures";
import { createGovernor, stepGovernor, type GovernorState } from "./qualityGovernor";
import { showZoneTitleCard } from "./titleCard";

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

type AmbientEmitter = {
  layer: AmbientLayer;
  emitter: Emitter;
  meanLife: number;
};

type GlowSource = {
  image: Phaser.GameObjects.Image;
  base: number;
  night: number;
  flicker: boolean;
};

type ActiveEmote = {
  image: Phaser.GameObjects.Image;
  index: number;
};

/** Session clock shared across zone loads so time keeps flowing. */
const SESSION_START_MS = typeof performance !== "undefined" ? performance.now() : 0;
const LOOK_AHEAD_PX = 22;
const LIGHT_REFRESH_MS = 200;
const AMBIENT_REFRESH_MS = 600;

/** Party snapshot taken before a battle/shrine/dialogue pause. */
type PartySnapshot = Map<string, { level: number; definitionId: string }>;
let partySnapshot: PartySnapshot | undefined;

function snapshotParty(): PartySnapshot {
  const snap: PartySnapshot = new Map();
  for (const c of getActiveCreatures()) {
    snap.set(c.instanceId, { level: c.level, definitionId: c.definitionId });
  }
  return snap;
}

/** Adapt a Geom shape to the emit-zone source shape Phaser's types expect. */
function shapeSource(shape: { getRandomPoint(): Phaser.Geom.Point }) {
  const tmp = new Phaser.Geom.Point();
  return {
    getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
      const p = (shape.getRandomPoint as (o: Phaser.Geom.Point) => Phaser.Geom.Point)(tmp);
      point.x = p.x;
      point.y = p.y;
    },
  };
}

/** 0→1→0 envelope over a particle's life so nothing pops. */
function envelope(t: number, inFrac = 0.2, outFrac = 0.3): number {
  return Math.max(0, Math.min(1, t / inFrac, (1 - t) / outFrac));
}

function fade(peak: number, inFrac?: number, outFrac?: number) {
  return {
    onEmit: () => 0,
    onUpdate: (_p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) =>
      peak * envelope(t, inFrac, outFrac),
  };
}

function flickerFade(peak: number, hz: number) {
  return {
    onEmit: () => 0,
    onUpdate: (p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) =>
      peak *
      envelope(t, 0.15, 0.25) *
      (0.45 + 0.55 * Math.abs(Math.sin(t * hz * Math.PI + p.x * 0.05))),
  };
}

/** Phaser emitter recipe for each ambient kind (texture + motion). */
function ambientRecipe(kind: AmbientKind): { config: EmitterConfig; meanLife: number } {
  switch (kind) {
    case "fireflies":
      return {
        meanLife: 5500,
        config: {
          texture: FX_TEX.glow,
          lifespan: { min: 4000, max: 7000 },
          speed: { min: 4, max: 14 },
          angle: { min: 0, max: 360 },
          scale: { min: 0.45, max: 0.8 },
          tint: [0xffe84a, 0xd8ff5a, 0xffd860],
          alpha: flickerFade(1, 6),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "leaves":
      return {
        meanLife: 7500,
        config: {
          texture: FX_TEX.leaf,
          lifespan: { min: 6000, max: 9000 },
          speedX: { min: -22, max: -6 },
          speedY: { min: 8, max: 20 },
          rotate: { start: 0, end: 540 },
          scale: { min: 1.1, max: 1.6 },
          tint: [0x7fb34a, 0xa8c25a, 0xd0a040, 0x5f9a4a],
          alpha: fade(0.9),
        },
      };
    case "petals":
      return {
        meanLife: 7000,
        config: {
          texture: FX_TEX.petal,
          lifespan: { min: 5500, max: 8500 },
          speedX: { min: -18, max: -4 },
          speedY: { min: 6, max: 16 },
          rotate: { start: 0, end: 360 },
          scale: { min: 1.1, max: 1.5 },
          tint: [0xffd0dc, 0xfff0f4, 0xffc0a8],
          alpha: fade(0.9),
        },
      };
    case "pollen":
      return {
        meanLife: 6000,
        config: {
          texture: FX_TEX.glow,
          lifespan: { min: 4500, max: 7500 },
          speedX: { min: -6, max: 6 },
          speedY: { min: -8, max: -2 },
          scale: { min: 0.2, max: 0.34 },
          tint: [0xfff8d0, 0xffffff],
          alpha: fade(0.75),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "mist":
      return {
        meanLife: 12000,
        config: {
          texture: FX_TEX.halo,
          lifespan: { min: 10000, max: 14000 },
          speedX: { min: 3, max: 9 },
          speedY: { min: -2, max: 2 },
          scale: { min: 1.4, max: 2.4 },
          tint: [0xf4f0ff, 0xe8f4ff],
          alpha: fade(0.14, 0.3, 0.35),
        },
      };
    case "embers":
      return {
        meanLife: 3500,
        config: {
          texture: FX_TEX.glow,
          lifespan: { min: 2500, max: 4500 },
          speedX: { min: -8, max: 8 },
          speedY: { min: -38, max: -16 },
          scale: { start: 0.5, end: 0.12 },
          tint: [0xffa040, 0xff7a2a, 0xffd070],
          alpha: flickerFade(1, 8),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "glints":
      return {
        meanLife: 1000,
        config: {
          texture: FX_TEX.spark,
          lifespan: { min: 700, max: 1300 },
          speed: 0,
          scale: { min: 0.5, max: 0.9 },
          tint: [0xffffff, 0xd8f4ff],
          alpha: fade(0.9, 0.4, 0.6),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "spores":
      return {
        meanLife: 6500,
        config: {
          texture: FX_TEX.glow,
          lifespan: { min: 5000, max: 8000 },
          speedX: { min: -5, max: 5 },
          speedY: { min: -12, max: -3 },
          scale: { min: 0.22, max: 0.42 },
          tint: [0xc8a8ff, 0x9ef0e8, 0xf0c8ff],
          alpha: flickerFade(0.9, 3),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "spirits":
      return {
        meanLife: 5000,
        config: {
          texture: FX_TEX.spark,
          lifespan: { min: 3500, max: 6500 },
          speedX: { min: -4, max: 4 },
          speedY: { min: -16, max: -6 },
          scale: { min: 0.45, max: 0.8 },
          rotate: { start: 0, end: 180 },
          tint: [0xe8dcff, 0xfff0c0, 0xc8d8ff],
          alpha: flickerFade(0.9, 2.5),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
    case "motes":
      return {
        meanLife: 7000,
        config: {
          texture: FX_TEX.glow,
          lifespan: { min: 5000, max: 9000 },
          speedX: { min: -3, max: 5 },
          speedY: { min: -5, max: 2 },
          scale: { min: 0.16, max: 0.26 },
          tint: [0xffe8c0, 0xfff4e0],
          alpha: fade(0.6, 0.3, 0.3),
          blendMode: Phaser.BlendModes.ADD,
        },
      };
  }
}

/**
 * Overworld juice (#362): ambient particles, day/night + vignette, warm glows,
 * footstep dust, gather/ritual/level-up bursts, follower life, zone title card,
 * and camera look-ahead. One instance per IsometricScene; `enterZone` rebuilds
 * the game objects after the scene clears its display list.
 */
export class OverworldFx {
  private readonly scene: Phaser.Scene;
  private readonly reducedMotion = prefersReducedMotion();
  private readonly forcedPhase = parseForcedPhase(window.location.search);
  private readonly forcedQuality = parseForcedQuality(window.location.search);
  private enabled = effectsEnabled();
  private governor: GovernorState = createGovernor();
  private quality: FxQuality = "high";
  private zone?: ZoneDefinition;
  private origin = { x: 0, y: 0 };
  private fxDepth = 0;
  private ambient: AmbientEmitter[] = [];
  private needsPrewarm = false;
  private view = new Phaser.Geom.Rectangle();
  private glows: GlowSource[] = [];
  private playerGlow?: Phaser.GameObjects.Image;
  private puffs?: Emitter;
  private sparks?: Emitter;
  private chips?: Emitter;
  private colorMatrix?: Phaser.FX.ColorMatrix;
  private vignette?: Phaser.FX.Vignette;
  private light: DayNightSample = sampleDayNight(0.5);
  private lightClock = LIGHT_REFRESH_MS;
  private ambientClock = AMBIENT_REFRESH_MS;
  private wasMoving = false;
  private stoppedAt = -Infinity;
  private nextEmoteAt = 0;
  private emote?: ActiveEmote;
  private lookAhead = new Phaser.Math.Vector2();
  private pendingTitle?: { name: string };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureFxTextures(scene);
    bindEffectsToggle((enabled) => {
      this.enabled = enabled;
      this.applyQuality();
    });
    this.quality = this.resolveQuality();
    if (import.meta.env.DEV) {
      // ponytail: dev-only QA handles (stats + scene for pause/resume probes).
      (window as unknown as { __ivyScene?: Phaser.Scene }).__ivyScene = scene;
      (window as unknown as { __ivyFx?: () => unknown }).__ivyFx = () => ({
        quality: this.quality,
        fps: Math.round(this.scene.game.loop.actualFps),
        light: this.light.label,
        nightness: Number(this.light.nightness.toFixed(2)),
        particles: this.ambient.reduce((n, a) => n + a.emitter.getAliveParticleCount(), 0),
      });
    }
  }

  /** Rebuild per-zone FX after the scene cleared its children. */
  enterZone(
    zone: ZoneDefinition,
    origin: { x: number; y: number },
    playerDepth: number,
    announce: boolean,
  ): void {
    const previous = this.zone;
    this.zone = zone;
    this.origin = origin;
    this.fxDepth = playerDepth + 2;
    this.ambient = [];
    this.glows = [];
    this.emote = undefined;
    ensureFxTextures(this.scene);

    for (const layer of ambientLayersFor(zone.id)) {
      const { config, meanLife } = ambientRecipe(layer.kind);
      const emitter = this.scene.add.particles(0, 0, config.texture as string, {
        ...config,
        frequency: -1,
        quantity: 1,
        emitting: false,
        emitZone: { type: "random", source: this.ambientSource(layer.kind) },
      });
      emitter.setDepth(layer.kind === "glints" ? playerDepth - 0.5 : this.fxDepth);
      this.ambient.push({ layer, emitter, meanLife });
    }
    this.needsPrewarm = true;

    this.puffs = this.scene.add
      .particles(0, 0, FX_TEX.puff, {
        lifespan: { min: 360, max: 520 },
        speedX: { min: -16, max: 16 },
        speedY: { min: -12, max: -3 },
        scale: { start: 0.35, end: 0.8 },
        alpha: { start: 0.55, end: 0 },
        tint: zone.interior ? 0xc8a888 : 0xeadcbc,
        emitting: false,
      })
      .setDepth(playerDepth - 0.5);
    this.chips = this.scene.add
      .particles(0, 0, FX_TEX.chip, {
        lifespan: { min: 500, max: 800 },
        speed: { min: 50, max: 110 },
        angle: { min: 200, max: 340 },
        gravityY: 260,
        rotate: { start: 0, end: 360 },
        scale: { min: 0.5, max: 0.9 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(this.fxDepth);
    this.sparks = this.scene.add
      .particles(0, 0, FX_TEX.spark, {
        lifespan: { min: 600, max: 1100 },
        speed: { min: 30, max: 90 },
        angle: { min: 0, max: 360 },
        gravityY: -40,
        scale: { start: 0.7, end: 0 },
        rotate: { start: 0, end: 180 },
        alpha: { start: 1, end: 0.2 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.fxDepth);

    this.buildGlows(zone, playerDepth);
    this.notePartyBaseline();
    this.light = this.sampleLight();
    this.applyQuality();
    this.lightClock = 0;

    if (announce || !previous) {
      this.pendingTitle = { name: zone.name };
    }
  }

  /** Per-frame tick (runs even while the name intro is up). */
  update(deltaMs: number, playerX: number, playerY: number, moving: boolean, facing: string): void {
    if (!this.zone) {
      return;
    }
    const cam = this.scene.cameras.main;
    const wv = cam.worldView;
    this.view.setTo(wv.x - 32, wv.y - 32, wv.width + 64, wv.height + 64);

    this.governor = stepGovernor(this.governor, this.scene.game.loop.actualFps, deltaMs);
    if (this.resolveQuality() !== this.quality) {
      this.applyQuality();
    }

    this.lightClock -= deltaMs;
    if (this.lightClock <= 0) {
      this.lightClock = LIGHT_REFRESH_MS;
      this.light = this.sampleLight();
      this.applyLight();
    }
    this.flickerGlows(playerX, playerY);

    this.ambientClock -= deltaMs;
    if (this.needsPrewarm && wv.width > 1) {
      this.needsPrewarm = false;
      this.retargetAmbient(true);
    } else if (this.ambientClock <= 0) {
      this.ambientClock = AMBIENT_REFRESH_MS;
      this.retargetAmbient(false);
    }

    this.updateLookAhead(moving, facing);

    if (this.pendingTitle && hasPlayerName()) {
      const isOutdoor = !this.zone.interior;
      showZoneTitleCard(this.pendingTitle.name, isOutdoor ? this.light.label : "indoors");
      this.pendingTitle = undefined;
    }
  }

  /** Apply breathing/hop to follower sprites right after the scene syncs them. */
  animateFollowers(
    sprites: readonly Phaser.GameObjects.Image[],
    moonDots: readonly Phaser.GameObjects.Arc[],
    moving: boolean,
  ): void {
    const now = this.scene.time.now;
    if (this.wasMoving && !moving) {
      this.stoppedAt = now;
      this.nextEmoteAt = now + nextEmoteDelayMs(Math.random());
    }
    this.wasMoving = moving;
    const sinceStop = now - this.stoppedAt;
    for (let i = 0; i < sprites.length; i += 1) {
      const sprite = sprites[i]!;
      const pose = followerPose(now, i, moving, sinceStop, this.reducedMotion);
      sprite.y += pose.dy;
      sprite.setScale(sprite.scaleX * pose.scaleX, sprite.scaleY * pose.scaleY);
      const dot = moonDots[i];
      if (dot) {
        dot.y += pose.dy;
      }
    }
    this.updateEmote(sprites, moving, now);
  }

  footstep(x: number, y: number): void {
    if (this.reducedMotion || this.quality === "off" || isSailing() || !this.puffs) {
      return;
    }
    this.puffs.explode(this.quality === "low" ? 1 : 3, x, y - 2);
  }

  gatherBurst(x: number, y: number, color: number): void {
    this.chips?.setParticleTint(color);
    this.chips?.explode(this.quality === "high" ? 12 : 6, x, y);
    this.sparks?.setParticleTint(0xfff4c0);
    this.sparks?.explode(this.quality === "high" ? 6 : 3, x, y - 6);
  }

  /** Lavender/gold column rising off the altar after a shrine visit. */
  shrineRitual(x: number, y: number): void {
    const ring = this.scene.add
      .image(x, y - 6, FX_TEX.ring)
      .setTint(0xe8d8ff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.fxDepth)
      .setScale(0.2)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
    const column = this.scene.add
      .particles(x, y - 8, FX_TEX.spark, {
        lifespan: { min: 900, max: 1500 },
        speedX: { min: -18, max: 18 },
        speedY: { min: -90, max: -40 },
        scale: { start: 0.6, end: 0 },
        rotate: { start: 0, end: 220 },
        tint: [0xe8d8ff, 0xfff0b0, 0xc0d8ff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: this.quality === "high" ? 30 : 70,
        emitZone: {
          type: "random" as const,
          source: shapeSource(new Phaser.Geom.Circle(0, 0, 18)),
        },
        duration: 1400,
      })
      .setDepth(this.fxDepth);
    column.once(Phaser.GameObjects.Particles.Events.COMPLETE, () => column.destroy());
  }

  /**
   * Celebrate party changes since the last snapshot: gold sparks for a level
   * up, a prismatic flash for an evolution, a heart for a new friend.
   */
  celebratePartyChanges(
    sprites: readonly Phaser.GameObjects.Image[],
    fallback: { x: number; y: number },
  ): void {
    const before = partySnapshot;
    partySnapshot = snapshotParty();
    if (!before) {
      return;
    }
    const followers = selectOverworldFollowers(getActiveCreatures(), MAX_FOLLOWERS);
    let delay = 0;
    for (const creature of getActiveCreatures()) {
      const prev = before.get(creature.instanceId);
      const idx = followers.findIndex((c) => c.instanceId === creature.instanceId);
      const sprite = idx >= 0 ? sprites[idx] : undefined;
      const at = sprite
        ? { x: sprite.x, y: sprite.y - sprite.displayHeight / 2 }
        : { x: fallback.x, y: fallback.y - 20 };
      if (!prev) {
        if (idx >= 0) {
          this.scene.time.delayedCall(delay, () => this.showEmote(sprites, idx, "heart"));
        }
      } else if (prev.definitionId !== creature.definitionId) {
        this.scene.time.delayedCall(delay, () => this.evolveFlash(at.x, at.y));
      } else if (creature.level > prev.level) {
        this.scene.time.delayedCall(delay, () => this.levelUpSparkle(at.x, at.y));
      } else {
        continue;
      }
      delay += 260;
    }
  }

  /** Record the party before a pause so the resume can diff it. */
  notePartyBaseline(): void {
    if (!partySnapshot) {
      partySnapshot = snapshotParty();
    }
  }

  destroy(): void {
    this.scene.cameras.main.postFX.clear();
    this.colorMatrix = undefined;
    this.vignette = undefined;
  }

  private levelUpSparkle(x: number, y: number): void {
    const burst = this.scene.add
      .particles(x, y + 10, FX_TEX.spark, {
        lifespan: { min: 700, max: 1200 },
        speedX: { min: -24, max: 24 },
        speedY: { min: -110, max: -50 },
        scale: { start: 0.9, end: 0 },
        rotate: { start: 0, end: 200 },
        tint: [0xffe070, 0xfff6c0, 0xffc040],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.fxDepth);
    burst.explode(this.quality === "high" ? 22 : 10);
    this.scene.time.delayedCall(1300, () => burst.destroy());
    this.pulseRing(x, y, 0xffe070);
  }

  private evolveFlash(x: number, y: number): void {
    const flash = this.scene.add
      .image(x, y, FX_TEX.halo)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff8e8)
      .setDepth(this.fxDepth)
      .setScale(0.3)
      .setAlpha(1);
    this.scene.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });
    const burst = this.scene.add
      .particles(x, y, FX_TEX.spark, {
        lifespan: { min: 800, max: 1400 },
        speed: { min: 60, max: 150 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.1, end: 0 },
        rotate: { start: 0, end: 300 },
        tint: [0xffffff, 0xffd0f0, 0xc0f0ff, 0xfff0a0],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.fxDepth);
    burst.explode(this.quality === "high" ? 36 : 16);
    this.scene.time.delayedCall(1500, () => burst.destroy());
    this.pulseRing(x, y, 0xffffff);
    if (!this.reducedMotion) {
      this.scene.cameras.main.shake(180, 0.003);
    }
  }

  private pulseRing(x: number, y: number, tint: number): void {
    const ring = this.scene.add
      .image(x, y, FX_TEX.ring)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.fxDepth)
      .setScale(0.15);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.1,
      alpha: 0,
      duration: 700,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private updateEmote(
    sprites: readonly Phaser.GameObjects.Image[],
    moving: boolean,
    now: number,
  ): void {
    if (this.emote) {
      const sprite = sprites[this.emote.index];
      if (!sprite || !this.emote.image.active) {
        this.emote.image.destroy();
        this.emote = undefined;
      } else {
        this.emote.image.setPosition(sprite.x + 8, sprite.y - sprite.displayHeight - 2);
      }
      return;
    }
    if (moving || sprites.length === 0 || this.reducedMotion || now < this.nextEmoteAt) {
      return;
    }
    if (now - this.stoppedAt < 1500) {
      return;
    }
    this.nextEmoteAt = now + nextEmoteDelayMs(Math.random()) + 3000;
    this.showEmote(sprites, Math.floor(Math.random() * sprites.length), pickEmote(Math.random()));
  }

  private showEmote(
    sprites: readonly Phaser.GameObjects.Image[],
    index: number,
    kind: EmoteKind,
  ): void {
    const sprite = sprites[index];
    if (!sprite?.active) {
      return;
    }
    this.emote?.image.destroy();
    const image = this.scene.add
      .image(sprite.x + 8, sprite.y - sprite.displayHeight - 2, emoteTextureKey(kind))
      .setOrigin(0.5, 1)
      .setDepth(this.fxDepth + 0.1)
      .setScale(0);
    this.emote = { image, index };
    this.scene.tweens.add({
      targets: image,
      scale: 0.75,
      duration: 220,
      ease: "Back.easeOut",
    });
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      delay: 1700,
      duration: 300,
      onComplete: () => {
        image.destroy();
        if (this.emote?.image === image) {
          this.emote = undefined;
        }
      },
    });
  }

  private resolveQuality(): FxQuality {
    if (!this.enabled) return "off";
    if (this.forcedQuality) return this.forcedQuality;
    return this.governor.low ? "low" : "high";
  }

  private isWebGL(): boolean {
    return this.scene.game.renderer.type === Phaser.WEBGL;
  }

  private applyQuality(): void {
    this.quality = this.resolveQuality();
    const cam = this.scene.cameras.main;
    // ponytail: low quality drops all camera post passes (fill-rate bound);
    // day/night tint goes with them rather than adding an overlay fallback.
    const wantPost = this.quality === "high" && this.isWebGL();
    if (wantPost && !this.colorMatrix) {
      this.colorMatrix = cam.postFX.addColorMatrix();
      this.vignette = cam.postFX.addVignette(0.5, 0.5, 1, 0.26);
    } else if (!wantPost && this.colorMatrix) {
      cam.postFX.clear();
      this.colorMatrix = undefined;
      this.vignette = undefined;
    }
    for (const glow of this.glows) {
      glow.image.setVisible(this.quality !== "off");
    }
    this.playerGlow?.setVisible(this.quality !== "off");
    this.applyLight();
    this.retargetAmbient(false);
  }

  private sampleLight(): DayNightSample {
    if (this.zone?.interior) {
      return INTERIOR_LIGHT;
    }
    const phase =
      this.forcedPhase ?? dayNightPhase(performance.now() - SESSION_START_MS);
    return sampleDayNight(phase);
  }

  private applyLight(): void {
    if (this.colorMatrix) {
      this.colorMatrix.set(colorMatrixFor(this.light));
    }
    if (this.vignette) {
      this.vignette.strength = 0.24 + 0.14 * this.light.nightness;
    }
  }

  private flickerGlows(playerX: number, playerY: number): void {
    const t = this.scene.time.now / 1000;
    const night = this.light.nightness;
    for (let i = 0; i < this.glows.length; i += 1) {
      const glow = this.glows[i]!;
      const flick = glow.flicker && !this.reducedMotion
        ? 0.88 + 0.08 * Math.sin(t * 7.3 + i) + 0.04 * Math.sin(t * 13.1 + i * 2)
        : 1;
      glow.image.setAlpha((glow.base + glow.night * night) * flick);
    }
    if (this.playerGlow) {
      this.playerGlow.setPosition(playerX, playerY - 18);
      const n = this.zone?.interior ? 0 : Math.max(0, (night - 0.35) / 0.65);
      this.playerGlow.setAlpha(0.3 * n);
    }
  }

  private buildGlows(zone: ZoneDefinition, playerDepth: number): void {
    const depth = playerDepth + 1.5;
    for (const prop of getZoneProps(zone.id)) {
      if (prop.kind !== "shrine-altar" && prop.kind !== "hearth") {
        continue;
      }
      const hearth = prop.kind === "hearth";
      const x = this.origin.x + prop.x * TILE_WIDTH + TILE_WIDTH / 2;
      const y = this.origin.y + prop.y * TILE_HEIGHT + TILE_HEIGHT / 2 - (hearth ? 6 : 14);
      const image = this.scene.add
        .image(x, y, FX_TEX.halo)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(hearth ? 0xff8a30 : 0xff8420)
        .setScale(hearth ? 1.7 : 2.5)
        .setDepth(depth);
      this.glows.push({
        image,
        base: zone.interior ? 0.5 : 0.15,
        night: zone.interior ? 0.1 : 0.65,
        flicker: hearth,
      });
      if (hearth) {
        this.scene.add
          .particles(x, y - 8, FX_TEX.glow, {
            lifespan: { min: 900, max: 1600 },
            speedX: { min: -8, max: 8 },
            speedY: { min: -40, max: -18 },
            scale: { start: 0.26, end: 0.04 },
            tint: [0xffb050, 0xff8030, 0xffe090],
            blendMode: Phaser.BlendModes.ADD,
            frequency: this.reducedMotion ? 600 : 180,
            emitZone: { type: "random" as const, source: shapeSource(new Phaser.Geom.Rectangle(-10, -4, 20, 8)) },
          })
          .setDepth(depth);
      }
    }
    if (!zone.interior) {
      this.playerGlow = this.scene.add
        .image(0, 0, FX_TEX.halo)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffe2a8)
        .setScale(1.3)
        .setAlpha(0)
        .setDepth(playerDepth - 0.4);
    } else {
      this.playerGlow = undefined;
    }
  }

  private retargetAmbient(prewarm: boolean): void {
    for (const a of this.ambient) {
      const alive = targetAlive(a.layer, this.quality, this.light.nightness, this.reducedMotion);
      const interval = emitIntervalMs(alive, a.meanLife);
      if (interval < 0) {
        if (a.emitter.emitting) a.emitter.stop();
        continue;
      }
      a.emitter.frequency = interval;
      if (!a.emitter.emitting) {
        a.emitter.start();
      }
      if (prewarm) {
        a.emitter.fastForward(a.meanLife, 50);
      }
    }
  }

  /** Random point in the padded camera view; glints only land on water. */
  private ambientSource(kind: AmbientKind) {
    const view = this.view;
    const waterOnly = kind === "glints";
    return {
      getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
        for (let attempt = 0; attempt < (waterOnly ? 8 : 1); attempt += 1) {
          point.x = view.x + Math.random() * view.width;
          point.y = view.y + Math.random() * view.height;
          if (!waterOnly || this.isWaterAt(point.x!, point.y!)) {
            return;
          }
        }
        point.x = -1e6;
        point.y = -1e6;
      },
    };
  }

  private isWaterAt(worldX: number, worldY: number): boolean {
    const zone = this.zone;
    if (!zone) return false;
    const g = screenToGrid(worldX, worldY, this.origin.x, this.origin.y);
    const tile = zone.tiles[Math.round(g.y)]?.[Math.round(g.x)];
    return tile === TileType.Water;
  }

  private updateLookAhead(moving: boolean, facing: string): void {
    const cam = this.scene.cameras.main;
    let tx = 0;
    let ty = 0;
    if (moving && !this.reducedMotion) {
      tx = facing === "east" ? -LOOK_AHEAD_PX : facing === "west" ? LOOK_AHEAD_PX : 0;
      ty = facing === "south" ? -LOOK_AHEAD_PX : facing === "north" ? LOOK_AHEAD_PX : 0;
    }
    this.lookAhead.x += (tx - this.lookAhead.x) * 0.04;
    this.lookAhead.y += (ty - this.lookAhead.y) * 0.04;
    cam.setFollowOffset(this.lookAhead.x, this.lookAhead.y);
  }
}
