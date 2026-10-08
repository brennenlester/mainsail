import Phaser from "phaser";
import { getBootContext } from "../opening/bootRoute";
import { preloadTitleArt } from "./TitleScene";
import { type LoadErrorFile, warnOnLoadError } from "./loadError";
import { createImagineAnims } from "../render/imagineAssets";
import {
  markWorldAssetsReady,
  queueBootAssets,
  setWorldAssetsProgress,
} from "../render/bootAssets";
import { lateCreatureKeys, queueLateImages } from "../render/lateAssets";
import { playerParty } from "../creatures/party";
import { worldState } from "../world/worldState";
import { readShareParam } from "../share/shareCode";

/**
 * Sovereign art a save (or a shared card) can show from the first frame:
 * owned or codex-discovered sovereigns load at boot, everyone else's on demand.
 */
function bootLateImageKeys(): string[] {
  const ids = new Set<string>(worldState.discoveredCreatures);
  for (const c of playerParty.creatures) {
    ids.add(c.definitionId);
    ids.add(c.speciesId);
  }
  const card = readShareParam();
  if (card.status === "ok") {
    for (const c of card.snapshot.party) {
      ids.add(c.id);
    }
  }
  return lateCreatureKeys(ids);
}

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

    // ponytail: missing optional Imagine files only warn (dev builds); procedural ensure* fills gaps
    this.load.on("loaderror", (file: LoadErrorFile) => {
      warnOnLoadError(file, import.meta.env.DEV);
    });
    // Title route (#410): only what the title shows blocks it; the atlas and
    // world audio stream in behind the title (see create). Other routes go
    // straight into play, so they load everything now.
    queueBootAssets(this, title ? "title" : "all");
    if (!title) {
      queueLateImages(this, bootLateImageKeys(), null);
    }
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
    if (getBootContext().route === "title") {
      this.scene.launch("TitleScene");
      this.streamWorldAssets();
      return;
    }
    // Global anims (scene.anims is game-wide): idle/walk/attack/hurt sets.
    createImagineAnims(this);
    markWorldAssetsReady();
    this.scene.start("IsometricScene");
  }

  /**
   * Second boot phase behind the title (#410): atlas pages, anims and world
   * audio. TitleScene waits on `whenWorldAssetsReady` (with the loading
   * veil) only if the player gets through the menu first.
   */
  private streamWorldAssets(): void {
    // The title draws over this scene; hide the loader art and keep only
    // the loader itself running.
    this.tweens.killAll();
    this.cameras.main.setVisible(false);
    this.load.removeAllListeners("progress");
    queueBootAssets(this, "world");
    queueLateImages(this, bootLateImageKeys(), null);
    this.load.on("progress", setWorldAssetsProgress);
    this.load.once("complete", () => {
      createImagineAnims(this);
      markWorldAssetsReady();
      this.scene.stop();
    });
    this.load.start();
  }
}
