import {
  canBeginStorySpar,
  consumeStorySparOutcome,
  getActiveStorySpar,
  getCurrentStorySparRound,
} from "../battle/storySpar";
import { getCreatureDefinition } from "../creatures/catalog";
import { registerStoryNpcProvider, type NpcDefinition } from "../world/npcs";
import type { ZoneId } from "../world/zoneTypes";
import { isVisitorMode } from "../world/worldSession";
import { questProgress, recordQuestEvent } from "./questProgress";
import type { StorySparId } from "./questTypes";
import { BOSS_NPC_ID, RIVAL_NPC_ID, STORY_SPARS } from "./storySpars";

/**
 * Main-arc characters (#369): Wren the rival and the Cinder Matriarch boss.
 * They move with the story beat instead of living in one cottage.
 */

export type StoryConversationPrompt =
  | { kind: "advance" }
  | { kind: "challenge"; sparId: StorySparId; label: string };

export type StoryConversation = {
  lines: string[];
  prompt: StoryConversationPrompt;
};

const RIVAL: Omit<NpcDefinition, "x" | "y"> = {
  id: RIVAL_NPC_ID,
  name: "Wren",
  // No bespoke art yet — villager fallback with Wren's rust-red robe.
  spriteKey: "npc-rival-wren",
  tint: 0xd8603c,
  introLines: [],
  idleLines: ["Wren is stretching. She looks like she wants a rematch."],
  gift: { kind: "item", id: "brook-tonic", amount: 2 },
};

const BOSS: Omit<NpcDefinition, "x" | "y"> = {
  id: BOSS_NPC_ID,
  name: "Cinder Matriarch",
  // Creature art (textures exist once party followers prepare them).
  spriteKey: "creature-cinder-toad",
  tint: 0xb8482c,
  introLines: [],
  idleLines: ["The peat smolders, quiet."],
  gift: { kind: "material", id: "folklore-dust", amount: 5 },
};

const RIVAL_SPOTS: Partial<Record<ZoneId, { x: number; y: number }>> = {
  village: { x: 3, y: 3 },
  emberfen: { x: 2, y: 7 },
  shrine: { x: 2, y: 7 },
};

const BOSS_SPOT = { zoneId: "emberfen" as ZoneId, x: 8, y: 5 };

/** Where Wren stands for the current beat (null before she is introduced). */
export function getRivalZone(): ZoneId | null {
  if (questProgress["rival-wren"] === "locked") {
    return null;
  }
  if (questProgress["cinder-matriarch"] === "active") {
    return "emberfen";
  }
  if (questProgress["shrine-finale"] === "active") {
    return "shrine";
  }
  return "village";
}

function isBossPresent(): boolean {
  return questProgress["cinder-matriarch"] === "active";
}

export function getStoryNpcsForZone(zoneId: ZoneId): NpcDefinition[] {
  const npcs: NpcDefinition[] = [];
  const rivalSpot = RIVAL_SPOTS[zoneId];
  if (rivalSpot && getRivalZone() === zoneId) {
    npcs.push({ ...RIVAL, ...rivalSpot });
  }
  if (zoneId === BOSS_SPOT.zoneId && isBossPresent()) {
    npcs.push({ ...BOSS, x: BOSS_SPOT.x, y: BOSS_SPOT.y });
  }
  return npcs;
}

/** Lookup for DialogueScene even when the NPC is not currently placed. */
export function getStoryNpcById(npcId: string): NpcDefinition | undefined {
  if (npcId === RIVAL_NPC_ID) {
    return { ...RIVAL, ...(RIVAL_SPOTS.village ?? { x: 0, y: 0 }) };
  }
  if (npcId === BOSS_NPC_ID) {
    return { ...BOSS, x: BOSS_SPOT.x, y: BOSS_SPOT.y };
  }
  return undefined;
}

export function isStoryNpcId(npcId: string): boolean {
  return npcId === RIVAL_NPC_ID || npcId === BOSS_NPC_ID;
}

function talk(
  lines: string[],
  prompt: StoryConversationPrompt = { kind: "advance" },
): StoryConversation {
  return { lines, prompt };
}

function roundIntro(): string {
  const current = getCurrentStorySparRound();
  if (!current) {
    return "";
  }
  const name = getCreatureDefinition(current.round.creatureId).name;
  return `Round ${current.roundNumber}/${current.roundCount}: ${name} (Lv ${current.level}).`;
}

