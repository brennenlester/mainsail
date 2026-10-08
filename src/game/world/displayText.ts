/**
 * Shared filter for player-typed display text (player name, nicknames, share
 * links): the result is safe to draw and never visually blank unless empty.
 */

/** Braille blank and similar "invisible" letters that are not Default_Ignorable. */
const EXTRA_INVISIBLE = new Set(["⠀", "ㅤ", "ᅟ", "ᅠ", "ﾠ"]);
const ZWJ = "‍";
const VARIATION_SELECTORS = new Set(["︎", "️"]);
const PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;

/**
 * Strip control, format (bidi / zero-width), private-use, unassigned,
 * lone-surrogate and default-ignorable characters (Hangul fillers, Braille
 * blank, ...), collapse whitespace, keep at most two combining marks per
 * base character, and keep ZWJ only between emoji (family / flag sequences).
 * Text that is only marks / invisibles comes back as "".
 */
export function cleanDisplayText(raw: string): string {
  const stripped = raw
    .slice(0, 256)
    .replace(/[\s\p{Zl}\p{Zp}]+/gu, " ")
    .replace(
      /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}⠀]/gu,
      (ch) => (ch === ZWJ || VARIATION_SELECTORS.has(ch) ? ch : ""),
    );
  const chars = Array.from(stripped).filter((ch) => !EXTRA_INVISIBLE.has(ch));
  const kept: string[] = [];
  chars.forEach((ch, i) => {
    if (ch !== ZWJ) {
      kept.push(ch);
      return;
    }
    // Only a joiner between two pictographs survives (a variation selector may sit before it).
    let prev = i - 1;
    while (prev >= 0 && VARIATION_SELECTORS.has(chars[prev]!)) {
      prev -= 1;
    }
    const before = chars[prev];
    const after = chars[i + 1];
    if (before && after && PICTOGRAPHIC.test(before) && PICTOGRAPHIC.test(after)) {
      kept.push(ch);
    }
  });
  const cleaned = kept
    .join("")
    // Zalgo guard: keep at most two combining marks per base character.
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .trim();
  // Marks / variation selectors / joiners alone draw nothing readable.
  return /[^\p{M}\s︎️‍]/u.test(cleaned) ? cleaned : "";
}

/** Cap by code points (never splits a surrogate pair). */
export function capCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("").trim();
}
