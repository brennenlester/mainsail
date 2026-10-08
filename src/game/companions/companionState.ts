/**
 * Mutable companion state (#367): resolved ability sites, gifts, nicknames.
 * Saved through worldSnapshot (`companionSitesClaimed`, party member fields).
 */
import type { CreatureInstance } from "../creatures/types";
import {
  addMaterial,
  consumeMaterial,
  getMaterialCount,
} from "../inventory/playerInventory";
import { getMaterialName } from "../inventory/materials";
import { cleanDisplayText } from "../world/displayText";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { getCompanionSite, isCompanionSiteId } from "./abilities";
import { addBond, BOND_GAIN, type BondTickResult } from "./bond";
import { getFavoriteMaterial } from "./favorites";

const claimedSites = new Set<string>();

export function getClaimedSites(): ReadonlySet<string> {
  return claimedSites;
}

export function getClaimedSiteList(): string[] {
  return [...claimedSites];
}

export function setClaimedSites(ids: readonly string[]): void {
  claimedSites.clear();
  for (const id of ids) {
    if (isCompanionSiteId(id)) {
      claimedSites.add(id);
    }
  }
}

export function isSiteClaimed(id: string): boolean {
  return claimedSites.has(id);
}

/**
 * Resolve a site once: grant its stash and return a toast-ready summary.
 * Returns undefined if already claimed or unknown.
 */
export function claimSite(id: string): string | undefined {
  const site = getCompanionSite(id);
  if (!site || claimedSites.has(id)) {
    return undefined;
  }
  claimedSites.add(id);
  const parts: string[] = [];
  for (const [materialId, amount] of Object.entries(site.reward.materials)) {
    addMaterial(materialId, amount);
    parts.push(`+${amount} ${getMaterialName(materialId)}`);
  }
  notifyWorldChanged();
  return parts.join(", ");
}

// ---- Gifts ---------------------------------------------------------------

/** Favorite materials consumed per gift. */
export const GIFT_COST = 2;
/** Per-creature pause between gifts so bond can't be spammed in one sitting. */
export const GIFT_COOLDOWN_MS = 20_000;

const lastGiftAt = new Map<string, number>();

export type GiftCheck =
  | { ok: true; materialId: string }
  | { ok: false; reason: string; materialId: string };

export function speciesOf(creature: Pick<CreatureInstance, "speciesId" | "definitionId">): string {
  return creature.speciesId ?? creature.definitionId;
}

export function canGift(creature: CreatureInstance, now = Date.now()): GiftCheck {
  const materialId = getFavoriteMaterial(speciesOf(creature));
  const since = now - (lastGiftAt.get(creature.instanceId) ?? -Infinity);
  if (since < GIFT_COOLDOWN_MS) {
    const s = Math.ceil((GIFT_COOLDOWN_MS - since) / 1000);
    return { ok: false, reason: `Still savoring the last one (${s}s).`, materialId };
  }
  if (getMaterialCount(materialId) < GIFT_COST) {
    return {
      ok: false,
      reason: `Needs ${GIFT_COST} ${getMaterialName(materialId)}.`,
      materialId,
    };
  }
  return { ok: true, materialId };
}

export function giftFavorite(
  creature: CreatureInstance,
  now = Date.now(),
): (BondTickResult & { ok: true }) | { ok: false; reason: string } {
  const check = canGift(creature, now);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  consumeMaterial(check.materialId, GIFT_COST);
  lastGiftAt.set(creature.instanceId, now);
  const result = addBond(creature, BOND_GAIN.gift, "gift");
  notifyWorldChanged();
  return { ok: true, ...result };
}

/** Test hook. */
export function resetCompanionStateForTests(): void {
  claimedSites.clear();
  lastGiftAt.clear();
}

// ---- Nicknames -----------------------------------------------------------

export const NICKNAME_MAX_LENGTH = 16;

/** Trim + length cap; empty → undefined (falls back to species name). */
export function normalizeNickname(raw: string): string | undefined {
  const trimmed = cleanDisplayText(raw);
  if (!trimmed || trimmed.length > NICKNAME_MAX_LENGTH) {
    return undefined;
  }
  return trimmed;
}

export function isValidNickname(value: unknown): value is string {
  return typeof value === "string" && normalizeNickname(value) === value;
}

export function setNickname(creature: CreatureInstance, raw: string): boolean {
  const nickname = normalizeNickname(raw);
  if (!nickname) {
    return false;
  }
  creature.nickname = nickname;
  notifyWorldChanged();
  return true;
}