function rivalConversation(): StoryConversation {
  const outcome = consumeStorySparOutcome("rival-wren");
  if (outcome?.result === "won") {
    if (outcome.firstWin) {
      return talk([
        "...Fine. You earned that one.",
        "I told the Fields warden — the Mistwood path is open for you now. East edge of Folklore Fields.",
        outcome.rewardText
          ? `Here, don't make it weird — ${outcome.rewardText}.`
          : "Go on. I'll catch up.",
      ]);
    }
    return talk([
      "Again?! Okay. Okay. I'm writing this down.",
      "Next time I'm bringing a better breakfast.",
    ]);
  }
  if (outcome?.result === "lost") {
    return talk([
      "Ha! Told you. Your party fights like it's still waking up.",
      outcome.healed
        ? "Here — I'm not cruel. (Wren patches up your whole party.)"
        : "No freebies twice. Rest up at Odd's hearth or bring tonics.",
      "Come find me when you want another go.",
    ]);
  }

  const activeSpar = getActiveStorySpar();
  if (activeSpar?.id === "rival-wren") {
    return talk(
      ["Lucky. That one was my warm-up.", roundIntro()],
      { kind: "challenge", sparId: "rival-wren", label: "Next round" },
    );
  }

  const zone = getRivalZone();
  const canSpar = canBeginStorySpar();
  if (zone === "emberfen") {
    return talk([
      "You made it. She nearly cooked me — the Matriarch.",
      "She telegraphs. Before every form she shows you what she's becoming. Watch, then put whoever hunts it in front.",
      "Mire form first: woodland hunts fen. Then Cinder: water hunts ember — and ember hunts woodland, so don't leave your Mossling line out there.",
    ]);
  }
  if (zone === "shrine") {
    const lines = [
      "You actually did it. The fen's gone quiet — first time in years.",
      "Hear that hum? The shrine is singing toward the sea. Reed, the old hermit out on the far isle, says two Sovereigns sleep out there — Tide and Stone.",
      "Braid them here and you get Horizon. Braid two Horizons and... nobody alive has seen an Eclipse.",
      "That one's yours to chase, if you want it. Build a boat. I'll be in the plaza whenever you want a rematch.",
    ];
    recordQuestEvent({ type: "story_finale" });
    return talk(lines);
  }

  if (!canSpar) {
    return talk([
      "Your lot's out cold. I don't spar with sleepers — get them rested (Odd's hearth, or a tonic) and come back.",
    ]);
  }
  if (questProgress["rival-wren"] === "active") {
    return talk(
      [
        "So you're the one the Moon Shrine keeps humming about. I'm Wren — I've walked every path from here to the fens.",
        "Two of mine against yours, one after the other. Your HP carries between rounds, so don't spend it all on the first.",
        "Win, and I'll get the Mistwood path opened for you. Lose, and I'll patch you up and laugh.",
      ],
      { kind: "challenge", sparId: "rival-wren", label: "Spar Wren" },
    );
  }
  return talk(
    [
      "Back for more? I've been training too — my lot hit harder now.",
      "No prizes on rematches. Just bragging rights.",
    ],
    { kind: "challenge", sparId: "rival-wren", label: "Rematch" },
  );
}

function telegraphLine(): string {
  const current = getCurrentStorySparRound();
  return current?.round.telegraph ?? "";
}

function bossConversation(): StoryConversation {
  const outcome = consumeStorySparOutcome("cinder-matriarch");
  if (outcome?.result === "won") {
    return talk([
      "The Matriarch's fire gutters out. She settles into the peat, and the whole fen exhales.",
      outcome.rewardText
        ? `Something glints in the cooling ash — ${outcome.rewardText}.`
        : "The fen is quiet.",
      "Wren will want to hear about this. She said she'd wait at the Moon Shrine.",
    ]);
  }
  if (outcome?.result === "lost") {
    return talk([
      "The Matriarch sinks back into the smoke. She is not done with you.",
      outcome.healed
        ? "Wren hauls your party clear and patches everyone up. Study her forms, then try again."
        : "Wren hauls your party clear. Rest them before you try again.",
    ]);
  }
  if (!canBeginStorySpar()) {
    return talk([
      "The Matriarch's heat rolls over you. Your companions can't stand against her like this — rest them first.",
    ]);
  }
  const activeSpar = getActiveStorySpar();
  if (activeSpar?.id === "cinder-matriarch") {
    return talk(
      ["She shudders and changes.", telegraphLine(), roundIntro()],
      { kind: "challenge", sparId: "cinder-matriarch", label: "Face her" },
    );
  }
  return talk(
    [
      "A great toad of ash and peat rises from the fen — the Cinder Matriarch. Her shape will not hold still.",
      `Telegraph: she fights in ${STORY_SPARS["cinder-matriarch"].rounds.length} forms and announces each one before it rises.`,
      STORY_SPARS["cinder-matriarch"].rounds[0]?.telegraph ?? "",
    ],
    {
      kind: "challenge",
      sparId: "cinder-matriarch",
      label: "Challenge",
    },
  );
}

/** Conversation for Wren / the boss; idle-only for visitors. */
export function storyNpcConversation(npc: NpcDefinition): StoryConversation {
  if (isVisitorMode()) {
    return talk([npc.idleLines[0] ?? "..."]);
  }
  if (npc.id === RIVAL_NPC_ID) {
    return rivalConversation();
  }
  return bossConversation();
}

registerStoryNpcProvider({
  forZone: getStoryNpcsForZone,
  byId: getStoryNpcById,
});
