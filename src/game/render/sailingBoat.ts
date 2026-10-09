import Phaser from "phaser";
import { effectsEnabled, prefersReducedMotion } from "./fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "./fx/fxTextures";
import { imagineTexture } from "./imagineAssets";
import type { Facing } from "./partyOverworldFollowers";

/**
 * The player's boat while sailing (#423): the atlas `prop-boat` drawn under
 * the trainer, plus its front gunwale drawn over their feet so they sit IN
 * the boat. Gentle bob and a wake trail when Effects are on and motion is
 * allowed. No new art.
 */

/** Wider than the 48 px trainer so bow and stern read on the water (192:160 art). */
export const SAILING_BOAT_DISPLAY = { width: 84, height: 70 } as const;
/** Share of the art (from the top) hidden by the front gunwale overlay. */
const FRONT_CROP_FROM = 0.6;
const BOB_PX = 1.6;
const BOB_PERIOD_MS = 1500;

/**
 * Cheap heading: mirror for screen-left travel, tilt along the isometric
 * slope (north/east climb or drop to the right, south/west to the left).
 */
export function boatPose(facing: Facing): { flipX: boolean; angle: number } {
  switch (facing) {
    case "east":
      return { flipX: false, angle: 8 };
    case "north":
      return { flipX: false, angle: -8 };
    case "west":
      return { flipX: true, angle: 8 };
    case "south":
      return { flipX: true, angle: -8 };
  }
}

/** Vertical bob in px at `timeMs` (0 when motion is off). */
export function boatBob(timeMs: number, animate: boolean): number {
  return animate ? Math.sin((timeMs / BOB_PERIOD_MS) * Math.PI * 2) * BOB_PX : 0;
}

export class SailingBoat {
  private readonly hull: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Image;
  private readonly wake: Phaser.GameObjects.Particles.ParticleEmitter | null;

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, textureKey: string) {
    this.scene = scene;
    const tex = imagineTexture(scene, textureKey);
    this.hull = scene.add.image(0, 0, ...tex).setOrigin(0.5, 0.62);
    this.hull.setDisplaySize(SAILING_BOAT_DISPLAY.width, SAILING_BOAT_DISPLAY.height);
    this.front = scene.add.image(0, 0, ...tex).setOrigin(0.5, 0.62);
    this.front.setDisplaySize(SAILING_BOAT_DISPLAY.width, SAILING_BOAT_DISPLAY.height);
    const top = Math.round(this.front.height * FRONT_CROP_FROM);
    this.front.setCrop(0, top, this.front.width, this.front.height - top);
    if (effectsEnabled() && !prefersReducedMotion()) {
      ensureFxTextures(scene);
      this.wake = scene.add.particles(0, 0, FX_TEX.glow, {
        emitting: false,
        frequency: 70,
        lifespan: { min: 600, max: 1000 },
        speedX: { min: -12, max: 12 },
        speedY: { min: -4, max: 6 },
        scale: { start: 0.28, end: 0.05 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xffffff, 0xd8f4ff],
        blendMode: Phaser.BlendModes.ADD,
      });
    } else {
      this.wake = null;
    }
  }

  /**
   * Place the boat under a rider standing at (x, baseY). Returns the bob
   * offset so the rider rises and falls with the hull.
   */
  sync(x: number, baseY: number, facing: Facing, moving: boolean, depth: number): number {
    const bob = boatBob(this.scene.time.now, this.wake !== null);
    const pose = boatPose(facing);
    for (const part of [this.hull, this.front]) {
      part.setPosition(x, baseY + bob).setFlipX(pose.flipX).setAngle(pose.angle);
    }
    this.hull.setDepth(depth - 1);
    this.front.setDepth(depth + 0.5);
    if (this.wake) {
      // Trail from the stern: behind the direction of travel.
      const back = pose.flipX ? 1 : -1;
      this.wake.setPosition(x + back * SAILING_BOAT_DISPLAY.width * 0.4, baseY + bob + 6);
      this.wake.setDepth(depth - 1.5);
      this.wake.emitting = moving;
    }
    return bob;
  }

  destroy(): void {
    this.hull.destroy();
    this.front.destroy();
    this.wake?.destroy();
  }
}
