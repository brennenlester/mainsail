/**
 * Where a cold boot lands (#363 / #350): the title screen, or straight into
 * play. Pure decision + a tiny module-level handoff from `main.ts` to
 * `PreloadScene` / `TitleScene` (no Phaser registry plumbing needed).
 */

export type BootRoute = "title" | "play";

export type BootRouteInput = {
  /** A valid `?join=` snapshot was applied (visitor session). */
  visitor: boolean;
  /** `?new=1` reset the host save: cold host goes straight to the name intro. */
  newGame: boolean;
  /** Dev-only `?encounter=` / `?spar=` previews must keep bypassing the title. */
  devPreview: boolean;
};

export function resolveBootRoute(input: BootRouteInput): BootRoute {
  if (input.visitor || input.newGame || input.devPreview) {
    return "play";
  }
  return "title";
}

/** Dev preview params (`?encounter=` / `?spar=`) read by `main.ts`. */
export function hasDevPreviewParam(params: URLSearchParams): boolean {
  return params.has("encounter") || params.has("spar");
}

export type BootContext = {
  route: BootRoute;
  /** A host save was restored at boot — Title shows Continue. */
  hasSave: boolean;
};

let context: BootContext = { route: "play", hasSave: false };

export function setBootContext(next: BootContext): void {
  context = { ...next };
}

export function getBootContext(): BootContext {
  return context;
}
