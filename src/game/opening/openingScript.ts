import { getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget, type FolkloreType } from "../creatures/folkloreTypes";
import { getActiveCreatures } from "../creatures/party";
import { getActiveQuestId } from "../story/questProgress";
import type { ZoneId } from "../world/zoneTypes";

/**
 * Opening 90 seconds (#363) as data. Each beat is keyed by quest id + zone so
 * the quest-spine reshape (#369) can remap beats without touching scene code.
 * Scenes only ask two questions: "is the next wild roll scripted?" and "does
 * this creature have an opening personality line?".
 */
export type OpeningEncounterBeat = {
  id: string;
  /** Beat runs only while this quest step is active. */
  questId: string;
  zoneId: ZoneId;
  creatureId: string;
  /** One-line personality hint shown under the encounter title. */
  personality: string;
  /**
   * Teach exactly one matchup: only script this foe when the lead companion
   * hunts its type (so the encounter line and the Hunter tip agree).
   */
  requireLeadHunts?: boolean;
};

export const OPENING_ENCOUNTERS: readonly OpeningEncounterBeat[] = [
  {
    id: "first-meet",
    questId: "first-befriend",
    zoneId: "grove",
    creatureId: "mossling",
    personality: "Hums when it's nervous. It is humming right now.",
  },
  {
    id: "first-spar",
    questId: "first-spar",
    zoneId: "grove",
    creatureId: "peat-sprite",
    personality: "Drifted up from the fen, smoldering and very pleased with itself.",
    requireLeadHunts: true,
  },
];

/** Non-modal arrival line after the name intro (not a dialog box). */
export const OPENING_ARRIVAL_CAPTION = "Something small is humming in the ferns…";

export type OpeningContext = {
  activeQuestId: string | null;
  zoneId: ZoneId;
  leadType?: FolkloreType;
  visitor?: boolean;
};

export function pickOpeningEncounter(
  ctx: OpeningContext,
  beats: readonly OpeningEncounterBeat[] = OPENING_ENCOUNTERS,
): OpeningEncounterBeat | null {
  if (ctx.visitor || !ctx.activeQuestId) {
    return null;
  }
  const beat = beats.find(
    (b) => b.questId === ctx.activeQuestId && b.zoneId === ctx.zoneId,
  );
  if (!beat) {
    return null;
  }
  if (beat.requireLeadHunts) {
    const foeType = getCreatureDefinition(beat.creatureId).folkloreType;
    if (!ctx.leadType || getHunterTarget(ctx.leadType) !== foeType) {
      return null;
    }
  }
  return beat;
}

function leadFolkloreType(): FolkloreType | undefined {
  const lead = getActiveCreatures().find((c) => c.currentHp > 0);
  return lead ? getCreatureDefinition(lead.definitionId).folkloreType : undefined;
}

/** Tiles of walking before a declined (fled / lost) beat is offered again. */
export const OPENING_RETRY_TILES = 10;

/**
 * One-shot per session: a beat is guaranteed on its first eligible roll,
 * then only re-offered after `OPENING_RETRY_TILES` of walking (normal wild
 * rolls run in between), so fleeing never chain-triggers it.
 */
export class OpeningBeatGate {
  private readonly tilesSinceOffer = new Map<string, number>();

  private readonly retryTiles: number;

  constructor(retryTiles = OPENING_RETRY_TILES) {
    this.retryTiles = retryTiles;
  }

  tryOffer(beatId: string, travelledTiles: number): boolean {
    const since = this.tilesSinceOffer.get(beatId);
    if (since === undefined) {
      this.tilesSinceOffer.set(beatId, 0);
      return true;
    }
    const next = since + travelledTiles;
    if (next >= this.retryTiles) {
      this.tilesSinceOffer.set(beatId, 0);
      return true;
    }
    this.tilesSinceOffer.set(beatId, next);
    return false;
  }
}

const sessionGate = new OpeningBeatGate();

/** Live-state wrapper for `IsometricScene`'s wild roll. */
export function scriptedOpeningCreature(
  zoneId: ZoneId,
  visitor: boolean,
  travelledTiles: number,
  gate: OpeningBeatGate = sessionGate,
): string | null {
  const beat = pickOpeningEncounter({
    activeQuestId: getActiveQuestId(),
    zoneId,
    leadType: leadFolkloreType(),
    visitor,
  });
  if (!beat || !gate.tryOffer(beat.id, travelledTiles)) {
    return null;
  }
  return beat.creatureId;
}

/** Personality line for a creature while its opening beat is active. */
export function openingPersonalityLine(
  creatureId: string,
  activeQuestId: string | null = getActiveQuestId(),
  beats: readonly OpeningEncounterBeat[] = OPENING_ENCOUNTERS,
): string | null {
  return (
    beats.find((b) => b.creatureId === creatureId && b.questId === activeQuestId)
      ?.personality ?? null
  );
}
