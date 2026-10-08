import Phaser from "phaser";
import { PreloadScene } from "./scenes/PreloadScene";
import { TitleScene } from "./scenes/TitleScene";
import { IsometricScene } from "./scenes/IsometricScene";
import { EncounterScene } from "./scenes/EncounterScene";
import { BattleScene } from "./scenes/BattleScene";
import { ShrineScene } from "./scenes/ShrineScene";
import { DialogueScene } from "./scenes/DialogueScene";
import { WardCrossingScene } from "./scenes/WardCrossingScene";
import { LoomPatternScene } from "./scenes/LoomPatternScene";
import { HearthLotsScene } from "./scenes/HearthLotsScene";

export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 640,
    height: 640,
    backgroundColor: "#1a1a2e",
    scene: [
      PreloadScene,
      TitleScene,
      IsometricScene,
      EncounterScene,
      BattleScene,
      ShrineScene,
      DialogueScene,
      WardCrossingScene,
      LoomPatternScene,
      HearthLotsScene,
    ],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      // Atlas pages are power-of-two (#360) so they get mipmaps; 4x sprites
      // shown at 1-2x stay smooth instead of shimmering.
      mipmapFilter: "LINEAR_MIPMAP_LINEAR",
    },
  });
}
