import Phaser from "phaser";
import { playShrineSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { ensureCreatureTextures } from "../creatures/sprites";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { rareVariantTint } from "../share/rareVariant";
import { BEAM_TEX, ensureCutsceneTextures } from "../scenes/EvolutionScene";
import type { StoryCue } from "./finaleScene";
import { FINALE_HATCHLING } from "./storySpars";

/**
 * Presentation for scripted story lines (#385): DialogueScene calls
 * `playStoryCue` when a line with a cue is shown. Everything draws behind
 * the dialogue panel and cleans up with the scene.
 *
 * Coordinates are stage CSS px (DialogueScene's camera), anchored to the
 * Moon Shrine altar's real on-screen position (#401) rather than the old
 * 640 design square, which put the egg outside the shrine on wide stages.
 */
export type StoryStage = {
  width: number;
  height: number;
  /** Bottom of the open stage above the dialogue panel. */
  openBottom: number;
  /** Altar centre in stage CSS px; `scale` is CSS px per world px. */
  anchor: { x: number; y: number; scale: number };
};

type StageHost = { propStagePoint?: (kind: "shrine-altar") => StoryStage["anchor"] | null };

/** Stage for story cues: the shrine altar when it is on screen, else the open stage's centre. */
export function storyStage(scene: Phaser.Scene, width: number, height: number, openBottom: number): StoryStage {
  const iso = scene.scene.get("IsometricScene") as unknown as StageHost | null;
  const altar = iso?.propStagePoint?.("shrine-altar") ?? null;
  const onStage = altar && altar.x > 0 && altar.x < width && altar.y > 0 && altar.y < height;
  return {
    width,
    height,
    openBottom,
    anchor: onStage ? altar : { x: width / 2, y: Math.max(120, openBottom * 0.6), scale: 1 },
  };
}

/** World-scaled size factor, kept readable on a phone and sane on a monitor. */
export function stageScale(stage: StoryStage): number {
  return Phaser.Math.Clamp(stage.anchor.scale, 0.75, 1.8);
}

/** Where the egg / hatchling rests: on the altar's top slab. */
export function altarTop(stage: StoryStage): { x: number; y: number } {
  return { x: stage.anchor.x, y: stage.anchor.y - 14 * stageScale(stage) };
}

const EGG_NAME = "finale-egg";
const EGG_HALO_NAME = "finale-egg-halo";

/** The Matriarch's warm, speckled ember egg; origin at its base. */
export function drawEmberEgg(scene: Phaser.Scene, x: number, y: number, scale: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x7a2a1a, 1).fillEllipse(0, -32, 58, 70);
  g.fillStyle(0xc8522a, 1).fillEllipse(-2, -34, 50, 62);
  g.fillStyle(0xffb04a, 0.9).fillEllipse(-10, -46, 16, 22);
  g.fillStyle(0x5a1a10, 1);
  for (const [px, py, r] of [[10, -24, 5], [-12, -18, 4], [14, -44, 3], [-4, -8, 3]] as const) {
    g.fillCircle(px, py, r);
  }
  g.lineStyle(3, 0xffd88a, 0.9).strokeEllipse(-2, -34, 52, 64);
  return scene.add.container(x, y, [g]).setScale(scale * 0.8);
}

/** Remove the dialogue's egg (the hatch cutscene draws its own). */
export function clearStoryEgg(scene: Phaser.Scene): void {
  scene.children.getByName(EGG_NAME)?.destroy();
  scene.children.getByName(EGG_HALO_NAME)?.destroy();
}

/** Cinderling's sprite (rare tint), origin at its feet. */
export function addHatchling(scene: Phaser.Scene, x: number, y: number, height: number): Phaser.GameObjects.Image {
  ensureCreatureTextures(scene);
  const spriteKey = getCreatureDefinition(FINALE_HATCHLING.creatureId).spriteKey;
  const image = scene.add
    .image(x, y, ...resolveCreaturePoseTexture(scene, spriteKey, "encounter"))
    .setOrigin(0.5, 0.92)
    .setTint(rareVariantTint(FINALE_HATCHLING.creatureId));
  image.setScale(height / Math.max(1, image.height));
  return image;
}

