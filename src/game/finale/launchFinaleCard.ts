import type Phaser from "phaser";
import type { CreatureInstance } from "../creatures/types";
import { FINALE_SCENE_KEY, FinaleScene, type FinaleSceneData } from "./FinaleScene";

export type FinaleCardOptions = {
  playerName: string | null | undefined;
  party: readonly CreatureInstance[];
  /** Runs after "Keep exploring" (e.g. hand control back to the story). */
  onContinue?: () => void;
};

/**
 * Show the credits-style finale card over `from` (#393): "Ivyward — thanks
 * for playing", a companion recap, Share and "Keep exploring". `from` is
 * paused underneath and resumed on continue. Not wired into the story here —
 * the boss/finale lane (#385) calls this from its hook, e.g.
 *
 *   launchFinaleCard(this, { playerName: getPlayerName(), party: getActiveCreatures() });
 */
export function launchFinaleCard(from: Phaser.Scene, options: FinaleCardOptions): void {
  const manager = from.scene.manager;
  // Registered lazily so Game.ts stays untouched.
  if (!manager.keys[FINALE_SCENE_KEY]) {
    manager.add(FINALE_SCENE_KEY, FinaleScene, false);
  }
  const data: FinaleSceneData = { ...options, returnTo: from.scene.key };
  from.scene.launch(FINALE_SCENE_KEY, data);
  from.scene.bringToTop(FINALE_SCENE_KEY);
  from.scene.pause();
}
