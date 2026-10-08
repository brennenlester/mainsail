import Phaser from "phaser";
import {
  IMAGINE_ATLAS_KEY,
  hasImagineFrame,
  hasWorldTexture,
} from "./imagineAssets";
import { TILE_HEIGHT, TILE_WIDTH } from "../isometric";
import type { ZoneId } from "../world/zoneTypes";
import { NPC_DISPLAY, fitContainDisplay } from "./displaySizes";

type ZonePalette = { light: number; dark: number; accent: number; edge: number };

/** Warm plank floor shared by every cottage interior. */
const COTTAGE_PALETTE: ZonePalette = {
  light: 0xd8ab7a,
  dark: 0xba8b5c,
  accent: 0xf2d6ac,
  edge: 0x7f5433,
};

const ZONE_PALETTES: Record<ZoneId, ZonePalette> = {
  grove: { light: 0xb9df7b, dark: 0x87be64, accent: 0xe7f2a4, edge: 0x4e8a4b },
  shrine: { light: 0xd9d5ed, dark: 0xa9a8cf, accent: 0xf4e8ff, edge: 0x696a9d },
  village: { light: 0xeec58a, dark: 0xd89a5e, accent: 0xffe2a2, edge: 0xa96a43 },
  overworld: { light: 0x78c8e0, dark: 0x4fa8c8, accent: 0xb8e8f0, edge: 0x387898 },
  harbor: { light: 0x88c0d8, dark: 0x5898b0, accent: 0xc8e8f4, edge: 0x3a7088 },
  archipelago: {
    light: 0x78b8d0,
    dark: 0x4890a8,
    accent: 0xb8e8f4,
    edge: 0x2a6880,
  },
  mistwood: { light: 0xb8a8d8, dark: 0x8878b0, accent: 0xe0d4f8, edge: 0x5a4a80 },
  emberfen: { light: 0xe0b070, dark: 0xb87848, accent: 0xffd090, edge: 0x8a5030 },
  "warden-cottage": COTTAGE_PALETTE,
  "weaver-cottage": COTTAGE_PALETTE,
  "hearthkeep-cottage": COTTAGE_PALETTE,
  "hermit-cottage": COTTAGE_PALETTE,
};

const BOUNDARY_HEIGHT = 56;
const OUTLINE = 0x1a3040;

