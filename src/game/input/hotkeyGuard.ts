/**
 * Movement keys double as card / battle hotkeys (S = Spar / Switch, B, F).
 * A player walking with WASD must not commit to a verb just because a card
 * opened under their fingers (#418): hotkeys stay quiet for a short beat
 * after the card / battle opens, and while any *other* movement key is still
 * held down (a walk that began before the card opened).
 */

export const HOTKEY_ARM_MS = 350;

const MOVEMENT_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const held = new Set<string>();

/** Window-level key tracker (capture phase, so Phaser's own handling cannot hide keys). */
function installTracker(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("keydown", (e) => held.add(e.code), true);
  window.addEventListener("keyup", (e) => held.delete(e.code), true);
  // Keyups are lost while the tab is unfocused.
  window.addEventListener("blur", () => held.clear());
}
installTracker();

/** Pure decision: may a hotkey with this `code` act right now? */
export function hotkeyAllowed(opts: {
  now: number;
  openedAt: number;
  code: string;
  held: Iterable<string>;
}): boolean {
  if (opts.now - opts.openedAt < HOTKEY_ARM_MS) {
    return false;
  }
  for (const k of opts.held) {
    if (k !== opts.code && MOVEMENT_CODES.has(k)) {
      return false;
    }
  }
  return true;
}

/** One per card / battle; created when it opens. */
export class HotkeyGuard {
  private readonly openedAt: number;

  constructor(now: number = performance.now()) {
    this.openedAt = now;
  }

  allows(event: Pick<KeyboardEvent, "code">, now: number = performance.now()): boolean {
    return hotkeyAllowed({ now, openedAt: this.openedAt, code: event.code, held });
  }

  /** True once a fresh key press would be accepted (drives the "ready" pulse). */
  armed(now: number = performance.now()): boolean {
    return hotkeyAllowed({ now, openedAt: this.openedAt, code: "", held });
  }
}
