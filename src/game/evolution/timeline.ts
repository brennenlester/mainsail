/**
 * EvolutionScene beat sheet (#393). Pure so the sequencing is unit-tested:
 * every beat has a duration; `start` offsets are cumulative.
 */
import type { GrowthKind } from "./growthReveal";

export type EvolutionMode = {
  /** "Fast" battle preference: collapse the build-up to a quick beat. */
  fast: boolean;
  /** prefers-reduced-motion: no flicker, shake or scale pop; crossfades. */
  reducedMotion: boolean;
};

export const BEAT_ORDER = [
  "intro",
  "buildUp",
  "flicker",
  "flash",
  "reveal",
  "card",
  "panel",
] as const;

export type BeatId = (typeof BEAT_ORDER)[number];

export type EvolutionBeats = Record<BeatId, { start: number; duration: number }>;

type Durations = Record<BeatId, number>;

const EVOLUTION: Durations = {
  intro: 450,
  buildUp: 2100,
  flicker: 1000,
  flash: 240,
  reveal: 700,
  card: 450,
  panel: 400,
};

/** Presence is cosmetic growth: same shape, lighter and shorter, no swap. */
const PRESENCE: Durations = {
  intro: 350,
  buildUp: 1200,
  flicker: 0,
  flash: 200,
  reveal: 550,
  card: 400,
  panel: 350,
};

const FAST: Durations = {
  intro: 150,
  buildUp: 350,
  flicker: 0,
  flash: 140,
  reveal: 260,
  card: 200,
  panel: 200,
};

export function evolutionDurations(kind: GrowthKind, mode: EvolutionMode): Durations {
  const base = mode.fast ? FAST : kind === "evolution" ? EVOLUTION : PRESENCE;
  if (!mode.reducedMotion) {
    return { ...base };
  }
  // Rapid silhouette flicker is the main motion hazard; fold it into the
  // build-up as a slow crossfade instead.
  return { ...base, buildUp: base.buildUp + Math.round(base.flicker / 2), flicker: 0 };
}

export function evolutionTimeline(kind: GrowthKind, mode: EvolutionMode): EvolutionBeats {
  const d = evolutionDurations(kind, mode);
  let at = 0;
  const beats = {} as EvolutionBeats;
  for (const id of BEAT_ORDER) {
    beats[id] = { start: at, duration: d[id] };
    at += d[id];
  }
  return beats;
}

/** Time the Continue panel is fully in. */
export function timelineEnd(beats: EvolutionBeats): number {
  const last = beats.panel;
  return last.start + last.duration;
}

/**
 * Silhouette swap schedule for the flicker beat: alternating before/after
 * toggles that speed up toward the flash. Returns offsets (ms) from the
 * flicker start; an empty list when the beat is skipped.
 */
export function flickerSchedule(duration: number): number[] {
  if (duration <= 0) {
    return [];
  }
  const times: number[] = [];
  let gap = Math.max(60, duration * 0.22);
  let t = 0;
  while (t + gap <= duration) {
    t += gap;
    times.push(Math.round(t));
    gap = Math.max(45, gap * 0.72);
  }
  // Odd toggle count so the after form is the one showing when the flash hits.
  if (times.length % 2 === 0) {
    times.pop();
  }
  return times;
}

/** Keys ignored right after the result panel appears, so a skip press can't also dismiss it. */
export const RESULT_KEY_DEBOUNCE_MS = 300;

export function acceptsResultKey(doneAt: number, now: number): boolean {
  return now - doneAt >= RESULT_KEY_DEBOUNCE_MS;
}

/** Share nudge only on the first evolution ever, when sharing is possible. */
export function shouldOfferShare(
  reveal: { kind: GrowthKind; firstEvolution: boolean },
  shareAvailable: boolean,
): boolean {
  return shareAvailable && reveal.kind === "evolution" && reveal.firstEvolution;
}
