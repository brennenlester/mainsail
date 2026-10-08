import Phaser from "phaser";
import { playEvolveSfx, playShrineSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { ensureCreatureTextures } from "../creatures/sprites";
import { BATTLE_CREATURE_DISPLAY } from "../render/displaySizes";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { DESIGN_SIZE } from "../render/pixelRatio";
import type { StoryCue } from "./finaleScene";
import { FINALE_HATCHLING } from "./storySpars";

/**
 * Presentation for scripted story lines (#385): DialogueScene calls
 * `playStoryCue` when a line with a cue is shown. Everything draws behind
 * the dialogue panel (depth below it) and cleans up with the scene.
 */
const CENTER = { x: DESIGN_SIZE / 2, y: 230 };

export function playStoryCue(scene: Phaser.Scene, cue: StoryCue | undefined): void {
  if (!cue) {
    return;
  }
  ensureFxTextures(scene);
  const particles = effectsEnabled();
  const reduced = prefersReducedMotion();
  switch (cue) {
    case "moonlight": {
      playShrineSfx(scene);
      const glow = scene.add
        .image(CENTER.x, 40, FX_TEX.halo)
        .setTint(0xcfe0ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(9)
        .setAlpha(0)
        .setDepth(1);
      scene.tweens.add({ targets: glow, alpha: 0.55, duration: 900 });
      if (particles) {
        scene.add
          .particles(0, 0, FX_TEX.petal, {
            x: { min: 60, max: DESIGN_SIZE - 60 },
            y: -10,
            speedY: { min: 20, max: 60 },
            speedX: { min: -20, max: 20 },
            lifespan: 5200,
            rotate: { min: 0, max: 360 },
            scale: { min: 0.9, max: 1.5 },
            tint: [0xe8e0ff, 0xcfe0ff, 0xffffff],
            frequency: 220,
          })
          .setDepth(1);
      }
      return;
    }
    case "embers": {
      if (particles) {
        scene.add
          .particles(0, 0, FX_TEX.glow, {
            x: { min: CENTER.x - 120, max: CENTER.x + 120 },
            y: CENTER.y + 90,
            speedY: { min: -80, max: -30 },
            speedX: { min: -20, max: 20 },
            lifespan: { min: 1600, max: 2800 },
            scale: { start: 0.6, end: 0 },
            tint: [0xffb04a, 0xff7a2a, 0xffd88a],
            blendMode: Phaser.BlendModes.ADD,
            frequency: 60,
          })
          .setDepth(1);
      }
      const egg = scene.add
        .ellipse(CENTER.x, CENTER.y + 40, 54, 66, 0xd8603c)
        .setStrokeStyle(4, 0xffb04a)
        .setDepth(1)
        .setName("finale-egg");
      if (!reduced) {
        scene.tweens.add({ targets: egg, angle: { from: -6, to: 6 }, duration: 260, yoyo: true, repeat: -1 });
      }
      return;
    }
    case "hatch": {
      playEvolveSfx(scene);
      scene.children.getByName("finale-egg")?.destroy();
      if (!reduced) {
        scene.cameras.main.flash(420, 255, 230, 180);
      }
      if (particles) {
        scene.add
          .particles(CENTER.x, CENTER.y + 20, FX_TEX.glow, {
            emitting: false,
            speed: { min: 120, max: 320 },
            lifespan: { min: 600, max: 1200 },
            scale: { start: 1, end: 0 },
            tint: [0xffe080, 0xff9a2a, 0xffffff],
            blendMode: Phaser.BlendModes.ADD,
          })
          .setDepth(1)
          .explode(60);
        const ring = scene.add.image(CENTER.x, CENTER.y + 20, FX_TEX.ring).setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.4);
        scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
      }
      ensureCreatureTextures(scene);
      const spriteKey = getCreatureDefinition(FINALE_HATCHLING.creatureId).spriteKey;
      const hatchling = scene.add
        .sprite(CENTER.x, CENTER.y + 80, ...resolveCreaturePoseTexture(scene, spriteKey, "battle"))
        .setOrigin(0.5, 1)
        .setDepth(1)
        .setTint(0xffc890);
      hatchling.setDisplaySize(BATTLE_CREATURE_DISPLAY.width * 0.75, BATTLE_CREATURE_DISPLAY.height * 0.75);
      const sx = hatchling.scaleX;
      const sy = hatchling.scaleY;
      if (!reduced) {
        hatchling.setScale(0);
        scene.tweens.add({ targets: hatchling, scaleX: sx, scaleY: sy, duration: 520, ease: "Back.easeOut" });
        scene.tweens.add({ targets: hatchling, y: hatchling.y - 10, duration: 700, yoyo: true, repeat: -1, delay: 600, ease: "Sine.easeInOut" });
      }
      return;
    }
    case "sea": {
      const wash = scene.add
        .rectangle(0, 0, DESIGN_SIZE, 370, 0x3a7ab8, 0)
        .setOrigin(0)
        .setDepth(1);
      scene.tweens.add({ targets: wash, fillAlpha: 0.28, duration: 1200 });
      const card = scene.add
        .text(CENTER.x, 70, "Optional: The Sovereign Voyage", {
          fontFamily: '"Source Sans 3", system-ui, sans-serif',
          fontSize: "22px",
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
