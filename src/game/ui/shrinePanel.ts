/** Moon Shrine Phaser panel size in overlay design pixels (640×640). */
export const SHRINE_PANEL_WIDTH = 480;
export const SHRINE_PANEL_HEIGHT = 420;
export const SHRINE_DESIGN_SIZE = 640;

export type ShrineCraftOverlayRect = {
  left: string;
  top: string;
  width: string;
  height: string;
};

/**
 * CSS % of the square game board for the Craft HUD, inset inside the shrine
 * panel body (below the tab row, inside the gold border).
 */
export function shrineCraftOverlayRect(
  designSize = SHRINE_DESIGN_SIZE,
): ShrineCraftOverlayRect {
  const cy = designSize / 2;
  const insetX = 16;
  const left = (designSize - SHRINE_PANEL_WIDTH) / 2 + insetX;
  const width = SHRINE_PANEL_WIDTH - insetX * 2;
  // Tabs sit at cy - 108; fill down to just above Phaser status (cy + 142).
  const top = cy - 88;
  const bottom = cy + 130;
  const height = Math.max(0, bottom - top);
  const pct = (n: number) => `${((n / designSize) * 100).toFixed(3)}%`;
  return {
    left: pct(left),
    top: pct(top),
    width: pct(width),
    height: pct(height),
  };
}

export function applyShrineCraftOverlayRect(el: HTMLElement): void {
  const rect = shrineCraftOverlayRect();
  el.style.left = rect.left;
  el.style.top = rect.top;
  el.style.width = rect.width;
  el.style.height = rect.height;
}

/**
 * Square box centered in the (rectangular) stage with the same size as the
 * 640 overlay design square, so % rects like the craft HUD's keep lining up
 * with the Phaser panel. Size comes from `--stage-design` (see stageLayout).
 */
export function getOverlayDesignBox(): HTMLElement | null {
  const game = document.getElementById("game");
  if (!game) {
    return null;
  }
  let box = document.getElementById("overlay-design-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "overlay-design-box";
    box.className = "overlay-design-box";
    game.appendChild(box);
  }
  return box;
}
