import Phaser from "phaser";
import { PLAYER_DISPLAY, fitDisplay } from "./displaySizes";
import { hasImagineFrame, imagineTexture } from "./imagineAssets";
import {
  WALK_FRAME_COUNT,
  idleBreathFrame,
  walkStrideFrame,
} from "./playerWalk";

const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 64;
const FACINGS = ["south", "north", "east", "west"] as const;

type Facing = (typeof FACINGS)[number];

function textureKey(facing: Facing, frame: number): string {
  return `player-${facing}-${frame}`;
}

function drawTrainer(
  g: Phaser.GameObjects.Graphics,
  facing: Facing,
  frame: number,
): void {
  // Procedural fallback: odd frames lean one way, even the other.
  const stride = frame === 0 ? 0 : frame % 2 === 1 ? -3 : 3;
  const side = facing === "east" ? 1 : facing === "west" ? -1 : 0;
  const back = facing === "north";
  const center = 24 + side * 2;

  g.fillStyle(0x17243c, 0.24);
  g.fillEllipse(24, 61, 26, 6);

  g.fillStyle(0x243454, 1);
  g.fillRect(center - 10, 43, 7, 14 + Math.max(0, stride));
  g.fillRect(center + 3, 43, 7, 14 + Math.max(0, -stride));
  g.fillStyle(0x203044, 1);
  g.fillRoundedRect(center - 12, 56 + Math.max(0, stride), 11, 5, 2);
  g.fillRoundedRect(center + 2, 56 + Math.max(0, -stride), 11, 5, 2);

  g.fillStyle(0x1d293b, 1);
  g.fillRoundedRect(center - 14 - side * 2, 29, 9, 19, 3);
  g.fillStyle(0x6b4a32, 1);
  g.fillRoundedRect(center - 13 - side * 2, 34, 7, 10, 2);
  g.fillStyle(back ? 0x315d7c : 0x3e8bb2, 1);
  g.fillRoundedRect(center - 11, 27, 22, 20, 5);
  g.fillStyle(0x8bd2de, 0.9);
  g.fillRect(center - 8, 30, 16, 4);
  g.fillStyle(0xf0b65f, 1);
  g.fillRoundedRect(center - 3, 30, 6, 5, 2);

  g.fillStyle(0x315d7c, 1);
  g.fillRoundedRect(center - 16, 31 + stride / 3, 6, 15, 3);
  g.fillRoundedRect(center + 10, 31 - stride / 3, 6, 15, 3);
  g.fillStyle(0xe4aa82, 1);
  g.fillCircle(center - 13, 46 + stride / 3, 3);
  g.fillCircle(center + 13, 46 - stride / 3, 3);

  g.fillStyle(0x31233e, 1);
  g.fillCircle(center, 19, 12);
  g.fillStyle(0x5a3b6c, 1);
  g.fillCircle(center - side, 17, 10);
  g.fillStyle(0xe7b28b, 1);
  g.fillCircle(center + side, 20, 9);

  if (!back) {
    const eyeOffset = side === 0 ? 4 : 2;
    g.fillStyle(0xf8fbff, 1);
    g.fillCircle(center - eyeOffset + side * 2, 20, 3);
    g.fillCircle(center + eyeOffset + side * 2, 20, 3);
    g.fillStyle(0x243252, 1);
    g.fillCircle(center - eyeOffset + side * 2, 20, 1.5);
    g.fillCircle(center + eyeOffset + side * 2, 20, 1.5);
    g.fillStyle(0xc96f66, 0.7);
    g.fillCircle(center - 6 + side * 2, 25, 2);
    g.fillCircle(center + 6 + side * 2, 25, 2);
  } else {
    g.fillStyle(0x251a31, 1);
    g.fillRoundedRect(center - 9, 13, 18, 10, 5);
  }

  g.lineStyle(2, 0x182032, 0.65);
  g.strokeRoundedRect(center - 11, 27, 22, 20, 5);
}

function generateFrame(scene: Phaser.Scene, facing: Facing, frame: number): void {
  const key = textureKey(facing, frame);
  if (hasImagineFrame(scene, key) || scene.textures.exists(key)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 });
  drawTrainer(g, facing, frame);
  g.generateTexture(key, FRAME_WIDTH, FRAME_HEIGHT);
  g.destroy();
}

function isImagineTexture(scene: Phaser.Scene, key: string): boolean {
  return hasImagineFrame(scene, key);
}

export function getPlayerIdleTextureKey(facing: Facing = "south"): string {
  return textureKey(facing, 0);
}

export function ensurePlayerAnims(scene: Phaser.Scene): void {
  for (const facing of FACINGS) {
    const walkCount = WALK_FRAME_COUNT[facing];
    for (let frame = 0; frame <= walkCount; frame += 1) {
      if (!isImagineTexture(scene, textureKey(facing, frame))) {
        generateFrame(scene, facing, frame);
      }
    }

    const idleKey = `player-idle-${facing}`;
    if (!scene.anims.exists(idleKey)) {
      const [idleTexture, idleFrame] = imagineTexture(
        scene,
        textureKey(facing, 0),
      );
      scene.anims.create({
        key: idleKey,
        frames: [{ key: idleTexture, frame: idleFrame }],
        frameRate: 1,
        repeat: -1,
      });
    }

    const walkKey = `player-walk-${facing}`;
    if (scene.anims.exists(walkKey)) {
      scene.anims.remove(walkKey);
    }
    const walkFrames = Array.from({ length: walkCount }, (_, i) => i + 1);
    scene.anims.create({
      key: walkKey,
      frames: walkFrames.map((frame) => {
        const [texture, atlasFrame] = imagineTexture(
          scene,
          textureKey(facing, frame),
        );
        return { key: texture, frame: atlasFrame };
      }),
      frameRate: 8,
      repeat: -1,
    });
  }
}

/** Rendered idle breath frame key when the atlas has it (#360). */
function idleBreathKey(scene: Phaser.Scene, facing: Facing): string | null {
  const key = `player-${facing}__idle_${String(idleBreathFrame(scene.time.now)).padStart(2, "0")}`;
  return hasImagineFrame(scene, key) ? key : null;
}

/** Idle breath (or frame 0), or distance-synced walk pose while moving. */
export function applyPlayerPose(
  sprite: Phaser.GameObjects.Sprite,
  facing: Facing,
  moving: boolean,
  walkPhase: number,
): void {
  sprite.anims.stop();
  const key = moving
    ? textureKey(facing, walkStrideFrame(walkPhase, WALK_FRAME_COUNT[facing]))
    : (idleBreathKey(sprite.scene, facing) ?? textureKey(facing, 0));
  const [texture, atlasFrame] = imagineTexture(sprite.scene, key);
  if (
    sprite.texture.key !== texture ||
    (atlasFrame !== undefined && sprite.frame.name !== atlasFrame)
  ) {
    sprite.setTexture(texture, atlasFrame);
  }
  fitDisplay(sprite, PLAYER_DISPLAY);
}

/** Keep display size stable when anim swaps texture keys. */
export function bindPlayerDisplaySize(
  sprite: Phaser.GameObjects.Sprite,
): void {
  fitDisplay(sprite, PLAYER_DISPLAY);
  sprite.on("animationupdate", () => {
    fitDisplay(sprite, PLAYER_DISPLAY);
  });
}
