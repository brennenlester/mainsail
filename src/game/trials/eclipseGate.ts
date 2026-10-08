import Phaser from "phaser";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { chebyshevDist, INTERACT_ADJACENCY } from "../world/interactProximity";
import { isVisitorMode } from "../world/worldSession";
import type { ZoneId } from "../world/zoneTypes";
import { isTrialsUnlocked } from "./trialUnlock";

/**
 * The Eclipse Gate (#420): a violet-and-ember sigil on the Moon Shrine
 * floor, north of the altar, once the finale is done. Walk onto it and
 * press E to start today's Eclipse Trial. Pure decoration plus a tile —
 * no collision, no new art (procedural FX textures).
 */

export const ECLIPSE_GATE = { zoneId: "shrine" as ZoneId, x: 5, y: 2 };
export const ECLIPSE_GATE_PROMPT = "Press E — Eclipse Gate (daily trial)";

export function isEclipseGateOpen(): boolean {
  return isTrialsUnlocked() && !isVisitorMode();
}

export function isNearEclipseGate(zoneId: ZoneId, tileX: number, tileY: number): boolean {
  return (
    zoneId === ECLIPSE_GATE.zoneId &&
    isEclipseGateOpen() &&
    chebyshevDist(ECLIPSE_GATE.x, ECLIPSE_GATE.y, tileX, tileY) <= INTERACT_ADJACENCY
  );
}

/**
 * Draw the sigil for `zoneId` (only the shrine, only once open). Objects
 * belong to the scene's display list, so the next zone load clears them.
 */
export function drawEclipseGate(
  scene: Phaser.Scene,
  zoneId: ZoneId,
  groundAt: (x: number, y: number) => { x: number; y: number },
  depth: number,
): void {
  if (zoneId !== ECLIPSE_GATE.zoneId || !isEclipseGateOpen()) {
    return;
  }
  ensureFxTextures(scene);
  const at = groundAt(ECLIPSE_GATE.x, ECLIPSE_GATE.y);
  const glow = scene.add
    .image(at.x, at.y - 6, FX_TEX.glow)
    .setTint(0xb48cff)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(2.6, 1.1)
    .setAlpha(0.7)
    .setDepth(depth - 1);
  const ring = scene.add
    .image(at.x, at.y - 6, FX_TEX.ring)
    .setTint(0xff9a4a)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(1.3, 0.5)
    .setDepth(depth);
  const moon = scene.add
    .image(at.x, at.y - 46, FX_TEX.halo)
    .setTint(0xffd27a)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.6)
    .setDepth(depth + 1);
  const disc = scene.add.circle(at.x, at.y - 46, 9, 0x0b0714, 1).setStrokeStyle(2, 0xffd27a, 0.9).setDepth(depth + 2);
  if (prefersReducedMotion() || !effectsEnabled()) {
    return;
  }
  const pulse = scene.tweens.add({ targets: [glow, ring], alpha: { from: 0.95, to: 0.45 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  const bob = scene.tweens.add({ targets: [moon, disc], y: "-=6", duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  // Zone loads destroy the display list without tween cleanup: never leave endless tweens behind.
  glow.once(Phaser.GameObjects.Events.DESTROY, () => {
    pulse.remove();
    bob.remove();
  });
}