function drawSquareTile(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  fill: number,
  stroke: number,
  strokeAlpha = 0.35,
): void {
  g.fillStyle(fill, 1);
  g.fillRect(0, 0, w, h);
  g.lineStyle(1, stroke, strokeAlpha);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function generateFloorTextures(scene: Phaser.Scene, zoneId: ZoneId): void {
  const palette = ZONE_PALETTES[zoneId];
  for (const variant of ["light", "dark"] as const) {
    const key = `floor-${zoneId}-${variant}`;
    // Keep Imagine-preloaded floors; only synthesize when missing.
    if (hasWorldTexture(scene, key)) {
      continue;
    }
    const base = variant === "light" ? palette.light : palette.dark;
    const g = scene.make.graphics({ x: 0, y: 0 });
    drawSquareTile(g, TILE_WIDTH, TILE_HEIGHT, base, palette.edge);
    g.fillStyle(palette.accent, 0.22);
    for (let i = 0; i < 10; i += 1) {
      const x = 5 + ((i * 17 + (variant === "light" ? 3 : 9)) % 38);
      const y = 5 + ((i * 11 + (variant === "light" ? 7 : 2)) % 38);
      g.fillCircle(x, y, i % 3 === 0 ? 2 : 1);
    }
    if (zoneId === "grove") {
      // Soft tufted grass clumps
      g.fillStyle(0x529447, 0.55);
      for (const [x, y] of [
        [8, 16],
        [31, 34],
        [20, 26],
        [38, 18],
      ]) {
        g.fillTriangle(x, y, x + 3, y - 7, x + 6, y);
        g.fillTriangle(x + 2, y, x + 5, y - 5, x + 7, y);
      }
      g.fillStyle(0xf2f7aa, 0.7);
      g.fillCircle(16, 29, 2);
      g.fillCircle(39, 12, 2);
    } else if (zoneId === "shrine") {
      // Moonlit stone pavers
      g.fillStyle(0xf8f2ff, 0.28);
      g.fillRoundedRect(6, 6, 14, 14, 3);
      g.fillRoundedRect(28, 26, 12, 12, 3);
      g.fillStyle(0xf0e6ff, 0.5);
      g.fillCircle(TILE_WIDTH / 2, TILE_HEIGHT / 2, 3);
      g.lineStyle(1, 0xffffff, 0.45);
      g.strokeCircle(TILE_WIDTH / 2, TILE_HEIGHT / 2, 8);
      g.lineBetween(18, 24, 30, 24);
      g.lineBetween(24, 18, 24, 30);
    } else if (zoneId === "village") {
      // Warm dirt + plank streaks
      g.fillStyle(0xa8643d, 0.4);
      g.fillRoundedRect(6, 10, 16, 4, 2);
      g.fillRoundedRect(24, 28, 14, 4, 2);
      g.fillRoundedRect(10, 34, 12, 3, 1);
      g.fillStyle(0xffe8b8, 0.35);
      g.fillCircle(18, 20, 2);
    } else if (zoneId === "mistwood") {
      // Soft violet moss + mist wisps
      g.fillStyle(0xf0e8ff, 0.4);
      g.fillEllipse(14, 14, 12, 6);
      g.fillEllipse(34, 30, 14, 5);
      g.fillStyle(0x6a5890, 0.5);
      g.fillTriangle(8, 36, 11, 28, 14, 36);
      g.fillTriangle(28, 20, 31, 12, 34, 20);
      g.fillStyle(0xd8c8f0, 0.55);
      g.fillCircle(22, 22, 2);
    } else if (zoneId === "emberfen") {
      // Warm peat + ember flecks
      g.fillStyle(0x6a4030, 0.35);
      g.fillRoundedRect(8, 12, 14, 5, 2);
      g.fillRoundedRect(26, 28, 12, 4, 2);
      g.fillStyle(0xffa040, 0.55);
      g.fillCircle(16, 20, 2);
      g.fillCircle(34, 14, 2);
      g.fillStyle(0xffe080, 0.4);
      g.fillEllipse(24, 32, 16, 5);
    } else if (
      zoneId === "warden-cottage" ||
      zoneId === "weaver-cottage" ||
      zoneId === "hearthkeep-cottage" ||
      zoneId === "hermit-cottage"
    ) {
      g.fillStyle(palette.edge, 0.45);
      g.fillRect(0, 11, TILE_WIDTH, 2);
      g.fillRect(0, 23, TILE_WIDTH, 2);
      g.fillRect(0, 35, TILE_WIDTH, 2);
      g.fillStyle(palette.accent, 0.28);
      g.fillRect(6, 13, 20, 1);
      g.fillRect(22, 25, 16, 1);
      g.fillRect(10, 37, 18, 1);
      g.fillStyle(0x5a3820, 0.5);
      g.fillCircle(8, 12, 1);
      g.fillCircle(40, 24, 1);
    } else {
      // Bright blue route grass (Folklore Fields)
      g.fillStyle(0xdff7f4, 0.55);
      g.fillCircle(11, 12, 2);
      g.fillCircle(35, 31, 2);
      g.fillCircle(22, 20, 1);
      g.fillStyle(0x3e8f98, 0.45);
      g.fillTriangle(8, 36, 11, 28, 14, 36);
      g.fillTriangle(30, 18, 33, 10, 36, 18);
      g.lineStyle(1, 0x3e8f83, 0.35);
      g.lineBetween(7, 35, 18, 30);
    }
    g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT);
    g.destroy();
  }
}

function generateWaterTextures(scene: Phaser.Scene): void {
  for (const variant of ["light", "dark"] as const) {
    const key = `tile-water-${variant}`;
    if (hasWorldTexture(scene, key)) {
      continue;
    }
    const g = scene.make.graphics({ x: 0, y: 0 });
    const base = variant === "light" ? 0x4a9ec8 : 0x2f7eae;
    drawSquareTile(g, TILE_WIDTH, TILE_HEIGHT, base, 0x1e5a78, 0.45);
    g.fillStyle(0xb8e8ff, 0.35);
    g.fillEllipse(14, 16, 18, 6);
    g.fillEllipse(34, 28, 16, 5);
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(22, 22, 2);
    g.fillCircle(10, 32, 1);
    g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT);
    g.destroy();
  }
}

function generateDockTextures(scene: Phaser.Scene): void {
  for (const variant of ["light", "dark"] as const) {
    const key = `tile-dock-${variant}`;
    if (hasWorldTexture(scene, key)) {
      continue;
    }
    const g = scene.make.graphics({ x: 0, y: 0 });
    const base = variant === "light" ? 0xc49a62 : 0xa67a48;
    drawSquareTile(g, TILE_WIDTH, TILE_HEIGHT, base, 0x6a4828, 0.5);
    g.fillStyle(0x7a5530, 0.55);
    g.fillRect(4, 10, 40, 4);
    g.fillRect(4, 20, 40, 4);
    g.fillRect(4, 30, 40, 4);
    g.fillStyle(0xe8c894, 0.35);
    g.fillRect(6, 12, 36, 1);
    g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT);
    g.destroy();
  }
}

