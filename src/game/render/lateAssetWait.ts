import Phaser from "phaser";
import { hideLoadingVeil, showLoadingVeil } from "../ui/loadingVeil";
import { fetchLateImages, isLateImageKey, lateImageStatus } from "./lateAssets";

/**
 * A loader entry that downloads nothing: it completes when the shared
 * late-image fetch settles, so the scene's `create()` waits on the same
 * per-key promise as every other consumer (#410).
 */
class LateImageWaitFile extends Phaser.Loader.File {
  private readonly ready: Promise<boolean>;

  constructor(loader: Phaser.Loader.LoaderPlugin, key: string, ready: Promise<boolean>) {
    super(loader, { type: "lateImageWait", key, url: "about:blank" });
    this.ready = ready;
  }

  load(): void {
    this.state = Phaser.Loader.FILE_LOADING;
    void this.ready.then(() => {
      // The scene may have shut down meanwhile; its loader no longer waits.
      if (this.loader?.inflight?.contains(this)) {
        this.loader.nextFile(this, true);
      }
    });
  }

  addToCache(): void {
    // Nothing to cache: the texture went into the shared manager already.
  }
}

let waitSeq = 0;

/**
 * Call from a scene's `preload()`: holds `create()` until these late images
 * have loaded (or failed, leaving procedural art). A slow fetch shows the
 * loading veil with `caption` (null: never).
 */
export function waitForLateImages(
  scene: Phaser.Scene,
  keys: Iterable<string>,
  caption: string | null = "Something stirs…",
): void {
  const pending = [...keys].filter(
    (key) => isLateImageKey(key) && lateImageStatus(scene.textures, key) !== "ready",
  );
  if (pending.length === 0) {
    return;
  }
  const ready = fetchLateImages(scene.textures, pending);
  waitSeq += 1;
  scene.load.addFile(new LateImageWaitFile(scene.load, `late-wait-${waitSeq}`, ready));
  if (caption === null) {
    return;
  }
  let shown = false;
  const veil = window.setTimeout(() => {
    shown = true;
    showLoadingVeil(caption);
  }, 150);
  const done = (): void => {
    window.clearTimeout(veil);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, done);
    if (shown) {
      shown = false;
      hideLoadingVeil();
    }
  };
  void ready.then(done);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
}
