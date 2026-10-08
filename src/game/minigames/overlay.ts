import Phaser from "phaser";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { tryClaimMinigameWin } from "./progress";
import { MINIGAMES, type MinigameId } from "./ids";
import { setTouchControlsEnabled } from "../ui/touchControls";

export const MINIGAME_TEXT = {
  fontFamily: "Source Sans 3, system-ui, sans-serif",
} as const;

export function bootMinigameOverlay(scene: Phaser.Scene): void {
  bindOverlayPixelRatio(scene);
  scene.cameras.main.fadeIn(120, 255, 255, 255);
  scene.add
    .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x1a3048, 0.55)
    .setOrigin(0)
    .setInteractive();
}

export function addMinigameButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  origin: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Phaser.GameObjects.Text {
  const button = scene.add
    .text(x, y, label, {
      ...MINIGAME_TEXT,
      color: "#1a3040",
      backgroundColor: "#f0c878",
      fontSize: "15px",
      fontStyle: "bold",
      padding: { x: 14, y: 8 },
    })
    .setOrigin(origin.x, origin.y)
    .setInteractive({ useHandCursor: true });
  button.on("pointerover", () => button.setAlpha(0.88));
  button.on("pointerout", () => button.setAlpha(1));
  return button;
}

export function closeMinigameOverlay(scene: Phaser.Scene): void {
  scene.cameras.main.fadeOut(120, 255, 255, 255);
  scene.time.delayedCall(130, () => {
    scene.scene.stop();
    scene.scene.resume("IsometricScene");
    setTouchControlsEnabled(true);
    scene.scene.get("IsometricScene").events.emit("minigame-closed");
  });
}

export function bindMinigameQuit(
  scene: Phaser.Scene,
  onQuit: () => void,
): Phaser.GameObjects.Text {
  const quit = addMinigameButton(scene, DESIGN_SIZE - 24, 24, "Quit", {
    x: 1,
    y: 0,
  });
  quit.on("pointerdown", () => onQuit());
  scene.input.keyboard?.on("keydown-ESC", () => onQuit());
  return quit;
}

export function resolveMinigameEnd(
  scene: Phaser.Scene,
  minigameId: MinigameId,
  won: boolean,
  status: Phaser.GameObjects.Text,
  closing: { current: boolean },
): void {
  if (closing.current) {
    return;
  }
  closing.current = true;
  const title = MINIGAMES[minigameId].title;
  if (won) {
    const payout = tryClaimMinigameWin(minigameId);
    status.setText(payout ? `You win. ${payout}` : `${title}: you win.`);
  } else {
    status.setText(`${title}: not this time.`);
  }
  scene.time.delayedCall(1400, () => {
    closeMinigameOverlay(scene);
  });
}
