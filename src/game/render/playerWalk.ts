/** Full left–right gait cycles per tile traveled (~matches prior ~10fps cadence). */
export const WALK_CYCLES_PER_TILE = 0.85;

/** Vertical lift (px up) at mid-pass between contact poses. */
export const WALK_BOB_AMPLITUDE = 2;

/** Walk texture indices 1..N per facing (0 is always idle). Blender sheets, #360. */
export const WALK_FRAME_COUNT: Record<
  "south" | "north" | "east" | "west",
  number
> = {
  east: 6,
  west: 6,
  south: 6,
  north: 6,
};

/** Rendered idle breath frames `player-{facing}__idle_NN` (#360). */
export const IDLE_FRAME_COUNT = 4;
/** Idle breath cadence (frames per second). */
export const IDLE_FPS = 4;

/** Idle breath frame index for a clock time in ms. */
export function idleBreathFrame(timeMs: number, count = IDLE_FRAME_COUNT): number {
  const n = Math.max(1, Math.floor(count));
  return Math.floor(Math.max(0, timeMs) / (1000 / IDLE_FPS)) % n;
}

function wrap01(phase: number): number {
  const wrapped = phase % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/**
 * Distance-driven walk texture index (1..walkFrameCount).
 * Evenly samples the walk sheet across one gait cycle.
 */
export function walkStrideFrame(
  phase: number,
  walkFrameCount = 2,
): number {
  const n = Math.max(1, Math.floor(walkFrameCount));
  return 1 + Math.min(n - 1, Math.floor(wrap01(phase) * n));
}

/**
 * Smooth bob from gait phase: low at contacts (0 / 0.5), peak mid-pass.
 * Negative Y is up in Phaser.
 */
export function walkBobOffset(
  phase: number,
  amplitude = WALK_BOB_AMPLITUDE,
): number {
  const t = wrap01(phase);
  return -amplitude * Math.sin(t * Math.PI * 2) ** 2;
}

/** True when `phase` crossed one or more footfalls since `prevPhase`. */
export function walkFootfallsSince(prevPhase: number, phase: number): number {
  const prev = Math.floor(prevPhase * 2);
  const next = Math.floor(phase * 2);
  return Math.max(0, next - prev);
}
