import type Phaser from "phaser";
import { distanceOutside, vignettePixel } from "./edgeVignetteMath";

/**
 * Soft navy vignette around a zone's tiles, plus an optional "halo" that fades
 * the tile-sea tone out over the (darker) deep-water backdrop so the tile
 * edge is not a hard line (#417). Baked once into a small canvas texture
 * (1/SHRINK size, scaled up with linear filtering) instead of stroked rings.
 */
export const EDGE_VIGNETTE_KEY = "zone-edge-vignette";
const SHRINK = 8;
/**
 * Draw the vignette image for `edge` (the tile rect) out to `pad` world px.
 * Replaces any previous vignette texture; the caller removes it on zone unload.
 */
export function drawEdgeVignette(
  scene: Phaser.Scene,
  edge: { minX: number; minY: number; maxX: number; maxY: number },
  pad: number,
  haloRgb?: readonly [number, number, number],
): Phaser.GameObjects.Image {
  removeEdgeVignetteTexture(scene);
  const x0 = edge.minX - pad;
  const y0 = edge.minY - pad;
  const w = Math.ceil((edge.maxX - edge.minX + pad * 2) / SHRINK);
  const h = Math.ceil((edge.maxY - edge.minY + pad * 2) / SHRINK);
  const tex = scene.textures.createCanvas(EDGE_VIGNETTE_KEY, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const d = distanceOutside(x0 + (px + 0.5) * SHRINK, y0 + (py + 0.5) * SHRINK, edge);
      const [r, g, b, a] = vignettePixel(d, haloRgb);
      const i = (py * w + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return scene.add.image(x0, y0, EDGE_VIGNETTE_KEY).setOrigin(0, 0).setScale(SHRINK).setDepth(-999);
}

export function removeEdgeVignetteTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(EDGE_VIGNETTE_KEY)) {
    scene.textures.remove(EDGE_VIGNETTE_KEY);
  }
}
