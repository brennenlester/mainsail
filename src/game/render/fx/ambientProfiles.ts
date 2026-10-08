import type { ZoneId } from "../../world/zoneTypes";

/**
 * Per-zone ambient particle layers (#362). Pure data + budget math; the
 * Phaser emitter wiring lives in `overworldFx.ts`.
 */

export type AmbientKind =
  | "fireflies"
  | "leaves"
  | "petals"
  | "pollen"
  | "mist"
  | "embers"
  | "glints"
  | "spores"
  | "spirits"
  | "motes";

/** When a layer shows: always, mostly by day, or only after dusk. */
export type AmbientTime = "any" | "day" | "night";

export type AmbientLayer = {
  kind: AmbientKind;
  /** Target live particles on screen at high quality, full strength. */
  alive: number;
  time: AmbientTime;
};

export type FxQuality = "high" | "low" | "off";

const LAYERS: Record<ZoneId, AmbientLayer[]> = {
  grove: [
    { kind: "leaves", alive: 9, time: "any" },
    { kind: "pollen", alive: 16, time: "day" },
    { kind: "fireflies", alive: 26, time: "night" },
  ],
  shrine: [
    { kind: "spirits", alive: 16, time: "any" },
    { kind: "fireflies", alive: 14, time: "night" },
  ],
  village: [
    { kind: "petals", alive: 10, time: "any" },
    { kind: "pollen", alive: 10, time: "day" },
    { kind: "fireflies", alive: 14, time: "night" },
  ],
  overworld: [
    { kind: "leaves", alive: 10, time: "any" },
    { kind: "pollen", alive: 12, time: "day" },
    { kind: "fireflies", alive: 18, time: "night" },
  ],
  harbor: [
    { kind: "glints", alive: 16, time: "any" },
    { kind: "mist", alive: 4, time: "any" },
  ],
  archipelago: [
    { kind: "glints", alive: 22, time: "any" },
    { kind: "mist", alive: 3, time: "any" },
  ],
  mistwood: [
    { kind: "mist", alive: 8, time: "any" },
    { kind: "spores", alive: 20, time: "any" },
    { kind: "fireflies", alive: 18, time: "night" },
  ],
  emberfen: [
    { kind: "embers", alive: 24, time: "any" },
    { kind: "mist", alive: 4, time: "any" },
  ],
  "warden-cottage": [{ kind: "motes", alive: 12, time: "any" }],
  "weaver-cottage": [{ kind: "motes", alive: 12, time: "any" }],
  "hearthkeep-cottage": [{ kind: "motes", alive: 12, time: "any" }],
  "hermit-cottage": [{ kind: "motes", alive: 12, time: "any" }],
};

/** Low quality keeps a hint of life without the fill cost. */
export const LOW_QUALITY_SCALE = 0.35;

export function ambientLayersFor(zoneId: ZoneId): readonly AmbientLayer[] {
  return LAYERS[zoneId] ?? [];
}

/** How strongly a layer shows at this nightness (0 day … 1 night). */
export function timeWeight(time: AmbientTime, nightness: number): number {
  const n = Math.min(1, Math.max(0, nightness));
  switch (time) {
    case "any":
      return 1;
    case "day":
      return 1 - 0.85 * n;
    case "night":
      // Ease in after dusk so fireflies don't pop in at noon.
      return n <= 0.15 ? 0 : Math.min(1, (n - 0.15) / 0.6);
  }
}

/** Target live particle count for one layer under the current conditions. */
export function targetAlive(
  layer: AmbientLayer,
  quality: FxQuality,
  nightness: number,
  reducedMotion: boolean,
): number {
  if (quality === "off") {
    return 0;
  }
  const qualityScale = quality === "low" ? LOW_QUALITY_SCALE : 1;
  // Reduced motion: keep only gentle, near-static glows (fireflies/glints).
  const motionScale =
    reducedMotion && !["fireflies", "glints", "motes"].includes(layer.kind)
      ? 0
      : reducedMotion
        ? 0.5
        : 1;
  return Math.round(
    layer.alive * qualityScale * motionScale * timeWeight(layer.time, nightness),
  );
}

/**
 * Emission interval (ms) that keeps `alive` particles on screen for a given
 * mean lifespan. Returns -1 (Phaser's "don't flow") when nothing should spawn.
 */
export function emitIntervalMs(alive: number, meanLifespanMs: number): number {
  if (alive <= 0) {
    return -1;
  }
  return Math.max(16, Math.round(meanLifespanMs / alive));
}
