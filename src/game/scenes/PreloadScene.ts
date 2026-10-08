import Phaser from "phaser";
import { preloadGameAudio } from "../audio/gameAudio";
import {
  createImagineAnims,
  preloadImagineAssets,
} from "../render/imagineAssets";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0xe8f2ec);

    const barWidth = Math.min(280, Math.max(120, width * 0.55));
    const barHeight = 14;
    const cx = width / 2;
    const cy = height / 2;

    this.add
      .rectangle(cx, cy, barWidth + 4, barHeight + 4, 0x3a5a4c)
      .setOrigin(0.5);
    const fill = this.add
      .rectangle(cx - barWidth / 2, cy, 1, barHeight, 0xd7efe4)
      .setOrigin(0, 0.5);

    this.load.on("progress", (value: number) => {
      const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      fill.setDisplaySize(Math.max(1, barWidth * ratio), barHeight);
    });

    // ponytail: ignore missing optional Imagine files; procedural ensure* fills gaps
    this.load.on("loaderror", () => {
      /* intentional no-op */
    });
    preloadImagineAssets(this);
    this.load.image(
      "creature-tide-sovereign",
      "assets/creatures/creature-tide-sovereign.png",
    );
    this.load.image(
      "creature-cairn-sovereign",
      "assets/creatures/creature-cairn-sovereign.png",
    );
    this.load.image(
      "creature-horizon-sovereign",
      "assets/creatures/creature-horizon-sovereign.png",
    );
    this.load.image(
      "creature-eclipse-sovereign",
      "assets/creatures/creature-eclipse-sovereign.png",
    );
    // Villagers are Blender renders in the atlas (#361); applyNpcSprite falls
    // back to the procedural villager if a frame is missing.
    this.load.image(
      "minigame-hearth-lots-board",
      "assets/minigames/hearth-lots-board.png",
    );
    this.load.image("prop-shelf", "assets/world/prop-shelf.png");
    this.load.image("prop-cottage", "assets/world/prop-cottage.png");
    this.load.image(
      "boundary-warden-cottage",
      "assets/world/boundary-cottage.png",
    );
    this.load.image(
      "boundary-weaver-cottage",
      "assets/world/boundary-cottage.png",
    );
    this.load.image(
      "boundary-hearthkeep-cottage",
      "assets/world/boundary-cottage.png",
    );
    this.load.image(
      "boundary-hermit-cottage",
      "assets/world/boundary-cottage.png",
    );
    preloadGameAudio(this);
  }

  create(): void {
    // Global anims (scene.anims is game-wide): idle/walk/attack/hurt sets.
    createImagineAnims(this);
    this.scene.start("IsometricScene");
  }
}
