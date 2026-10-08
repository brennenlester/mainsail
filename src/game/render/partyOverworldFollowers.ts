import type Phaser from "phaser";
import { isRareVariant, rareVariantTint } from "../share/rareVariant";
import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures } from "../creatures/party";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { ensureCreatureTextures } from "../creatures/sprites";
import type { CreatureInstance } from "../creatures/types";
import {
  hasPresenceGrowth,
  PRESENCE_MOON_DOT_COLOR,
  presenceMoonDotOffset,
  presenceTintForCreature,
  selectOverworldFollowers,
} from "../shrine/presence";
import { CREATURE_DISPLAY, fitDisplay } from "./displaySizes";
import { creatureAnimKey } from "./imagineAssets";

export type Facing = "south" | "north" | "east" | "west";

export type PartyOverworldFollowerState = {
  sprites: Phaser.GameObjects.Sprite[];
  moonDots: Phaser.GameObjects.Arc[];
};

export const MAX_FOLLOWERS = 3;

export function createPartyOverworldFollowerState(): PartyOverworldFollowerState {
  return { sprites: [], moonDots: [] };
}

/** Call once per zone load before syncing followers. */
export function preparePartyOverworldFollowerTextures(scene: Phaser.Scene): void {
  ensureCreatureTextures(scene);
}

export function destroyPartyOverworldFollowers(
  state: PartyOverworldFollowerState,
): void {
  for (const sprite of state.sprites) {
    sprite.destroy();
  }
  for (const dot of state.moonDots) {
    dot.destroy();
  }
  state.sprites = [];
  state.moonDots = [];
}

function followerOffsets(
  facing: Facing,
  index: number,
): { dx: number; dy: number } {
  const spread = (index - 1) * 10;
  switch (facing) {
    case "south":
      return { dx: spread, dy: -14 - index * 4 };
    case "north":
      return { dx: spread, dy: 14 + index * 4 };
    case "east":
      return { dx: -14 - index * 4, dy: spread };
    case "west":
      return { dx: 14 + index * 4, dy: spread };
  }
}

function syncFollowerVisual(
  scene: Phaser.Scene,
  state: PartyOverworldFollowerState,
  index: number,
  creature: CreatureInstance,
  x: number,
  y: number,
  facing: Facing,
  depth: number,
): void {
  const def = getCreatureDefinition(creature.definitionId);
  const { dx, dy } = followerOffsets(facing, index);
  const px = x + dx;
  const py = y + dy;

  let sprite = state.sprites[index];
  const [textureKey, textureFrame] = resolveCreaturePoseTexture(
    scene,
    def.spriteKey,
    "idle",
  );
  if (!sprite) {
    sprite = scene.add.sprite(px, py, textureKey, textureFrame);
    sprite.setOrigin(0.5, 1);
    state.sprites[index] = sprite;
  } else {
    sprite.setPosition(px, py);
  }
  // Rendered idle loop (#360) when the creature has one; else static art.
  const idleAnim = creatureAnimKey(def.spriteKey, "idle");
  if (scene.anims.exists(idleAnim)) {
    if (sprite.anims.currentAnim?.key !== idleAnim) {
      sprite.play({ key: idleAnim, startFrame: index % 3 });
    }
  } else {
    sprite.anims.stop();
    sprite.setTexture(textureKey, textureFrame);
  }
  fitDisplay(sprite, CREATURE_DISPLAY);

  if (hasPresenceGrowth(creature)) {
    sprite.setTint(presenceTintForCreature(creature));
  } else if (isRareVariant(creature)) {
    sprite.setTint(rareVariantTint(creature.definitionId));
  } else {
    sprite.clearTint();
  }
  sprite.setAlpha(creature.currentHp > 0 ? 1 : 0.45);
  sprite.setDepth(depth - 1 - index * 0.01);

  const showMoon = hasPresenceGrowth(creature);
  let moonDot = state.moonDots[index];
  if (showMoon) {
    const dotY = py - presenceMoonDotOffset(CREATURE_DISPLAY.height);
    if (!moonDot) {
      moonDot = scene.add.circle(px, dotY, 2, PRESENCE_MOON_DOT_COLOR, 1);
      state.moonDots[index] = moonDot;
    } else {
      moonDot.setPosition(px, dotY);
      moonDot.setVisible(true);
    }
    moonDot.setDepth(depth + 0.05);
  } else if (moonDot) {
    moonDot.setVisible(false);
  }
}

/** Draw up to three active party companions behind the player (presence tell included). */
export function syncPartyOverworldFollowers(
  scene: Phaser.Scene,
  state: PartyOverworldFollowerState,
  options: { x: number; y: number; facing: Facing; depth: number },
): void {
  const actives = selectOverworldFollowers(getActiveCreatures(), MAX_FOLLOWERS);
  for (let i = 0; i < actives.length; i += 1) {
    syncFollowerVisual(
      scene,
      state,
      i,
      actives[i]!,
      options.x,
      options.y,
      options.facing,
      options.depth,
    );
  }
  while (state.sprites.length > actives.length) {
    state.sprites.pop()?.destroy();
    state.moonDots.pop()?.destroy();
  }
}
