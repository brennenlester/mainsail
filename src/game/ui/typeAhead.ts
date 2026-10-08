/**
 * Name keys typed between New Game and the name form (#410), replayed into
 * the form once it has focus. Pure so it can be tested without Phaser.
 */
export type TypeAheadStep = {
  /** Next buffer; null stops buffering (nothing will be prefilled). */
  buffer: string | null;
  /** The key was taken into the buffer (caller should preventDefault). */
  consumed: boolean;
};

/** Composition (IME) or dead-key events: their `key` is not the typed text. */
export function isComposingKey(event: Pick<KeyboardEvent, "key" | "isComposing">): boolean {
  return (
    event.isComposing ||
    event.key === "Process" ||
    event.key === "Dead" ||
    event.key === "Unidentified"
  );
}

export function stepTypeAhead(
  buffer: string,
  event: Pick<KeyboardEvent, "key" | "isComposing">,
): TypeAheadStep {
  if (isComposingKey(event)) {
    // Can't be replayed: stop buffering rather than prefill half a word.
    return { buffer: null, consumed: false };
  }
  if (event.key === "Backspace") {
    return { buffer: buffer.slice(0, -1), consumed: true };
  }
  if (event.key.length === 1 && !(event.key === " " && buffer === "")) {
    return { buffer: buffer + event.key, consumed: true };
  }
  return { buffer, consumed: false };
}
