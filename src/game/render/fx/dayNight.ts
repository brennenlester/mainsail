/**
 * Soft overworld day/night curve (#362). Phase 0 = midnight, 0.25 = dawn,
 * 0.5 = noon, 0.75 = dusk. Pure so the curve is unit-tested; the scene turns
 * the sample into a camera color matrix.
 */

export type DayNightLabel = "dawn" | "morning" | "afternoon" | "dusk" | "night";

export type DayNightSample = {
  /** Per-channel multipliers applied to the rendered world. */
  r: number;
  g: number;
  b: number;
  /** 1 = untouched, <1 = washed toward grey. */
  saturation: number;
  /** 0 = full day, 1 = deep night. Drives fireflies, glows, vignette. */
  nightness: number;
  label: DayNightLabel;
};

type Key = {
  at: number;
  r: number;
  g: number;
  b: number;
  saturation: number;
  nightness: number;
};

// Night stays a soft moonlit blue, never murky: see MIN_LUMINANCE.
const KEYS: readonly Key[] = [
  { at: 0.0, r: 0.66, g: 0.7, b: 0.92, saturation: 0.78, nightness: 1 },
  { at: 0.2, r: 0.66, g: 0.7, b: 0.92, saturation: 0.8, nightness: 0.85 },
  { at: 0.28, r: 1.0, g: 0.87, b: 0.86, saturation: 0.95, nightness: 0.25 },
  { at: 0.36, r: 1.0, g: 0.99, b: 0.96, saturation: 1.0, nightness: 0 },
  { at: 0.62, r: 1.0, g: 0.98, b: 0.94, saturation: 1.02, nightness: 0 },
  { at: 0.71, r: 1.06, g: 0.9, b: 0.72, saturation: 1.12, nightness: 0.2 },
  { at: 0.79, r: 0.8, g: 0.72, b: 0.86, saturation: 0.86, nightness: 0.65 },
  { at: 0.87, r: 0.66, g: 0.7, b: 0.92, saturation: 0.78, nightness: 1 },
  { at: 1.0, r: 0.66, g: 0.7, b: 0.92, saturation: 0.78, nightness: 1 },
];

/** Rec. 601 luma weights; also used for the saturation matrix. */
const LUMA = { r: 0.299, g: 0.587, b: 0.114 } as const;

/** Readability floor: the darkest sample keeps ≥ this share of white. */
export const MIN_LUMINANCE = 0.6;

/** 16-minute loop — long enough to feel like time, short enough to see. */
export const DAY_CYCLE_MS = 16 * 60 * 1000;

/** Sessions start late morning so the first impression is bright. */
export const SESSION_START_PHASE = 0.42;

/** Interiors ignore the sky: steady warm lamplight with the hearth on. */
export const INTERIOR_LIGHT: DayNightSample = {
  r: 1.0,
  g: 0.93,
  b: 0.84,
  saturation: 0.96,
  nightness: 0.55,
  label: "afternoon",
};

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function dayNightPhase(
  elapsedMs: number,
  cycleMs = DAY_CYCLE_MS,
  startPhase = SESSION_START_PHASE,
): number {
  return wrap01(startPhase + elapsedMs / cycleMs);
}

export function labelForPhase(phase: number): DayNightLabel {
  const p = wrap01(phase);
  if (p >= 0.22 && p < 0.33) return "dawn";
  if (p >= 0.33 && p < 0.5) return "morning";
  if (p >= 0.5 && p < 0.69) return "afternoon";
  if (p >= 0.69 && p < 0.82) return "dusk";
  return "night";
}

export function sampleDayNight(phase: number): DayNightSample {
  const p = wrap01(phase);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.at <= p) {
    i += 1;
  }
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = smooth((p - a.at) / (b.at - a.at));
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    r: mix(a.r, b.r),
    g: mix(a.g, b.g),
    b: mix(a.b, b.b),
    saturation: mix(a.saturation, b.saturation),
    nightness: mix(a.nightness, b.nightness),
    label: labelForPhase(p),
  };
}

export function sampleLuminance(sample: DayNightSample): number {
  return LUMA.r * sample.r + LUMA.g * sample.g + LUMA.b * sample.b;
}

/**
 * 5×4 color matrix (Phaser `ColorMatrix.set`) = channel tint × saturation.
 * Offsets stay 0 so whites never lift into haze.
 */
export function colorMatrixFor(sample: DayNightSample): number[] {
  const s = sample.saturation;
  const sr = (1 - s) * LUMA.r;
  const sg = (1 - s) * LUMA.g;
  const sb = (1 - s) * LUMA.b;
  const row = (k: number, own: "r" | "g" | "b") => [
    (sr + (own === "r" ? s : 0)) * k,
    (sg + (own === "g" ? s : 0)) * k,
    (sb + (own === "b" ? s : 0)) * k,
    0,
    0,
  ];
  return [
    ...row(sample.r, "r"),
    ...row(sample.g, "g"),
    ...row(sample.b, "b"),
    0,
    0,
    0,
    1,
    0,
  ];
}
