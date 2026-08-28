import type { ZoneId } from "./zoneTypes";

export type NpcGift =
  | { kind: "material"; id: string; amount: number }
  | { kind: "item"; id: string; amount: number };

export type NpcDefinition = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Unique anime sprite; procedural `npc-villager` is the missing-file fallback. */
  spriteKey: string;
  /** Robe tint for the shared fallback villager sprite. */
  tint: number;
  /** Shown the first time you speak, before the gift line. */
  introLines: string[];
  /** Cycled on later visits — carries the subtle codex nudges. */
  idleLines: string[];
  gift: NpcGift;
};

export const NPCS: Partial<Record<ZoneId, NpcDefinition[]>> = {
  "warden-cottage": [
    {
      id: "warden-bryn",
      name: "Warden Bryn",
      x: 3,
      y: 2,
      spriteKey: "npc-warden-bryn",
      tint: 0x9fc7e8,
      introLines: [
        "You must be the one walking the old paths. Come in, the hearth is warm.",
        "I keep the ward-lines around Hearth Crossing. Quiet work, mostly.",
      ],
      idleLines: [
        "Every creature out there keeps to its own ground. Learn the ground, and you learn the creature.",
        "The shelf holds the old ward-map. Stand there if you want to walk the lines with your companions.",
        "Walk the fens and the mistwood both. Some things only show themselves far from the lantern light.",
      ],
      gift: { kind: "material", id: "wild-fiber", amount: 3 },
    },
  ],
  "weaver-cottage": [
    {
      id: "weaver-sable",
      name: "Weaver Sable",
      x: 3,
      y: 2,
      spriteKey: "npc-weaver-sable",
      tint: 0xd8a8d0,
      introLines: [
        "Mind the loom. Thread's finer than it looks.",
        "I weave what the fields give me. Fiber, feather, whatever wanders in.",
      ],
      idleLines: [
        "A pattern is only finished when there are no gaps left in it. Same with a good record.",
        "The loom remembers a sequence if you watch it. Try the pattern when you have a quiet minute.",
        "Bryn writes everything down. I just remember it. Both work.",
      ],
      gift: { kind: "material", id: "moss-fiber", amount: 3 },
    },
  ],
  "hearthkeep-cottage": [
    {
      id: "hearthkeep-odd",
      name: "Hearthkeep Odd",
      x: 3,
      y: 2,
      spriteKey: "npc-hearthkeep-odd",
      tint: 0xe8b888,
      introLines: [
        "Sit, sit. Nobody passes the hearth without something warm.",
        "I keep the kettle and the door. That is the whole of the job.",
      ],
      idleLines: [
        "Take a tonic before the fens. The peat there does not forgive a tired party.",
        "If you stand at the hearth I will deal the lots. A short game, then the kettle.",
        "Rest here whenever you like. The fire does not mind company.",
      ],
      gift: { kind: "item", id: "brook-tonic", amount: 1 },
    },
  ],
  "hermit-cottage": [
    {
      id: "island-hermit-reed",
      name: "Reed",
      x: 3,
      y: 2,
      spriteKey: "npc-villager",
      tint: 0x7a9ab0,
      introLines: [
        "Easy — I am Reed. I left Hearth Crossing for the open water.",
        "The tide took my boat. I am stuck on this island until the sea forgives me.",
        "Listen well: the Sovereigns rule the deep places. Tide on the water, Stone on the land. Treat them as peers, not prey.",
      ],
      idleLines: [
        "Tide Sovereign rides the open sail. Win its respect — spar or bond — and come back to me.",
        "When your party has grown, Hearth Crossing's east gate yields on its own.",
        "Stone Sovereign keeps the late roads. Tide is the one that matters for the gate.",
      ],
      gift: { kind: "material", id: "wild-fiber", amount: 2 },
    },
  ],
};

export function getZoneNpcs(zoneId: ZoneId): NpcDefinition[] {
  return NPCS[zoneId] ?? [];
}

export function findNpcNearPlayer(
  zoneId: ZoneId,
  tileX: number,
  tileY: number,
): NpcDefinition | undefined {
  return getZoneNpcs(zoneId).find(
    (npc) =>
      Math.abs(npc.x - tileX) <= 1 && Math.abs(npc.y - tileY) <= 1,
  );
}

/** Chebyshev distance to the nearest villager in this zone, if any. */
export function nearestNpcDistance(
  zoneId: ZoneId,
  tileX: number,
  tileY: number,
): number | undefined {
  let best: number | undefined;
  for (const npc of getZoneNpcs(zoneId)) {
    const dist = Math.max(Math.abs(npc.x - tileX), Math.abs(npc.y - tileY));
    if (best === undefined || dist < best) {
      best = dist;
    }
  }
  return best;
}

export function getNpcById(npcId: string): NpcDefinition | undefined {
  for (const npcs of Object.values(NPCS)) {
    const match = npcs?.find((npc) => npc.id === npcId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export const ALL_NPC_IDS: string[] = Object.values(NPCS)
  .flatMap((npcs) => npcs ?? [])
  .map((npc) => npc.id);
