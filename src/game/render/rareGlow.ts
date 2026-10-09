import Phaser from "phaser";
import { rareSpriteLook } from "../share/rareVariant";
import type { CreatureInstance } from "../creatures/types";
import { ensureFxTextures, FX_TEX } from "./fx/fxTextures";

type Placed = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/**
 * Rare tint + halo for a creature sprite outside the overworld (#423):
 * battle and the encounter card. Returns the halo (null when not rare) so
 * the caller can keep it under a moving sprite and destroy it with the swap.
 */
export function applyRareLook(
  scene: Phaser.Scene,
  sprite: Placed,
  creature: Pick<CreatureInstance, "rare" | "speciesId" | "definitionId">,
): Phaser.GameObjects.Image | null {
  const look = rareSpriteLook(creature);
  if (!look) {
    return null;
  }
  if (look.tint !== 0xffffff) {
    sprite.setTint(look.tint);
  }
  ensureFxTextures(scene);
  const halo = scene.add
    .image(0, 0, FX_TEX.halo)
    .setTint(look.glow)
    .setAlpha(0.5)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(sprite.depth - 0.5);
  followRareGlow(halo, sprite);
  return halo;
}

/** Keep the halo centred on the sprite body (origin is at the feet). */
export function followRareGlow(halo: Phaser.GameObjects.Image, sprite: Placed): void {
  const size = Math.max(sprite.displayWidth, sprite.displayHeight);
  halo
    .setPosition(sprite.x, sprite.y - sprite.displayHeight * sprite.originY + sprite.displayHeight / 2)
    .setDisplaySize(size * 1.25, size * 1.25)
    .setVisible(sprite.visible && sprite.alpha > 0.2);
}
