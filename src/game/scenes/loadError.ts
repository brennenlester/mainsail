/** Minimal shape of Phaser's failed `File` (key + resolved url/src). */
export type LoadErrorFile = { key?: string; url?: unknown; src?: string };

/** One-line dev warning for an optional asset that failed to load. */
export function formatLoadError(file: LoadErrorFile | undefined): string {
  const key = file?.key ?? "<unknown key>";
  const url = typeof file?.url === "string" ? file.url : (file?.src ?? "<unknown url>");
  return `[preload] failed to load "${key}" (${url}); procedural fallback will be used`;
}

/**
 * Optional Imagine files may be missing by design, so a failure never stops
 * the game; dev builds still say which one so a typo'd path is not silent.
 */
export function warnOnLoadError(
  file: LoadErrorFile | undefined,
  dev: boolean,
  warn: (message: string) => void = (m) => console.warn(m),
): void {
  if (dev) {
    warn(formatLoadError(file));
  }
}
