import Phaser from "phaser";
import { topHudInsetCss } from "./hudInset";

/** Cap DPR so fill-rate stays reasonable on 3× phones. */
export const RENDER_DPR = Math.min(
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  2,
);

/** Logical layout size for overlay scenes (battle / encounter / shrine). */
export const DESIGN_SIZE = 640;

/** Match the Phaser buffer to the CSS stage size × DPR for crisp sprites. */
export function resizeGameForDisplay(
  scene: Phaser.Scene,
  stageCssWidth: number,
  stageCssHeight: number,
): void {
  const width = Math.max(1, Math.round(stageCssWidth * RENDER_DPR));
  const height = Math.max(1, Math.round(stageCssHeight * RENDER_DPR));
  if (
    scene.scale.gameSize.width !== width ||
    scene.scale.gameSize.height !== height
  ) {
    // setGameSize (not resize): FIT must pick up the new aspect ratio.
    scene.scale.setGameSize(width, height);
  }
}

/** CSS px of stage height handed to DOM chrome under the design square. */
export type OverlayReserve = number | (() => number);

/**
 * Frame the 640×640 design space in the HiDPI buffer so overlay layouts
 * (which use 0..640 coords) stay on camera. `reserveBottomCss` keeps that much
 * stage height free under the art for DOM chrome (the title menu): the square
 * shrinks to fit above it and, on tall stages, slides up into the spare room.
 */
export function applyOverlayPixelRatio(
  scene: Phaser.Scene,
  reserveBottomCss: OverlayReserve = 0,
): void {
  const cam = scene.cameras.main;
  const reserve =
    (typeof reserveBottomCss === "function"
      ? reserveBottomCss()
      : reserveBottomCss) * RENDER_DPR;
  const zoom = Math.min(
    scene.scale.width / DESIGN_SIZE,
    Math.max(1, scene.scale.height - reserve) / DESIGN_SIZE,
  );
  cam.setZoom(zoom);
  const spare = Math.max(0, scene.scale.height - DESIGN_SIZE * zoom);
  const shift = Math.min(reserve / 2, spare / 2);
  cam.centerOn(DESIGN_SIZE / 2, DESIGN_SIZE / 2 + shift / zoom);
}

/** Backdrop for the area outside the 640 design square on non-square stages (#391). */
export const OVERLAY_LETTERBOX_COLOR = 0x0f1c2e;

/**
 * Overlay scenes lay out in a 640×640 design square that is centered and
 * zoomed to fit the (now rectangular) stage. Paint the rest navy so the
 * paused world never shows around a battle / shrine / encounter card.
 */
export function addOverlayLetterbox(
  scene: Phaser.Scene,
  alpha = 1,
  style: { depth?: number; color?: number } = {},
): void {
  const reach = 4000;
  const bars: Array<[number, number, number, number]> = [
    [-reach, -reach, reach, reach * 2 + DESIGN_SIZE],
    [DESIGN_SIZE, -reach, reach, reach * 2 + DESIGN_SIZE],
    [0, -reach, DESIGN_SIZE, reach],
    [0, DESIGN_SIZE, DESIGN_SIZE, reach],
  ];
  for (const [x, y, w, h] of bars) {
    scene.add
      .rectangle(x, y, w, h, style.color ?? OVERLAY_LETTERBOX_COLOR, alpha)
      .setOrigin(0)
      .setDepth(style.depth ?? -10_000);
  }
}

/** Keep overlay framing correct when the shared Scale Manager resizes. */
export function bindOverlayPixelRatio(
  scene: Phaser.Scene,
  options: { letterbox?: boolean; reserveBottomCss?: OverlayReserve } = {},
): void {
  applyOverlayPixelRatio(scene, options.reserveBottomCss);
  if (options.letterbox !== false) {
    addOverlayLetterbox(scene, 0.95);
  }
  const onResize = (): void => {
    if (!scene.sys.settings.active && !scene.sys.settings.visible) {
      return;
    }
    applyOverlayPixelRatio(scene, options.reserveBottomCss);
  };
  scene.scale.on("resize", onResize);
  scene.events.once("shutdown", () => {
    scene.scale.off("resize", onResize);
  });
}

