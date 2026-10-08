import Phaser from "phaser";
import type { HotkeyGuard } from "../input/hotkeyGuard";
import { prefersReducedMotion } from "../render/fx/fxSettings";

/**
 * Once the hotkey guard arms (#418), give the keyed controls one subtle
 * "ready" pop so keyboard players see when their keys start counting.
 * Records `hotkeysArmed` in the scene's data for tests.
 */
export function pulseWhenHotkeysArmed(
  scene: Phaser.Scene,
  guard: HotkeyGuard,
  targets: () => Phaser.GameObjects.Container[],
): void {
  scene.data.set("hotkeysArmed", false);
  const timer = scene.time.addEvent({
    delay: 50,
    loop: true,
    callback: () => {
      if (!guard.armed()) {
        return;
      }
      timer.remove();
      scene.data.set("hotkeysArmed", true);
      if (prefersReducedMotion()) {
        return;
      }
      for (const target of targets()) {
        if (!target.active) {
          continue;
        }
        const sx = target.scaleX;
        const sy = target.scaleY;
        scene.tweens.add({
          targets: target,
          scaleX: sx * 1.04,
          scaleY: sy * 1.04,
          duration: 120,
          yoyo: true,
          ease: "Sine.easeOut",
          onComplete: () => target.setScale(sx, sy),
        });
      }
    },
  });
}