function generateBoatTexture(scene: Phaser.Scene): void {
  const key = "prop-boat";
  if (hasWorldTexture(scene, key)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(24, 40, 34, 10);
  g.fillStyle(0x8b5a2b, 1);
  g.fillTriangle(6, 28, 24, 10, 42, 28);
  g.fillStyle(0xa8723c, 1);
  g.fillRoundedRect(8, 24, 32, 14, 4);
  g.fillStyle(0xd8b070, 1);
  g.fillRect(22, 8, 3, 18);
  g.fillStyle(0xf4f0e4, 0.9);
  g.fillTriangle(25, 10, 25, 22, 38, 18);
  g.generateTexture(key, 48, 48);
  g.destroy();
}

function generateBoundaryTexture(
  scene: Phaser.Scene,
  key: string,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (hasWorldTexture(scene, key)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 });
  draw(g);
  g.generateTexture(key, TILE_WIDTH, BOUNDARY_HEIGHT);
  g.destroy();
}

function generateWallTextures(scene: Phaser.Scene): void {
  // Grove — fluffy hedge trees
  generateBoundaryTexture(scene, "boundary-grove", (g) => {
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 36, 7);

    g.fillStyle(0x5a4030, 1);
    g.fillRoundedRect(18, BOUNDARY_HEIGHT - 20, 12, 16, 3);
    g.fillStyle(0x7a5840, 1);
    g.fillRoundedRect(20, BOUNDARY_HEIGHT - 18, 8, 12, 2);

    g.fillStyle(OUTLINE, 1);
    g.fillCircle(12, BOUNDARY_HEIGHT - 28, 14);
    g.fillCircle(28, BOUNDARY_HEIGHT - 34, 16);
    g.fillCircle(38, BOUNDARY_HEIGHT - 26, 12);
    g.fillStyle(0x2f9a4a, 1);
    g.fillCircle(12, BOUNDARY_HEIGHT - 28, 12);
    g.fillCircle(28, BOUNDARY_HEIGHT - 34, 14);
    g.fillCircle(38, BOUNDARY_HEIGHT - 26, 10);
    g.fillStyle(0x6ed86a, 0.95);
    g.fillCircle(8, BOUNDARY_HEIGHT - 34, 7);
    g.fillCircle(26, BOUNDARY_HEIGHT - 42, 8);
    g.fillCircle(40, BOUNDARY_HEIGHT - 32, 6);
    g.fillStyle(0xd8f890, 0.7);
    g.fillCircle(6, BOUNDARY_HEIGHT - 36, 3);
    g.fillCircle(24, BOUNDARY_HEIGHT - 44, 3);
    g.fillCircle(42, BOUNDARY_HEIGHT - 30, 2);
  });

  // Shrine — bright moonstone pillars
  generateBoundaryTexture(scene, "boundary-shrine", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 34, 6);

    g.fillStyle(0x6a6488, 1);
    g.fillRoundedRect(6, BOUNDARY_HEIGHT - 14, 36, 12, 3);
    g.fillStyle(0x9a94c0, 1);
    g.fillRoundedRect(8, BOUNDARY_HEIGHT - 12, 32, 8, 2);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(9, BOUNDARY_HEIGHT - 42, 12, 30, 4);
    g.fillRoundedRect(27, BOUNDARY_HEIGHT - 46, 12, 34, 4);
    g.fillStyle(0x9a8cd0, 1);
    g.fillRoundedRect(11, BOUNDARY_HEIGHT - 40, 8, 26, 3);
    g.fillRoundedRect(29, BOUNDARY_HEIGHT - 44, 8, 30, 3);
    g.fillStyle(0xe8dcff, 0.95);
    g.fillRoundedRect(13, BOUNDARY_HEIGHT - 38, 4, 20, 2);
    g.fillRoundedRect(31, BOUNDARY_HEIGHT - 42, 4, 24, 2);

    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(15, BOUNDARY_HEIGHT - 44, 4);
    g.fillCircle(33, BOUNDARY_HEIGHT - 48, 4);
    g.lineStyle(1, 0xffffff, 0.75);
    g.lineBetween(15, BOUNDARY_HEIGHT - 34, 15, BOUNDARY_HEIGHT - 24);
    g.lineBetween(12, BOUNDARY_HEIGHT - 29, 18, BOUNDARY_HEIGHT - 29);
    g.strokeCircle(33, BOUNDARY_HEIGHT - 34, 3);
  });

  // Village — warm timber fence
  generateBoundaryTexture(scene, "boundary-village", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 36, 6);

    g.fillStyle(0x8a6848, 1);
    g.fillRoundedRect(4, BOUNDARY_HEIGHT - 14, 40, 12, 3);
    g.fillStyle(0xd0a878, 1);
    for (let i = 0; i < 5; i++) {
      g.fillRoundedRect(6 + i * 8, BOUNDARY_HEIGHT - 12, 6, 8, 1);
    }

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(7, BOUNDARY_HEIGHT - 38, 8, 26, 2);
    g.fillRoundedRect(33, BOUNDARY_HEIGHT - 38, 8, 26, 2);
    g.fillStyle(0xc48858, 1);
    g.fillRoundedRect(8, BOUNDARY_HEIGHT - 36, 6, 24, 2);
    g.fillRoundedRect(34, BOUNDARY_HEIGHT - 36, 6, 24, 2);
    g.fillStyle(0xe8b878, 1);
    g.fillRoundedRect(7, BOUNDARY_HEIGHT - 40, 8, 5, 2);
    g.fillRoundedRect(33, BOUNDARY_HEIGHT - 40, 8, 5, 2);

    g.fillStyle(0xf0c890, 1);
    g.fillRoundedRect(14, BOUNDARY_HEIGHT - 30, 20, 5, 2);
    g.fillRoundedRect(14, BOUNDARY_HEIGHT - 22, 20, 5, 2);

    g.fillStyle(0xffe066, 1);
    g.fillCircle(11, BOUNDARY_HEIGHT - 42, 4);
    g.fillStyle(0xffaa55, 0.45);
    g.fillCircle(11, BOUNDARY_HEIGHT - 42, 7);
  });

  // Overworld — bright route cliffs
  generateBoundaryTexture(scene, "boundary-overworld", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 38, 6);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(2, BOUNDARY_HEIGHT - 16, 44, 14, 3);
    g.fillStyle(0x5a90a8, 1);
    g.fillRoundedRect(3, BOUNDARY_HEIGHT - 15, 42, 12, 2);

    g.fillStyle(0x78b0c8, 1);
    g.fillTriangle(2, BOUNDARY_HEIGHT - 16, 18, BOUNDARY_HEIGHT - 38, 34, BOUNDARY_HEIGHT - 16);
    g.fillStyle(0x98d0e0, 1);
    g.fillTriangle(14, BOUNDARY_HEIGHT - 16, 30, BOUNDARY_HEIGHT - 46, 46, BOUNDARY_HEIGHT - 16);

    g.fillStyle(0xd0f0f8, 0.95);
    g.fillRoundedRect(22, BOUNDARY_HEIGHT - 30, 10, 8, 2);
    g.fillRoundedRect(26, BOUNDARY_HEIGHT - 36, 8, 6, 2);
    g.fillRoundedRect(28, BOUNDARY_HEIGHT - 42, 6, 6, 2);

    g.fillStyle(0xe8fff8, 0.4);
    g.fillEllipse(12, BOUNDARY_HEIGHT - 30, 16, 6);
    g.fillEllipse(36, BOUNDARY_HEIGHT - 38, 14, 5);

    g.fillStyle(0x6ed890, 0.7);
    g.fillCircle(18, BOUNDARY_HEIGHT - 20, 3);
    g.fillCircle(40, BOUNDARY_HEIGHT - 24, 3);
  });

  // Harbor — cool sea cliffs
  generateBoundaryTexture(scene, "boundary-harbor", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 38, 6);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(2, BOUNDARY_HEIGHT - 16, 44, 14, 3);
    g.fillStyle(0x4a7890, 1);
    g.fillRoundedRect(3, BOUNDARY_HEIGHT - 15, 42, 12, 2);

    g.fillStyle(0x6a98b0, 1);
    g.fillTriangle(2, BOUNDARY_HEIGHT - 16, 18, BOUNDARY_HEIGHT - 38, 34, BOUNDARY_HEIGHT - 16);
    g.fillStyle(0x8ab8d0, 1);
    g.fillTriangle(14, BOUNDARY_HEIGHT - 16, 30, BOUNDARY_HEIGHT - 46, 46, BOUNDARY_HEIGHT - 16);

    g.fillStyle(0xd0eef8, 0.9);
    g.fillRoundedRect(22, BOUNDARY_HEIGHT - 30, 10, 8, 2);
    g.fillRoundedRect(26, BOUNDARY_HEIGHT - 36, 8, 6, 2);

    g.fillStyle(0xb8e0f0, 0.45);
    g.fillEllipse(12, BOUNDARY_HEIGHT - 28, 16, 6);
    g.fillEllipse(36, BOUNDARY_HEIGHT - 36, 14, 5);
  });

  // Archipelago — open-sea horizon banks (same family as Harbor)
  generateBoundaryTexture(scene, "boundary-archipelago", (g) => {
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 40, 6);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(2, BOUNDARY_HEIGHT - 14, 44, 12, 3);
    g.fillStyle(0x3a7088, 1);
    g.fillRoundedRect(3, BOUNDARY_HEIGHT - 13, 42, 10, 2);

    g.fillStyle(0x5a98b0, 1);
    g.fillTriangle(2, BOUNDARY_HEIGHT - 14, 20, BOUNDARY_HEIGHT - 34, 36, BOUNDARY_HEIGHT - 14);
    g.fillStyle(0x7ab8d0, 1);
    g.fillTriangle(12, BOUNDARY_HEIGHT - 14, 28, BOUNDARY_HEIGHT - 42, 46, BOUNDARY_HEIGHT - 14);

    g.fillStyle(0xc8eef8, 0.5);
    g.fillEllipse(14, BOUNDARY_HEIGHT - 26, 18, 6);
    g.fillEllipse(34, BOUNDARY_HEIGHT - 32, 16, 5);
  });

  // Mistwood — violet mist cliffs
  generateBoundaryTexture(scene, "boundary-mistwood", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 38, 6);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(2, BOUNDARY_HEIGHT - 16, 44, 14, 3);
    g.fillStyle(0x6a5a88, 1);
    g.fillRoundedRect(3, BOUNDARY_HEIGHT - 15, 42, 12, 2);

    g.fillStyle(0x8878a8, 1);
    g.fillTriangle(2, BOUNDARY_HEIGHT - 16, 16, BOUNDARY_HEIGHT - 40, 32, BOUNDARY_HEIGHT - 16);
    g.fillStyle(0xa898c8, 1);
    g.fillTriangle(16, BOUNDARY_HEIGHT - 16, 32, BOUNDARY_HEIGHT - 48, 46, BOUNDARY_HEIGHT - 16);

    g.fillStyle(0xe8e0f8, 0.55);
    g.fillEllipse(12, BOUNDARY_HEIGHT - 28, 18, 7);
    g.fillEllipse(34, BOUNDARY_HEIGHT - 36, 16, 6);
    g.fillStyle(0xd0c0f0, 0.7);
    g.fillCircle(20, BOUNDARY_HEIGHT - 22, 3);
    g.fillCircle(38, BOUNDARY_HEIGHT - 26, 3);
  });

  // Emberfen — warm peat banks
  generateBoundaryTexture(scene, "boundary-emberfen", (g) => {
    g.fillStyle(0x000000, 0.14);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 38, 6);

    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(2, BOUNDARY_HEIGHT - 16, 44, 14, 3);
    g.fillStyle(0x8a5030, 1);
    g.fillRoundedRect(3, BOUNDARY_HEIGHT - 15, 42, 12, 2);

    g.fillStyle(0xb86840, 1);
    g.fillTriangle(2, BOUNDARY_HEIGHT - 16, 18, BOUNDARY_HEIGHT - 36, 34, BOUNDARY_HEIGHT - 16);
    g.fillStyle(0xd88850, 1);
    g.fillTriangle(14, BOUNDARY_HEIGHT - 16, 30, BOUNDARY_HEIGHT - 44, 46, BOUNDARY_HEIGHT - 16);

    g.fillStyle(0xffa040, 0.7);
    g.fillCircle(16, BOUNDARY_HEIGHT - 24, 3);
    g.fillCircle(34, BOUNDARY_HEIGHT - 30, 3);
    g.fillStyle(0xffe080, 0.45);
    g.fillEllipse(24, BOUNDARY_HEIGHT - 28, 18, 6);
  });

  const cottageWalls: { key: string; accent: number }[] = [
    { key: "boundary-warden-cottage", accent: 0x7aa8c8 },
    { key: "boundary-weaver-cottage", accent: 0xc890b0 },
    { key: "boundary-hearthkeep-cottage", accent: 0xe0a060 },
    { key: "boundary-hermit-cottage", accent: 0x7a9ab0 },
  ];
  for (const { key, accent } of cottageWalls) {
    generateBoundaryTexture(scene, key, (g) => {
      g.fillStyle(0x000000, 0.14);
      g.fillEllipse(24, BOUNDARY_HEIGHT - 3, 36, 6);

      g.fillStyle(OUTLINE, 1);
      g.fillRoundedRect(4, 6, 40, 46, 3);
      g.fillStyle(0xe8d4b8, 1);
      g.fillRoundedRect(5, 7, 38, 44, 2);

      g.fillStyle(0x8a5a38, 1);
      g.fillRoundedRect(5, BOUNDARY_HEIGHT - 22, 38, 18, 2);
      g.fillStyle(0xc48858, 1);
      for (let i = 0; i < 4; i += 1) {
        g.fillRect(8 + i * 9, BOUNDARY_HEIGHT - 20, 7, 14);
      }
      g.fillStyle(0x6a4030, 1);
      g.fillRect(5, BOUNDARY_HEIGHT - 24, 38, 3);

      g.fillStyle(accent, 0.95);
      g.fillRoundedRect(18, 12, 12, 16, 2);
      g.fillStyle(0xffe8a0, 0.75);
      g.fillCircle(24, 18, 3);
    });
  }
}

