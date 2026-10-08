import type Phaser from "phaser";
import {
  EVOLUTION_SCENE_KEY,
  EvolutionScene,
  type EvolutionSceneData,
} from "../scenes/EvolutionScene";
import { flushPendingHostSave, notifyWorldChanged } from "../world/worldSaveSchedule";

/**
 * Play the Growth unlock cutscene over `from` (#393). Call *after* the party
 * mutation: the save is flushed first so the cutscene is purely cosmetic.
 * `from` sleeps and is woken when the player continues.
 */
export function launchEvolutionScene(
  from: Phaser.Scene,
  data: Omit<EvolutionSceneData, "returnTo">,
): void {
  notifyWorldChanged();
  flushPendingHostSave();
  const manager = from.scene.manager;
  // Registered lazily so Game.ts (shared by other lanes) stays untouched.
  if (!manager.keys[EVOLUTION_SCENE_KEY]) {
    manager.add(EVOLUTION_SCENE_KEY, EvolutionScene, false);
  }
  const sceneData: EvolutionSceneData = { ...data, returnTo: from.scene.key };
  from.scene.launch(EVOLUTION_SCENE_KEY, sceneData);
  from.scene.bringToTop(EVOLUTION_SCENE_KEY);
  from.scene.sleep();
}
