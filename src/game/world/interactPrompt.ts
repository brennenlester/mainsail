export const INTERACT_PROMPT_PRIORITY = [
  "shrine",
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