function generatePropTextures(scene: Phaser.Scene): void {
  if (!hasWorldTexture(scene, "prop-tree")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(25, 47, 28, 6);
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(20, 28, 10, 20, 3);
    g.fillStyle(0x8a5a38, 1);
    g.fillRoundedRect(21, 29, 8, 18, 2);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(24, 18, 18);
    g.fillCircle(14, 24, 12);
    g.fillCircle(34, 24, 11);
    g.fillStyle(0x3cbc58, 1);
    g.fillCircle(24, 18, 16);
    g.fillCircle(14, 24, 10);
    g.fillCircle(34, 24, 9);
    g.fillStyle(0x7ae068, 0.95);
    g.fillCircle(18, 12, 8);
    g.fillCircle(30, 14, 8);
    g.fillStyle(0xe8f898, 0.7);
    g.fillCircle(16, 10, 3);
    g.fillCircle(30, 14, 2);
    g.generateTexture("prop-tree", 48, 50);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-fern")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(20, 30, 4, 10, 20, 18);
    g.fillTriangle(20, 30, 36, 6, 26, 20);
    g.fillStyle(0x4cbc68, 1);
    g.fillTriangle(20, 28, 7, 8, 20, 18);
    g.fillTriangle(20, 28, 33, 5, 25, 19);
    g.fillStyle(0x9ae878, 1);
    g.fillTriangle(20, 28, 14, 4, 22, 18);
    g.fillStyle(0xe8f8a0, 0.8);
    g.fillCircle(15, 12, 2);
    g.generateTexture("prop-fern", 40, 32);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-shrine-altar")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(7, 23, 34, 14, 4);
    g.fillStyle(0x6a5a88, 1);
    g.fillRoundedRect(8, 24, 32, 12, 3);
    g.fillStyle(0x9a88c0, 1);
    g.fillRoundedRect(12, 16, 24, 12, 4);
    g.fillStyle(0xd8c8f0, 1);
    g.fillRoundedRect(15, 18, 18, 6, 2);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(24, 10, 8);
    g.fillStyle(0xf0e6ff, 0.55);
    g.fillCircle(24, 10, 12);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeCircle(24, 10, 11);
    g.generateTexture("prop-shrine-altar", 48, 40);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-standing-stone")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(21, 35, 22, 5);
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(14, 34, 15, 10, 22, 4);
    g.fillTriangle(22, 4, 30, 11, 29, 34);
    g.fillStyle(0x8a84b0, 1);
    g.fillTriangle(16, 32, 17, 12, 22, 7);
    g.fillTriangle(22, 7, 28, 13, 27, 32);
    g.fillStyle(0xe0d8f8, 0.85);
    g.fillCircle(22, 17, 3);
    g.fillCircle(22, 24, 2);
    g.generateTexture("prop-standing-stone", 42, 38);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-pebble-pile")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(14, 24, 6);
    g.fillCircle(22, 26, 5);
    g.fillCircle(30, 23, 6);
    g.fillCircle(18, 19, 4);
    g.fillCircle(26, 17, 5);
    g.fillStyle(0xa8a4b8, 1);
    g.fillCircle(14, 24, 5);
    g.fillCircle(22, 26, 4);
    g.fillCircle(30, 23, 5);
    g.fillCircle(18, 19, 3);
    g.fillCircle(26, 17, 4);
    g.fillStyle(0xf0ecf8, 0.75);
    g.fillCircle(17, 19, 2);
    g.fillCircle(28, 16, 2);
    g.generateTexture("prop-pebble-pile", 44, 32);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-hearth")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(5, 17, 38, 20, 4);
    g.fillStyle(0x6a4838, 1);
    g.fillRoundedRect(6, 18, 36, 18, 3);
    g.fillStyle(0xa87858, 1);
    g.fillRoundedRect(14, 6, 20, 14, 4);
    g.fillStyle(0x2a1810, 1);
    g.fillRoundedRect(18, 20, 12, 10, 2);
    g.fillStyle(0xff8844, 0.95);
    g.fillCircle(24, 18, 6);
    g.fillStyle(0xffe066, 0.95);
    g.fillCircle(24, 16, 3);
    g.generateTexture("prop-hearth", 48, 40);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-cottage")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(9, 21, 30, 20, 3);
    g.fillStyle(0xc89068, 1);
    g.fillRoundedRect(10, 22, 28, 18, 2);
    g.fillStyle(0xe8b888, 1);
    g.fillRoundedRect(13, 24, 22, 14, 2);
    g.fillStyle(OUTLINE, 1);
    g.fillTriangle(7, 22, 24, 5, 41, 22);
    g.fillStyle(0xe86858, 1);
    g.fillTriangle(9, 22, 24, 7, 39, 22);
    g.fillStyle(0x6a4838, 1);
    g.fillRoundedRect(20, 28, 8, 12, 2);
    g.fillStyle(0xffe8a0, 0.9);
    g.fillRoundedRect(12, 26, 6, 5, 1);
    g.fillRoundedRect(30, 26, 5, 5, 1);
    g.generateTexture("prop-cottage", 48, 44);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-gate")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(7, 7, 8, 34, 2);
    g.fillRoundedRect(33, 7, 8, 34, 2);
    g.fillRoundedRect(7, 5, 34, 8, 3);
    g.fillStyle(0xc88858, 1);
    g.fillRoundedRect(8, 8, 6, 32, 2);
    g.fillRoundedRect(34, 8, 6, 32, 2);
    g.fillRoundedRect(8, 6, 32, 6, 2);
    g.fillStyle(0x68d878, 0.85);
    g.fillRoundedRect(14, 12, 20, 24, 3);
    g.lineStyle(2, 0xffe0a0, 0.7);
    g.lineBetween(16, 16, 32, 28);
    g.generateTexture("prop-gate", 48, 42);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-gate-locked")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(7, 7, 8, 34, 2);
    g.fillRoundedRect(33, 7, 8, 34, 2);
    g.fillRoundedRect(7, 5, 34, 8, 3);
    g.fillStyle(0xc88858, 1);
    g.fillRoundedRect(8, 8, 6, 32, 2);
    g.fillRoundedRect(34, 8, 6, 32, 2);
    g.fillRoundedRect(8, 6, 32, 6, 2);
    g.fillStyle(0xe86868, 0.9);
    g.fillRoundedRect(14, 12, 20, 24, 3);
    g.lineStyle(2, 0x7a2020, 0.95);
    g.strokeRoundedRect(14, 12, 20, 24, 3);
    g.generateTexture("prop-gate-locked", 48, 42);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-loom")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(6, 6, 34, 36, 3);
    g.fillStyle(0xa87848, 1);
    g.fillRoundedRect(7, 7, 32, 34, 2);
    g.fillStyle(0x6a4838, 1);
    g.fillRect(11, 10, 4, 28);
    g.fillRect(31, 10, 4, 28);
    g.fillStyle(0xf0e0c8, 1);
    g.fillRect(15, 12, 16, 22);
    g.lineStyle(1, 0xc0a880, 0.9);
    for (let y = 14; y < 34; y += 4) {
      g.lineBetween(15, y, 31, y);
    }
    g.fillStyle(0xd88898, 1);
    g.fillRect(15, 30, 16, 4);
    g.generateTexture("prop-loom", 46, 44);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "prop-shelf")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(22, 40, 28, 5);
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(4, 2, 36, 38, 3);
    g.fillStyle(0x6a4228, 1);
    g.fillRoundedRect(5, 3, 34, 36, 2);
    g.fillStyle(0x3a2418, 1);
    g.fillRect(8, 6, 28, 30);
    g.fillStyle(0x8a5a38, 1);
    g.fillRect(7, 15, 30, 3);
    g.fillRect(7, 26, 30, 3);
    g.fillRect(7, 36, 30, 3);
    const spines = [0xc45c4c, 0xe0a048, 0x5a8cc0, 0x6ab070, 0xb078c0];
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle(spines[i], 1);
      g.fillRect(9 + i * 5, 7 + (i % 2), 4, 8 - (i % 2));
      g.fillStyle(spines[(i + 2) % 5], 1);
      g.fillRect(9 + i * 5, 19, 4, 7);
    }
    g.fillStyle(0xd8b070, 1);
    g.fillRect(10, 30, 12, 6);
    g.fillStyle(0xf0e0c0, 1);
    g.fillRoundedRect(24, 30, 10, 6, 1);
    g.fillStyle(0xe8c878, 1);
    g.fillCircle(22, 5, 3);
    g.generateTexture("prop-shelf", 44, 42);
    g.destroy();
  }

  if (!hasWorldTexture(scene, "floor-path")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    drawSquareTile(g, TILE_WIDTH, TILE_HEIGHT, 0xe0d0a8, 0xb09870);
    g.fillStyle(0xf0e4c0, 0.55);
    g.fillRoundedRect(8, TILE_HEIGHT / 2 - 3, TILE_WIDTH - 16, 6, 2);
    g.generateTexture("floor-path", TILE_WIDTH, TILE_HEIGHT);
    g.destroy();
  }
}