type HudAvoid = { topCss: number; touchInteract: { rightCss: number; bottomCss: number } | null };

let hudAvoidCache: { at: number; value: HudAvoid } | null = null;

/**
 * DOM chrome that overlaps the board (#361): the story card (top) and, on
 * touch layouts, the E button. Measured in CSS px relative to the canvas;
 * cached briefly because placement runs every frame.
 */
function measureHudAvoid(scene: Phaser.Scene): HudAvoid {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (hudAvoidCache && now - hudAvoidCache.at < 250) {
    return hudAvoidCache.value;
  }
  const value: HudAvoid = { topCss: 0, touchInteract: null };
  const canvas = scene.game.canvas as HTMLCanvasElement | undefined;
  if (typeof document !== "undefined" && canvas?.getBoundingClientRect) {
    const board = canvas.getBoundingClientRect();
    const quest = document.getElementById("quest-hud")?.getBoundingClientRect();
    if (quest && quest.height > 0 && quest.top < board.top + board.height / 2) {
      value.topCss = Math.max(0, quest.bottom - board.top);
    }
    const controls = document.getElementById("touch-controls");
    const button = document.getElementById("touch-interact")?.getBoundingClientRect();
    if (
      controls &&
      button &&
      button.height > 0 &&
      !controls.classList.contains("touch-controls-disabled") &&
      getComputedStyle(controls).display !== "none"
    ) {
      value.touchInteract = {
        rightCss: Math.max(0, board.right - button.right),
        bottomCss: Math.max(0, board.bottom - button.top),
      };
    }
  }
  hudAvoidCache = { at: now, value };
  return value;
}

/**
 * Place world-scene HUD text in the camera's visible logical space so HiDPI
 * buffer sizing + main-camera zoom does not push scrollFactor(0) UI off-screen.
 *
 * Text wraps to the board width; top texts drop below the story card and, on
 * touch layouts, bottom prompts sit right-aligned above the E button so they
 * never cover the joystick (#361).
 */
export function placeWorldHudText(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  anchor: "top" | "bottom",
  inset: number,
): void {
  if (!text.active) {
    return;
  }
  const cam = scene.cameras.main;
  const halfW = cam.width / (2 * cam.zoom);
  const halfH = cam.height / (2 * cam.zoom);
  // Cancel camera zoom and compensate HiDPI buffer→CSS downscale so inset/font
  // stay at logical CSS sizes (inset is CSS px; fontSize is authored for CSS).
  text.setScrollFactor(1);
  const perCss = RENDER_DPR / cam.zoom;
  text.setScale(perCss);
  const boardCss = cam.width / RENDER_DPR;
  const avoid = measureHudAvoid(scene);
  const touch = anchor === "bottom" ? avoid.touchInteract : null;
  const pad = (text.padding.left ?? 0) + (text.padding.right ?? 0);
  const maxCss = touch ? boardCss / 2 - 16 : boardCss - 24;
  const wrap = Math.max(80, Math.floor(maxCss - pad));
  if (text.style.wordWrapWidth !== wrap) {
    text.setWordWrapWidth(wrap, true);
  }
  if (touch) {
    const right = cam.midPoint.x + halfW - touch.rightCss * perCss;
    const bottom = cam.midPoint.y + halfH - (touch.bottomCss + 8) * perCss;
    text.setPosition(
      right - text.width * (1 - text.originX) * perCss,
      bottom - text.height * (1 - text.originY) * perCss,
    );
    return;
  }
  const topInset = topHudInsetCss(inset, avoid.topCss, text.height * text.originY);
  const insetWorld = ((anchor === "top" ? topInset : inset) * RENDER_DPR) / cam.zoom;
  text.setPosition(
    cam.midPoint.x,
    anchor === "bottom"
      ? cam.midPoint.y + halfH - insetWorld
      : cam.midPoint.y - halfH + insetWorld,
  );
}

export function overlayCenter(): { x: number; y: number } {
  return { x: DESIGN_SIZE / 2, y: DESIGN_SIZE / 2 };
}