export function playStoryCue(scene: Phaser.Scene, cue: StoryCue | undefined, stage: StoryStage): void {
  if (!cue) {
    return;
  }
  ensureFxTextures(scene);
  ensureCutsceneTextures(scene);
  const particles = effectsEnabled();
  const reduced = prefersReducedMotion();
  const s = stageScale(stage);
  const top = altarTop(stage);
  switch (cue) {
    case "moonlight": {
      playShrineSfx(scene);
      // Moonlight pours onto the altar from above.
      const beam = scene.add
        .image(top.x, top.y + 6 * s, BEAM_TEX)
        .setOrigin(0.5, 1)
        .setTint(0xcfe0ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setDepth(1);
      beam.setDisplaySize(70 * s, Math.max(80, top.y + 10));
      const glow = scene.add
        .image(top.x, top.y, FX_TEX.halo)
        .setTint(0xcfe0ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(2.4 * s)
        .setAlpha(0)
        .setDepth(1);
      scene.tweens.add({ targets: beam, alpha: 0.4, duration: 900 });
      scene.tweens.add({ targets: glow, alpha: 0.6, duration: 900 });
      if (particles) {
        scene.add
          .particles(0, 0, FX_TEX.petal, {
            x: { min: 20, max: stage.width - 20 },
            y: -10,
            speedY: { min: 20, max: 60 },
            speedX: { min: -20, max: 20 },
            lifespan: Math.max(3000, (stage.openBottom / 40) * 1000),
            rotate: { min: 0, max: 360 },
            scale: { min: 0.9, max: 1.5 },
            tint: [0xe8e0ff, 0xcfe0ff, 0xffffff],
            frequency: Math.max(90, 220 * (640 / Math.max(320, stage.width))),
          })
          .setDepth(1);
      }
      return;
    }
    case "embers": {
      if (particles) {
        scene.add
          .particles(0, 0, FX_TEX.glow, {
            x: { min: top.x - 40 * s, max: top.x + 40 * s },
            y: top.y,
            speedY: { min: -70, max: -25 },
            speedX: { min: -16, max: 16 },
            lifespan: { min: 1400, max: 2400 },
            scale: { start: 0.5 * s, end: 0 },
            tint: [0xffb04a, 0xff7a2a, 0xffd88a],
            blendMode: Phaser.BlendModes.ADD,
            frequency: 90,
          })
          .setDepth(1);
      }
      // The egg rests on the altar on a warm glow; it rocks while it hums.
      const halo = scene.add
        .image(top.x, top.y - 24 * s, FX_TEX.halo)
        .setTint(0xff8a3a)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.6 * s)
        .setAlpha(0.7)
        .setDepth(1)
        .setName(EGG_HALO_NAME);
      const egg = drawEmberEgg(scene, top.x, top.y, s).setDepth(1).setName(EGG_NAME);
      if (!reduced) {
        scene.tweens.add({ targets: egg, angle: { from: -5, to: 5 }, duration: 260, yoyo: true, repeat: -1 });
        scene.tweens.add({ targets: halo, alpha: { from: 0.4, to: 0.85 }, duration: 520, yoyo: true, repeat: -1 });
      }
      return;
    }
    case "hatch": {
      // Shown after the hatch cutscene: Cinderling sits on the altar, glowing.
      clearStoryEgg(scene);
      scene.add
        .image(top.x, top.y - 20 * s, FX_TEX.halo)
        .setTint(0xffc070)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(2 * s)
        .setAlpha(0.6)
        .setDepth(1);
      const hatchling = addHatchling(scene, top.x, top.y, 84 * s).setDepth(1);
      if (!reduced) {
        scene.tweens.add({ targets: hatchling, y: hatchling.y - 5 * s, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      return;
    }
    case "sea": {
      const wash = scene.add
        .rectangle(0, 0, stage.width, stage.height, 0x3a7ab8, 0)
        .setOrigin(0)
        .setDepth(1);
      scene.tweens.add({ targets: wash, fillAlpha: 0.28, duration: 1200 });
      const card = scene.add
        .text(stage.width / 2, Math.max(48, stage.openBottom * 0.22), "Optional: The Sovereign Voyage", {
          fontFamily: '"Source Sans 3", system-ui, sans-serif',
          fontSize: stage.width < 480 ? "19px" : "24px",
          fontStyle: "bold italic",
          color: "#e6f4ff",
          stroke: "#10304a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(1);
      scene.tweens.add({ targets: card, alpha: 1, duration: 900, delay: 300 });
      return;
    }
  }
}