export const NPC_TEXTURE_KEY = "npc-villager";

/**
 * One neutral villager body. Per-NPC colour comes from a sprite tint, so the
 * robe and hood are kept pale enough to take one.
 */
function generateNpcTexture(scene: Phaser.Scene): void {
  if (hasWorldTexture(scene, NPC_TEXTURE_KEY)) {
    return;
  }
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.16);
  g.fillEllipse(20, 51, 22, 5);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(10, 44, 9, 8, 2);
  g.fillRoundedRect(21, 44, 9, 8, 2);
  g.fillStyle(0x5a4030, 1);
  g.fillRoundedRect(11, 45, 7, 6, 1);
  g.fillRoundedRect(22, 45, 7, 6, 1);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(7, 22, 26, 26, 8);
  g.fillRoundedRect(4, 26, 7, 14, 3);
  g.fillRoundedRect(29, 26, 7, 14, 3);
  g.fillStyle(0xe8e8f0, 1);
  g.fillRoundedRect(8, 23, 24, 24, 7);
  g.fillRoundedRect(5, 27, 5, 12, 2);
  g.fillRoundedRect(30, 27, 5, 12, 2);
  g.fillStyle(0xc8b090, 1);
  g.fillRoundedRect(8, 36, 24, 4, 1);
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(20, 16, 20, 20);
  g.fillStyle(0xf6dcc0, 1);
  g.fillEllipse(20, 16, 16, 16);
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(8, 4, 24, 12, 6);
  g.fillStyle(0xe8e8f0, 1);
  g.fillRoundedRect(9, 5, 22, 10, 5);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(16, 17, 1.6);
  g.fillCircle(24, 17, 1.6);
  g.fillStyle(0xd8a0a0, 0.55);
  g.fillCircle(13, 21, 2);
  g.fillCircle(27, 21, 2);
  g.generateTexture(NPC_TEXTURE_KEY, 40, 54);
  g.destroy();
}

