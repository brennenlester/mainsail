/**
 * Shared playfield sizing (#391). The canvas fills whatever the HUD leaves:
 * portrait / desktop stack the status dock under the stage, phone landscape
 * docks it beside the stage. The stage is rectangular — world and overlay
 * scenes frame themselves inside it.
 */

/** Match CSS `@media (orientation: landscape) and (max-height: 520px)`. */
export const LANDSCAPE_COMPACT_MAX_HEIGHT = 520;

export type PlayfieldLayoutMode = "portrait" | "landscape";

export type ScreenInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const NO_INSETS: ScreenInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function playfieldLayoutMode(
  viewportCssW: number,
  viewportCssH: number,
): PlayfieldLayoutMode {
  if (
    viewportCssW > viewportCssH &&
    viewportCssH <= LANDSCAPE_COMPACT_MAX_HEIGHT
  ) {
    return "landscape";
  }
  return "portrait";
}

/** Viewport minus device safe-area insets: the box the playfield may fill. */
export function usableViewport(
  viewportW: number,
  viewportH: number,
  insets: ScreenInsets = NO_INSETS,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(viewportW - insets.left - insets.right)),
    height: Math.max(1, Math.floor(viewportH - insets.top - insets.bottom)),
  };
}

/**
 * Stage (canvas) CSS size for the game pane.
 * Portrait stacks status under the stage (subtract status height).
 * Landscape places status beside the stage (subtract status width).
 * A hidden status panel (title screen) measures 0 and the stage fills it all.
 */
export function computeStageSize(options: {
  viewportW: number;
  viewportH: number;
  statusHeight: number;
  statusWidth: number;
  mode: PlayfieldLayoutMode;
}): { width: number; height: number } {
  const { viewportW, viewportH, statusHeight, statusWidth, mode } = options;
  if (mode === "landscape") {
    return {
      width: Math.max(1, Math.floor(viewportW - statusWidth)),
      height: Math.max(1, Math.floor(viewportH)),
    };
  }
  return {
    width: Math.max(1, Math.floor(viewportW)),
    height: Math.max(1, Math.floor(viewportH - statusHeight)),
  };
}
