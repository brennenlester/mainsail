import { getActiveStorySpar } from "../battle/storySpar";
import {
  getActiveCreatures,
  getEffectiveMaxHp,
  hasLivingPartyMembers,
  playerParty,
} from "../creatures/party";
import { getMaterialName } from "../inventory/materials";
import {
  addMaterial,
  getItemCount,
  getMaterialCount,
} from "../inventory/playerInventory";
import { getActiveQuestId } from "../story/questProgress";
import type { QuestId } from "../story/questTypes";
import { notifyWorldChanged } from "./worldSaveSchedule";
import { isVisitorMode } from "./worldSession";
import { worldState } from "./worldState";
import type { ZoneId } from "./zoneTypes";

/**
 * Soft overworld recovery (#390): the Moon Shrine altar is always a free way
 * back to a healthy party, and a fully fainted party never strands the player.
 * Spars stay sharp — story spars keep their own HP rules (storySpar.ts).
 */

/** Where a fainted party wakes: just south of the Moon Shrine altar (5, 5). */
export const SHRINE_WAKE_SPOT: { zoneId: ZoneId; x: number; y: number } = {
  zoneId: "shrine",
  x: 5,
  y: 6,
};

export const SHRINE_HEAL_LINE = "Moonlight rests your party. Everyone is whole.";
export const SHRINE_WAKE_LINE =
  "Your companions wake at the Moon Shrine, rested and whole. Nothing was lost.";
export const IN_PLACE_WAKE_LINE =
  "Your companions stir awake, rested and whole. Nothing was lost.";

function partyNeedsHealing(): boolean {
  return playerParty.creatures.some(
    (creature) => creature.currentHp < getEffectiveMaxHp(creature),
  );
}

function healWholeParty(): void {
  for (const creature of playerParty.creatures) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
}

/** Story 3/4 beats that need a Moss Salve or Ember Charm. */
const STORY_RELIC_QUESTS: readonly QuestId[] = ["shrine-craft", "first-evolution"];
const STORY_RELIC_ITEMS = ["moss-salve", "ember-charm"] as const;

/** Enough for one Moss Salve (Moss Fiber ×2 + Dust) or one Ember Charm (Ember Ash ×2 + Dust). */
export const STORY_RELIC_BUNDLE: readonly { id: string; amount: number }[] = [
  { id: "moss-fiber", amount: 2 },
  { id: "ember-ash", amount: 2 },
  { id: "folklore-dust", amount: 1 },
];

function canCraftStoryRelic(): boolean {
  return (
    getMaterialCount("folklore-dust") >= 1 &&
    (getMaterialCount("moss-fiber") >= 2 || getMaterialCount("ember-ash") >= 2)
  );
}

/**
 * During the craft / evolve beats, top the host up to one evolution relic's
 * materials when they hold neither the relic nor its materials. Once per save
 * (persisted `storyRelicBundleGiven`), so it rescues a stuck player without
 * becoming a material faucet. Returns the gift line, or null.
 */
export function topUpStoryRelicMaterials(): string | null {
  if (worldState.storyRelicBundleGiven) {
    return null;
  }
  const questId = getActiveQuestId();
  if (!questId || !STORY_RELIC_QUESTS.includes(questId)) {
    return null;
  }
  if (STORY_RELIC_ITEMS.some((id) => getItemCount(id) > 0) || canCraftStoryRelic()) {
    return null;
  }
  const given: string[] = [];
  for (const { id, amount } of STORY_RELIC_BUNDLE) {
    const missing = amount - getMaterialCount(id);
    if (missing > 0) {
      addMaterial(id, missing);
      given.push(`${getMaterialName(id)} ×${missing}`);
    }
  }
  if (given.length === 0) {
    return null;
  }
  worldState.storyRelicBundleGiven = true;
  return `Offering: ${given.join(", ")}. Craft Moss Salve or Ember Charm.`;
}

/**
 * Standing at the Moon Shrine altar (not the portable shrine): free full heal
 * plus the Story 4 starter bundle when needed. Host only. Returns the notice
 * for the shrine status line, or null when nothing happened.
 */
export function visitShrineAltar(): string | null {
  // Invite visitors and card sessions run in visitor mode; story spars own their HP.
  if (isVisitorMode() || getActiveStorySpar() !== null) {
    return null;
  }
  const lines: string[] = [];
  if (partyNeedsHealing()) {
    healWholeParty();
    lines.push(SHRINE_HEAL_LINE);
  }
  const gift = topUpStoryRelicMaterials();
  if (gift) {
    lines.push(gift);
  }
  if (lines.length === 0) {
    return null;
  }
  notifyWorldChanged();
  return lines.join(" ");
}

/** Host only: every active companion is down (and none is mid story spar). */
export function isPartyStranded(): boolean {
  return (
    !isVisitorMode() &&
    getActiveCreatures().length > 0 &&
    !hasLivingPartyMembers() &&
    getActiveStorySpar() === null
  );
}

export type FaintWake = {
  message: string;
  /** Where to place the player; null = wake in place (e.g. while sailing). */
  spot: typeof SHRINE_WAKE_SPOT | null;
};

/**
 * Guaranteed recovery: a stranded party is fully healed for free (no
 * materials, no inventory or quest loss) and wakes at the Moon Shrine.
 * While sailing the party wakes in place so the boat state stays valid.
 */
export function wakeStrandedParty(sailing: boolean): FaintWake | null {
  if (!isPartyStranded()) {
    return null;
  }
  healWholeParty();
  notifyWorldChanged();
  return sailing
    ? { message: IN_PLACE_WAKE_LINE, spot: null }
    : { message: SHRINE_WAKE_LINE, spot: SHRINE_WAKE_SPOT };
}