export function getBoundaryTextureKey(zoneId: ZoneId): string {
  return `boundary-${zoneId}`;
}

export function ensureWorldTextures(scene: Phaser.Scene, zoneId: ZoneId): void {
  generateWallTextures(scene);
  generatePropTextures(scene);
  generateNpcTexture(scene);
  generateFloorTextures(scene, zoneId);
  generateWaterTextures(scene);
  generateDockTextures(scene);
  generateBoatTexture(scene);
}

export function getFloorTextureKey(
  zoneId: ZoneId,
  light: boolean,
): string {
  return `floor-${zoneId}-${light ? "light" : "dark"}`;
}

export function getWaterTextureKey(light: boolean): string {
  return `tile-water-${light ? "light" : "dark"}`;
}

export function getDockTextureKey(light: boolean): string {
  return `tile-dock-${light ? "light" : "dark"}`;
}

export function getBoatTextureKey(): string {
  return "prop-boat";
}

/**
 * Villager art: the Blender-rendered atlas frame (#361) when packed, else a
 * standalone texture, else the tinted procedural villager. Sprites also play
 * the rendered `<key>__idle` / `__talk` loop when it exists.
 */
export function applyNpcSprite(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  npc: { spriteKey: string; tint: number },
  size: { width: number; height: number } = NPC_DISPLAY,
  anim: "idle" | "talk" = "idle",
): Phaser.GameObjects.Image {
  if (hasImagineFrame(scene, npc.spriteKey)) {
    image.setTexture(IMAGINE_ATLAS_KEY, npc.spriteKey);
    image.clearTint();
    const animKey = `${npc.spriteKey}__${anim}`;
    if (image instanceof Phaser.GameObjects.Sprite && scene.anims.exists(animKey)) {
      image.play(animKey);
    }
    return fitContainDisplay(image, size);
  }
  const key = scene.textures.exists(npc.spriteKey)
    ? npc.spriteKey
    : NPC_TEXTURE_KEY;
  image.setTexture(key);
  if (key === NPC_TEXTURE_KEY) {
    image.setTint(npc.tint);
  } else {
    image.clearTint();
  }
  return fitContainDisplay(image, size);
}
