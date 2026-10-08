import {
  computeStageSize,
  playfieldLayoutMode,
  usableViewport,
  type PlayfieldLayoutMode,
  type ScreenInsets,
} from "./playfieldLayout";
import { measureStatusPanelHeight, measureStatusPanelWidth } from "./statusPanel";

export type StageLayout = {
  /** Canvas CSS size. */
  width: number;
  height: number;
  mode: PlayfieldLayoutMode;
};

/** Safe-area insets arrive through the playfield's padding (see style.css). */
function readInsets(playfield: HTMLElement): ScreenInsets {
  const style = getComputedStyle(playfield);
  const px = (value: string): number => Number.parseFloat(value) || 0;
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

/**
 * Fill the viewport (#391): size #playfield to the visual viewport, let the
 * status dock take what it needs, and give the rest to the canvas. Returns
 * the stage CSS size; callers resize the Phaser buffer to match.
 */
export function layoutStage(): StageLayout {
  const viewportW = window.visualViewport?.width ?? window.innerWidth;
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  const playfield = document.getElementById("playfield");
  const gameEl = document.getElementById("game");
  const mode = playfieldLayoutMode(viewportW, viewportH);
  if (!playfield || !gameEl) {
    return { width: Math.floor(viewportW), height: Math.floor(viewportH), mode };
  }

  playfield.style.width = `${Math.floor(viewportW)}px`;
  playfield.style.height = `${Math.floor(viewportH)}px`;
  const usable = usableViewport(viewportW, viewportH, readInsets(playfield));

  // Landscape's panel width settles after the stage width does; a few passes
  // converge (portrait only needs one).
  let statusHeight = 0;
  let statusWidth = mode === "landscape" ? Math.min(320, usable.width * 0.42) : 0;
  let stage = computeStageSize({
    viewportW: usable.width,
    viewportH: usable.height,
    statusHeight,
    statusWidth,
    mode,
  });
  for (let pass = 0; pass < 3; pass += 1) {
    gameEl.style.width = `${stage.width}px`;
    gameEl.style.height = `${stage.height}px`;
    statusHeight = measureStatusPanelHeight();
    statusWidth = measureStatusPanelWidth();
    const next = computeStageSize({
      viewportW: usable.width,
      viewportH: usable.height,
      statusHeight: mode === "portrait" ? statusHeight : 0,
      statusWidth: mode === "landscape" ? statusWidth : 0,
      mode,
    });
    if (next.width === stage.width && next.height === stage.height) {
      break;
    }
    stage = next;
  }
  gameEl.style.width = `${stage.width}px`;
  gameEl.style.height = `${stage.height}px`;
  // Overlay scenes frame a square design box in the middle of the stage.
  gameEl.style.setProperty(
    "--stage-design",
    `${Math.min(stage.width, stage.height)}px`,
  );
  return { ...stage, mode };
}
