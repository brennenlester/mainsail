import type { FolkloreType } from "../creatures/folkloreTypes";
import type { BattleCombatant, StatusId } from "../creatures/types";

export type StatusDefinition = {
  id: StatusId;
  label: string;
  /** Short chip text drawn on the battle HUD. */
  tag: string;
  color: string;
  turns: number;
  /** Types that shrug the status off entirely. */
  immuneTypes: readonly FolkloreType[];
  summary: string;
};

/** Burn tick: share of max HP lost at the end of the burned creature's turn. */
export const BURN_TICK_FRACTION = 0.05;
/** Soaked: every incoming hit is amplified; storm hits conduct harder. */
export const SOAKED_DAMAGE_TAKEN = 1.25;
export const SOAKED_STORM_DAMAGE_TAKEN = 1.5;
/** Rooted: the rooted creature's own hits are weakened. */
export const ROOTED_DAMAGE_DEALT = 0.7;
/** Dazed: flat accuracy penalty on the dazed creature's moves. */
export const DAZED_ACCURACY_PENALTY = 25;

export const STATUS_DEFS: Readonly<Record<StatusId, StatusDefinition>> = {
  burn: {
    id: "burn",
    label: "Burn",
    tag: "BURN",
    color: "#ff8a4c",
    turns: 3,
    immuneTypes: ["hearth", "ember", "water", "will-o-wisp"],
    summary: `loses ${Math.round(BURN_TICK_FRACTION * 100)}% max HP each turn`,
  },
  soaked: {
    id: "soaked",
    label: "Soaked",
    tag: "SOAK",
    color: "#6cc4ff",
    turns: 3,
    immuneTypes: ["water", "fen"],
    summary: "takes ×1.25 damage (storm ×1.5); douses Burn",
  },
  rooted: {
    id: "rooted",
    label: "Rooted",
    tag: "ROOT",
    color: "#8fd36a",
    turns: 2,
    immuneTypes: ["storm", "mist"],
    summary: "deals ×0.7 damage",
  },
  dazed: {
    id: "dazed",
    label: "Dazed",
    tag: "DAZE",
    color: "#d9a8ff",
    turns: 2,
    immuneTypes: ["twilight"],
    summary: `accuracy −${DAZED_ACCURACY_PENALTY}`,
  },
};

export function hasStatus(combatant: BattleCombatant, id: StatusId): boolean {
  return (combatant.statuses ?? []).some((s) => s.id === id && s.turns > 0);
}

export function hasAnyStatus(combatant: BattleCombatant): boolean {
  return (combatant.statuses ?? []).some((s) => s.turns > 0);
}

export type StatusApplyResult =
  | { kind: "applied"; id: StatusId }
  | { kind: "refreshed"; id: StatusId }
  | { kind: "immune"; id: StatusId }
  | { kind: "doused"; id: StatusId };

/** Whether `id` would stick to `target` (type immunity + Soaked blocks Burn). */
export function canApplyStatus(target: BattleCombatant, id: StatusId): boolean {
  if (STATUS_DEFS[id].immuneTypes.includes(target.folkloreType)) {
    return false;
  }
  return !(id === "burn" && hasStatus(target, "soaked"));
}

export function applyStatus(
  target: BattleCombatant,
  id: StatusId,
): StatusApplyResult {
  if (STATUS_DEFS[id].immuneTypes.includes(target.folkloreType)) {
    return { kind: "immune", id };
  }
  if (id === "burn" && hasStatus(target, "soaked")) {
    return { kind: "doused", id };
  }
  const statuses = (target.statuses ?? []).filter((s) => s.turns > 0);
  const turns = STATUS_DEFS[id].turns;
  const existing = statuses.find((s) => s.id === id);
  if (existing) {
    existing.turns = turns;
    target.statuses = statuses;
    return { kind: "refreshed", id };
  }
  // Soaking a burning creature puts the fire out.
  const remaining =
    id === "soaked" ? statuses.filter((s) => s.id !== "burn") : statuses;
  target.statuses = [...remaining, { id, turns }];
  return { kind: "applied", id };
}

export type StatusTick = {
  burnDamage: number;
  expired: StatusId[];
};

/**
 * End of the afflicted creature's own turn: Burn deals damage, then every
 * status loses one turn and expired ones drop off.
 */
export function tickStatuses(combatant: BattleCombatant): StatusTick {
  const statuses = combatant.statuses ?? [];
  let burnDamage = 0;
  if (hasStatus(combatant, "burn") && combatant.currentHp > 0) {
    burnDamage = Math.max(1, Math.round(combatant.maxHp * BURN_TICK_FRACTION));
    combatant.currentHp = Math.max(0, combatant.currentHp - burnDamage);
  }
  const expired: StatusId[] = [];
  const next = [];
  for (const status of statuses) {
    const turns = status.turns - 1;
    if (turns > 0) {
      next.push({ id: status.id, turns });
    } else {
      expired.push(status.id);
    }
  }
  combatant.statuses = next;
  return { burnDamage, expired };
}

/** HUD chip text, e.g. "BURN 2". */
export function formatStatusChip(id: StatusId, turns: number): string {
  return `${STATUS_DEFS[id].tag} ${turns}`;
}
