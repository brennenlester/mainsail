import type Phaser from "phaser";

/** Logical on-screen sizes (Imagine textures are 4× these). */
export const PLAYER_DISPLAY = { width: 48, height: 64 } as const;
export const CREATURE_DISPLAY = { width: 48, height: 52 } as const;

export const PROP_DISPLAY: Record<string, { width: number; height: number }> = {
  "prop-tree": { width: 48, height: 50 },
  "prop-tree-mistwood": { width: 48, height: 50 },
  "prop-tree-emberfen": { width: 48, height: 50 },
  "prop-fern": { width: 40, height: 32 },
  "prop-shrine-altar": { width: 48, height: 40 },
  "prop-standing-stone": { width: 42, height: 38 },
  "prop-pebble-pile": { width: 44, height: 32 },
  "prop-hearth": { width: 48, height: 40 },
  "prop-cottage": { width: 56, height: 52 },
  "prop-gate": { width: 48, height: 42 },
  "prop-gate-locked": { width: 48, height: 42 },
  "prop-loom": { width: 46, height: 44 },
  "prop-shelf": { width: 40, height: 72 },
  "prop-boat": { width: 48, height: 40 },
};

/** Logical on-screen size for villager NPCs. */
export const NPC_DISPLAY = { width: 48, height: 72 } as const;

/** Logical on-screen sizes for floor / border tiles (Imagine textures are 4×). */
export const FLOOR_DISPLAY = { width: 48, height: 48 } as const;
export const BOUNDARY_DISPLAY = { width: 48, height: 56 } as const;

/** Max box for trimmed encounter art inside the panel (above title). */
export const ENCOUNTER_CREATURE_DISPLAY = { width: 360, height: 280 } as const;
export const BATTLE_CREATURE_DISPLAY = { width: 112, height: 122 } as const;
export const BATTLE_PLAYER_DISPLAY = { width: 100, height: 134 } as const;

export function fitDisplay(
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  size: { width: number; height: number },
): typeof image {
  image.setDisplaySize(size.width, size.height);
  return image;
}

/**
 * Scale an image to fit inside `size` while preserving aspect ratio.
 */
export function fitContainDisplay(
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  size: { width: number; height: number },
): typeof image {
  const scale = Math.min(
    size.width / image.width,
    size.height / image.height,
  );
  image.setDisplaySize(image.width * scale, image.height * scale);
  return image;
}

/**
 * Return a texture key whose pixels are cropped to the opaque alpha bbox.
 * Imagine encounter sheets carry large transparent padding; trimming lets the
 * creature fill the panel without overlapping title text.
 */
export function ensureTrimmedTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  sourceFrame?: string,
): [string, string | undefined] {
  const logicalKey = sourceFrame ?? sourceKey;
  const source: [string, string | undefined] = [sourceKey, sourceFrame];
  const trimmedKey = `${logicalKey}__trim`;
  if (scene.textures.exists(trimmedKey)) {
    return [trimmedKey, undefined];
  }
  if (!scene.textures.exists(sourceKey)) {
    return source;
  }

  const texture = scene.textures.get(sourceKey);
  const frame = texture.get(sourceFrame);
  const sourceImage = texture.getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement
    | null;
  if (!sourceImage || frame.cutWidth < 1 || frame.cutHeight < 1) {
    return source;
  }

  const scratch = document.createElement("canvas");
  scratch.width = frame.cutWidth;
  scratch.height = frame.cutHeight;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) {
    return source;
  }
  scratchCtx.drawImage(
    sourceImage,
    frame.cutX,
    frame.cutY,
    frame.cutWidth,
    frame.cutHeight,
    0,
    0,
    frame.cutWidth,
    frame.cutHeight,
  );

  const { data, width, height } = scratchCtx.getImageData(
    0,
    0,
    scratch.width,
    scratch.height,
  );
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return source;
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    return source;
  }
  outCtx.drawImage(scratch, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  scene.textures.addCanvas(trimmedKey, out);
  return [trimmedKey, undefined];
}
