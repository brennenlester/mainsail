import { isFusionDisclosed } from "./shrineDisclosure";

export type ShrineTab = "craft" | "fusion" | "use";
export type ShrineMode = "altar" | "portable";

export type ShrineTabSpec = { id: ShrineTab; label: string };

/** Tabs the panel shows. Fusion is altar-only and appears once disclosed. */
export function shrineTabs(
  mode: ShrineMode,
  fusionDisclosed: boolean,
): ShrineTabSpec[] {
  const tabs: ShrineTabSpec[] = [
    { id: "craft", label: "Craft" },
    { id: "use", label: "Use" },
  ];
  if (mode === "altar" && fusionDisclosed) {
    tabs.push({ id: "fusion", label: "Fusion" });
  }
  return tabs;
}

/** Live tab list: reads (and, as before, latches) Fusion disclosure. */
export function currentShrineTabs(mode: ShrineMode): ShrineTabSpec[] {
  return shrineTabs(mode, isFusionDisclosed());
}

/** Tabs present in `next` but not `prev`: the ones to focus / pulse. */
export function newlyRevealedTabs(
  prev: readonly ShrineTab[],
  next: readonly ShrineTab[],
): ShrineTab[] {
  return next.filter((id) => !prev.includes(id));
}

/** Initial tab for a requested one; Fusion only when it is actually available. */
export function resolveInitialTab(
  requested: ShrineTab | undefined,
  tabs: readonly ShrineTabSpec[],
): ShrineTab {
  return requested && tabs.some((t) => t.id === requested) ? requested : "craft";
}
