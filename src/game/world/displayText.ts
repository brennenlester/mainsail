/**
 * Shared filter for player-typed display text (player name, nicknames, share
 * links): the result is safe to draw and never visually blank unless empty.
 *
 * It is a *normalizer for input and for loading*, never a validity check:
 * callers must not compare a stored value to its cleaned form (a save with a
 * slightly different name must still load, #409).
 */

/** Letters that are invisible on their own but are not Default_Ignorable. */
const BLANK_LETTERS = /[⠀ㅤᅟᅠﾠ]/gu;
/** Default_Ignorable code points that carry meaning and are kept: variation selectors, Mongolian FVS, CGJ. */
const MEANINGFUL_IGNORABLE = /^[͏᠋-᠍᠏︀-️\u{E0100}-\u{E01EF}]$/u;
const VARIATION_SELECTOR = /^[︀-️\u{E0100}-\u{E01EF}]$/u;
const TAG_CHAR = /^[\u{E0020}-\u{E007F}]$/u;
const JOINER = /^[‌‍]$/u;
const WAVING_BLACK_FLAG = "\u{1F3F4}";
/** What a ZWNJ / ZWJ may sit between: letters, marks (Indic / Persian) and pictographs. */
const JOINABLE = /^[\p{L}\p{M}\p{Extended_Pictographic}]$/u;

/**
 * Strip control, format (bidi, zero-width), private-use, unassigned,
 * lone-surrogate and default-ignorable characters (Hangul fillers, Braille
 * blank, ...), collapse whitespace (NBSP, tabs), and keep at most two combining
 * marks per base character. ZWNJ / ZWJ survive only between letters, marks or
 * emoji (Persian, Indic scripts, family emoji); variation selectors and
 * subdivision-flag tag sequences survive. Text with nothing readable in it
 * comes back as "".
 */
export function cleanDisplayText(raw: string): string {
  const stripped = raw
    .slice(0, 256)
    .replace(/[\s\p{Zl}\p{Zp}]+/gu, " ")
    .replace(
      /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}⠀]/gu,
      (ch) =>
        JOINER.test(ch) || TAG_CHAR.test(ch) || MEANINGFUL_IGNORABLE.test(ch) ? ch : "",
    )
    .replace(BLANK_LETTERS, "");
  const chars = Array.from(stripped);
  const kept: string[] = [];
  chars.forEach((ch, i) => {
    if (JOINER.test(ch)) {
      // Skip back over variation selectors to the real neighbour.
      let prev = kept.length - 1;
      while (prev >= 0 && VARIATION_SELECTOR.test(kept[prev]!)) {
        prev -= 1;
      }
      const before = kept[prev];
      const after = chars[i + 1];
      if (before && after && JOINABLE.test(before) && JOINABLE.test(after)) {
        kept.push(ch);
      }
      return;
    }
    if (TAG_CHAR.test(ch)) {
      // Tags only extend a black-flag (England / Scotland / Wales) sequence.
      let prev = kept.length - 1;
      while (prev >= 0 && TAG_CHAR.test(kept[prev]!)) {
        prev -= 1;
      }
      if (prev >= 0 && kept[prev] === WAVING_BLACK_FLAG && !(kept[kept.length - 1] === "\u{E007F}")) {
        kept.push(ch);
      }
      return;
    }
    kept.push(ch);
  });
  const cleaned = kept
    .join("")
    // Removing an invisible between two spaces leaves a double space.
    .replace(/ {2,}/g, " ")
    // Zalgo guard: keep at most two combining marks per base character.
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .trim();
  // Marks, selectors, joiners and tags alone draw nothing readable.
  return /[^\p{M}\s‌‍︀-️\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]/u.test(cleaned)
    ? cleaned
    : "";
}

/** Cap by code points (never splits a surrogate pair). */
export function capCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("").trim();
}
