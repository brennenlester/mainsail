import Phaser from "phaser";
import { preloadGameAudio } from "../audio/gameAudio";
import { getBootContext } from "../opening/bootRoute";
import { preloadTitleArt } from "./TitleScene";
import {
  createImagineAnims,
  preloadImagineAssets,
} from "../render/imagineAssets";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    const title = getBootContext().route === "title";
    if (title) {
      document.body.classList.add("title-active");
    }
    this.drawBrandedLoader();
    if (title) {
      preloadTitleArt(this);
    }

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

  /**
   * Branded loader (#363): night sky, Ivyward wordmark, and a crescent whose
   * gold ring fills with load progress. Drawn with primitives only — nothing
   * here may depend on the assets being loaded.
   */
  private drawBrandedLoader(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    this.cameras.main.setBackgroundColor(0x0d1424);
    this.add
      .graphics()
      .fillGradientStyle(0x080e1d, 0x080e1d, 0x24335a, 0x24335a, 1)
      .fillRect(0, 0, width, height);

    const moonY = cy - 58;
    const moon = this.add.graphics();
    moon.fillStyle(0xbcd4ff, 0.08).fillCircle(cx, moonY, 46);
    moon.fillStyle(0xe8eefc, 1).fillCircle(cx, moonY, 22);
    moon.fillStyle(0x101a33, 1).fillCircle(cx + 10, moonY - 6, 19);
    const ring = this.add.graphics();
    const drawRing = (ratio: number): void => {
      ring.clear();
      ring.lineStyle(2, 0xf3ead3, 0.14).strokeCircle(cx, moonY, 34);
      if (ratio > 0) {
        ring.lineStyle(3, 0xf2c75c, 1);
        ring.beginPath();
        ring.arc(cx, moonY, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ring.strokePath();
      }
    };
    drawRing(0);

    this.add
      .text(cx, cy + 18, "Ivyward", {
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: "52px",
        fontStyle: "700",
        color: "#f3ead3",
      })
      .setOrigin(0.5);
    const caption = this.add
      .text(cx, cy + 64, "Gathering moonlight…", {
        fontFamily: '"Source Sans 3", system-ui, sans-serif',
        fontSize: "14px",
        fontStyle: "600",
        color: "#bcd4ff",
      })
      .setOrigin(0.5)
      .setAlpha(0.75);
    this.tweens.add({ targets: caption, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

    this.load.on("progress", (value: number) => {
      const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
      drawRing(ratio);
    });
  }

  create(): void {
    // Global anims (scene.anims is game-wide): idle/walk/attack/hurt sets.
    createImagineAnims(this);
    this.scene.start(
      getBootContext().route === "title" ? "TitleScene" : "IsometricScene",
    );
  }
}
