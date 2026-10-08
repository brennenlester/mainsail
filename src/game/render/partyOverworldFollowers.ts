import Phaser from "phaser";
import { bondTier } from "../companions/bond";
import {
  curiousDetour,
  personalityFollowerOffset,
} from "../companions/personality";
import { FX_TEX } from "./fx/fxTextures";
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
import { fetchLateImages, isLateImagePending, lateCreatureKeys } from "./lateAssets";

export type Facing = "south" | "north" | "east" | "west";

export type PartyOverworldFollowerState = {
  sprites: Phaser.GameObjects.Sprite[];
  moonDots: Phaser.GameObjects.Arc[];
  /** Bond-tier aura under each follower (#367). */
  auras: Phaser.GameObjects.Image[];
  /** 0..1 ease for curious followers drifting toward a nearby spot. */
  curiousT: number;
  curiousTarget?: { x: number; y: number };
};

/** Aura tint per bond tier (index = tier; tier 0 has none). */
const BOND_AURA_TINTS = [0, 0x9ef0c0, 0xffe070, 0xffa8d8, 0xc8b0ff];

export const MAX_FOLLOWERS = 3;

export function createPartyOverworldFollowerState(): PartyOverworldFollowerState {
  return { sprites: [], moonDots: [], auras: [], curiousT: 0 };
}

/** Call once per zone load before syncing followers. */
export function preparePartyOverworldFollowerTextures(scene: Phaser.Scene): void {
  ensureCreatureTextures(scene);
  // Safety net (#410): a late-game companion whose art is not loaded yet
  // (normally fetched at boot or by the scene that granted it) stays hidden
  // until it lands instead of drawing a missing-texture box.
  void fetchLateImages(
    scene.textures,
    lateCreatureKeys(getActiveCreatures().map((c) => c.definitionId)),
  );
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
  for (const aura of state.auras) {
    aura.destroy();
  }
  state.sprites = [];
  state.moonDots = [];
  state.auras = [];
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
  curiousTarget: { x: number; y: number } | undefined,
): void {
  const def = getCreatureDefinition(creature.definitionId);
  const { dx, dy } = personalityFollowerOffset(
    creature.personality,
    facing,
    followerOffsets(facing, index),
  );
  let px = x + dx;
  let py = y + dy;
  if (creature.personality === "curious" && curiousTarget && state.curiousT > 0) {
    ({ x: px, y: py } = curiousDetour({ x: px, y: py }, curiousTarget, state.curiousT));
  }

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
  sprite.setVisible(!isLateImagePending(scene.textures, def.spriteKey));
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

  syncBondAura(scene, state, index, creature, px, py, depth);
}

function syncBondAura(
  scene: Phaser.Scene,
  state: PartyOverworldFollowerState,
  index: number,
  creature: CreatureInstance,
  px: number,
  py: number,
  depth: number,
): void {
  const tier = bondTier(creature.bond);
  let aura = state.auras[index];
  if (tier === 0 || !scene.textures.exists(FX_TEX.halo)) {
    aura?.setVisible(false);
    return;
  }
  if (!aura) {
    aura = scene.add
      .image(px, py, FX_TEX.halo)
      .setBlendMode(Phaser.BlendModes.ADD);
    state.auras[index] = aura;
  }
  const t = scene.time.now / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + index);
  // Kindred cycles hue; lower tiers hold a steady tint.
  const tint =
    tier >= 4
      ? Phaser.Display.Color.HSVToRGB((t * 0.15 + index * 0.2) % 1, 0.45, 1).color
      : BOND_AURA_TINTS[tier]!;
  aura
    .setVisible(creature.currentHp > 0)
    .setPosition(px, py - 4)
    .setTint(tint)
    .setScale(0.3 + tier * 0.03, 0.14 + tier * 0.015)
    .setAlpha((0.25 + tier * 0.08) * (0.75 + 0.25 * pulse))
    .setDepth(depth - 1.1 - index * 0.01);
}

/** Draw up to three active party companions behind the player (presence tell included). */
export function syncPartyOverworldFollowers(
  scene: Phaser.Scene,
  state: PartyOverworldFollowerState,
  options: {
    x: number;
    y: number;
    facing: Facing;
    depth: number;
    moving?: boolean;
    /** Screen point a curious follower may drift toward while idle (#367). */
    curiousTarget?: { x: number; y: number };
  },
): void {
  const actives = selectOverworldFollowers(getActiveCreatures(), MAX_FOLLOWERS);
  const wantCurious = Boolean(options.curiousTarget) && !options.moving;
  state.curiousT = Math.max(0, Math.min(1, state.curiousT + (wantCurious ? 0.02 : -0.12)));
  if (options.curiousTarget) {
    state.curiousTarget = options.curiousTarget;
  }
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
      state.curiousTarget,
    );
  }
  while (state.sprites.length > actives.length) {
    state.sprites.pop()?.destroy();
    state.moonDots.pop()?.destroy();
    state.auras.pop()?.destroy();
  }
}
