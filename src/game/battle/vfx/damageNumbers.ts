/**
 * Damage-number styling (#365). Pure: maps a hit outcome to the text,
 * colour, size and an optional callout ("Effective!", "Resisted").
 */

import type { MatchupResult } from "../../creatures/folkloreTypes";

export type DamageNumberKind =
  | "hit"
  | "miss"
  | "immune"
  | "heal"
  | "burn";

export type DamageNumberInput = {
  kind: DamageNumberKind;
  amount: number;
  matchup?: MatchupResult;
  /** Heavy hit (>= STRONG_HIT_DAMAGE) or a finisher: the "crit" beat. */
  strong?: boolean;
  finisher?: boolean;
  /** Which side took it — outgoing hits are coral, incoming amber. */
  target: "wild" | "player";
};

export type DamageNumberStyle = {
  text: string;
  color: string;
  stroke: string;
  fontSize: number;
  /** Pop scale at spawn (1 = none). */
  pop: number;
  /** Pixels risen over the float's life. */
  rise: number;
  /** Short line drawn under the number. */
  callout?: { text: string; color: string };
  /** Flash the whole arena (super-effective / finisher crit). */
  screenFlash?: number;
};

const OUTGOING = "#ff8866";
const INCOMING = "#ffaa44";

export function damageNumberStyle(input: DamageNumberInput): DamageNumberStyle {
  const base: DamageNumberStyle = {
    text: "",
    color: input.target === "wild" ? OUTGOING : INCOMING,
    stroke: "#1a1a2e",
    fontSize: 22,
    pop: 1.15,
    rise: 36,
  };
  switch (input.kind) {
    case "miss":
      return { ...base, text: "miss", color: "#d8dde4", fontSize: 18, pop: 1, rise: 22 };
    case "immune":
      return {
        ...base,
        text: "−0",
        color: "#a8b0b8",
        fontSize: 18,
        pop: 1,
        rise: 24,
        callout: { text: "No effect", color: "#c8ccd0" },
      };
    case "heal":
      return { ...base, text: `+${input.amount}`, color: "#8fe88a", pop: 1.1, rise: 30 };
    case "burn":
      return { ...base, text: `−${input.amount}`, color: "#ff8a4c", fontSize: 18, pop: 1, rise: 26 };
    case "hit":
      break;
  }

  const style: DamageNumberStyle = { ...base, text: `−${input.amount}` };
  if (input.strong || input.finisher) {
    style.fontSize = 30;
    style.pop = 1.45;
    style.rise = 44;
    style.stroke = "#3a0e08";
  }
  if (input.matchup === "hunter") {
    style.color = "#ffe45a";
    style.stroke = "#5a1800";
    style.fontSize = Math.max(style.fontSize, 30);
    style.pop = Math.max(style.pop, 1.5);
    style.callout = { text: "Effective!", color: "#ffe45a" };
    style.screenFlash = 0.35;
  } else if (input.matchup === "resisted") {
    style.color = "#b8b0a0";
    style.fontSize = Math.min(style.fontSize, 18);
    style.pop = 1;
    style.rise = 24;
    style.callout = { text: "Resisted", color: "#c8c0b0" };
  }
  if (input.finisher && input.matchup !== "resisted") {
    style.callout ??= { text: "Finisher!", color: "#ff9a7a" };
    style.screenFlash = Math.max(style.screenFlash ?? 0, 0.25);
  }
  return style;
}
