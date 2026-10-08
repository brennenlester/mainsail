/**
 * Hatch cutscene beat sheet (#401), in the EvolutionScene style: pure so
 * the sequencing is unit-tested. `start` offsets are cumulative.
 */
export const HATCH_BEAT_ORDER = [
  "dim",
  "light",
  "wobble",
  "crack",
  "flash",
  "pop",
  "card",
  "wren",
] as const;

export type HatchBeatId = (typeof HATCH_BEAT_ORDER)[number];

export type HatchBeats = Record<HatchBeatId, { start: number; duration: number }>;

export type HatchMode = {
  /** "Fast" battle preference: the same beats, compressed. */
  fast: boolean;
  /** prefers-reduced-motion: no wobble, shake or spring; glows and fades. */
  reducedMotion: boolean;
};

type Durations = Record<HatchBeatId, number>;

const NORMAL: Durations = {
  dim: 600,
  light: 1500,
  wobble: 1500,
  crack: 800,
  flash: 240,
  pop: 750,
  card: 600,
  wren: 500,
};

const FAST: Durations = {
  dim: 200,
  light: 400,
  wobble: 450,
  crack: 250,
  flash: 140,
  pop: 300,
  card: 250,
  wren: 250,
};

export function hatchDurations(mode: HatchMode): Durations {
  const base = mode.fast ? FAST : NORMAL;
  if (!mode.reducedMotion) {
    return { ...base };
  }
  // No rocking egg: its time folds into a slower glow build-up.
  return { ...base, light: base.light + Math.round(base.wobble / 2), wobble: Math.round(base.wobble / 2) };
}

export function hatchTimeline(mode: HatchMode): HatchBeats {
  const d = hatchDurations(mode);
  let at = 0;
  const beats = {} as HatchBeats;
  for (const id of HATCH_BEAT_ORDER) {
    beats[id] = { start: at, duration: d[id] };
    at += d[id];
  }
  return beats;
}

/** Total ms until the cutscene waits for Continue. */
export function hatchLength(beats: HatchBeats): number {
  const last = beats[HATCH_BEAT_ORDER[HATCH_BEAT_ORDER.length - 1]!];
  return last.start + last.duration;
}

/** Wobble amplitude (degrees) at progress 0..1: the egg rocks harder as it nears hatching. */
export function wobbleAngle(progress: number, maxDeg = 14): number {
  const p = Math.max(0, Math.min(1, progress));
  const amp = 2 + (maxDeg - 2) * p * p;
  return Math.sin(p * Math.PI * 2 * (3 + 5 * p)) * amp;
}
