export const INTERACT_PROMPT_PRIORITY = [
  "shrine",
  // Eclipse Gate (#420): a post-game sigil in the Moon Shrine yard.
  "eclipse",
  "door",
  "gate",
  "minigame",
  "npc",
  "dock",
  "sailing",
  "companion",
  "gather",
] as const;

export type InteractPromptKind = (typeof INTERACT_PROMPT_PRIORITY)[number];

export type InteractPromptCandidates = Partial<
  Record<InteractPromptKind, string>
>;

export function pickInteractPrompt(
  candidates: InteractPromptCandidates,
): { kind: InteractPromptKind; label: string } | undefined {
  for (const kind of INTERACT_PROMPT_PRIORITY) {
    const label = candidates[kind];
    if (label) {
      return { kind, label };
    }
  }
  return undefined;
}

/** Touch layouts have no keyboard: "Press E — X" becomes "Tap E — X" (#401). */
export function adaptInteractLabel(label: string, touch: boolean): string {
  return touch ? label.replace(/^Press E\b/, "Tap E") : label;
}

export type OverlayAction = "idle" | "create" | "update" | "destroy";

export function overlayAction(
  hasOverlay: boolean,
  nextLabel: string | undefined,
): OverlayAction {
  if (nextLabel === undefined) {
    return hasOverlay ? "destroy" : "idle";
  }
  return hasOverlay ? "update" : "create";
}
