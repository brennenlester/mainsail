import {
  canBeginStorySpar,
  consumeStorySparOutcome,
  describeStorySparLineup,
  getHearthWard,
  getRivalFriendNudge,
  grantCoverageGift,
} from "../battle/storySpar";
import { registerStoryNpcProvider, type NpcDefinition } from "../world/npcs";
import type { ZoneId } from "../world/zoneTypes";
import { isVisitorMode } from "../world/worldSession";
import { questProgress, recordQuestEvent } from "./questProgress";
import type { StorySparId } from "./questTypes";
import { BOSS_NPC_ID, RIVAL_NPC_ID, STORY_SPARS } from "./storySpars";
import {
  FINALE_COMPLETE_EVENT,
  hasFinaleCompanion,
  hatchFinaleCompanion,
  SHRINE_FINALE,
  type StoryCue,
} from "./finaleScene";

/**
 * Main-arc characters (#369, #385): Wren the rival and the Cinder Matriarch boss.
 * They move with the story beat instead of living in one cottage.
 */

export type StoryConversationPrompt =
  | { kind: "advance" }
  | { kind: "challenge"; sparId: StorySparId; label: string };

export type StoryConversation = {
  lines: string[];
  prompt: StoryConversationPrompt;
  /** Per-line presentation cues (scripted scenes, #385). */
  cues?: (StoryCue | undefined)[];
  /** Game event emitted when the dialogue closes (scripted scene end). */
  endEvent?: string;
  /** Per-line narrator flag: shown without the NPC's name (#401). */
  narration?: boolean[];
};

const RIVAL: Omit<NpcDefinition, "x" | "y"> = {
  id: RIVAL_NPC_ID,
  name: "Wren",
  // Blender-rendered rival (#392): `npc-rival-wren` (+ __idle/__talk, walk
  // facings) and a bust `npc-rival-wren-portrait` for dialogue; the tint
  // only applies to the procedural villager fallback.
  spriteKey: "npc-rival-wren",
  tint: 0xd8603c,
  introLines: [],
  idleLines: ["Wren is stretching. She looks like she wants a rematch."],
  gift: { kind: "item", id: "brook-tonic", amount: 2 },
};

const BOSS: Omit<NpcDefinition, "x" | "y"> = {
  id: BOSS_NPC_ID,
  name: "Cinder Matriarch",
  // Blender boss render (#392; `-phase2` is her Cinder form); the Cinder
  // Toad stands in if the frame is missing.
  spriteKey: "creature-cinder-matriarch",
  fallbackSpriteKey: "creature-cinder-toad",
  tint: 0xb8482c,
  introLines: [],
  idleLines: ["The peat smolders, quiet."],
  gift: { kind: "material", id: "folklore-dust", amount: 5 },
};

const RIVAL_SPOTS: Partial<Record<ZoneId, { x: number; y: number }>> = {
  // Clear of the market stall at (3,2), which overhangs (3,3) (#392).
  village: { x: 4, y: 4 },
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

/** A spoken line, or a narrator line (no speaker label, #401). */
type Line = string | { text: string; narration: true };

const narrate = (text: string): Line => ({ text, narration: true });

function talk(
  lines: Line[],
  prompt: StoryConversationPrompt = { kind: "advance" },
  cues?: (StoryCue | undefined)[],
): StoryConversation {
  const conversation: StoryConversation = {
    lines: lines.map((line) => (typeof line === "string" ? line : line.text)),
    prompt,
  };
  if (cues) {
    conversation.cues = cues;
  }
  if (lines.some((line) => typeof line !== "string")) {
    conversation.narration = lines.map((line) => typeof line !== "string");
  }
  return conversation;
}

/** Kind note when the Hearth Ward is on for the next attempt (never a shame label). */
function wardLine(id: StorySparId): Line[] {
  return getHearthWard(id) < 1
    ? [narrate("The shrine's warmth steadies you. (Hearth Ward: the next fight is a little gentler.)")]
    : [];
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
        ...(outcome.gift
          ? [`And take ${outcome.gift}. Your lot has nothing that hunts ember — out past Mistwood, you'll want water in front.`]
          : []),
      ]);
    }
    return talk([
      "Again?! Okay. Okay. I'm writing this down.",
      "Next time I'm bringing a better breakfast. And a bigger bird.",
    ]);
  }
  if (outcome?.result === "lost") {
    return talk([
      "Ha! Told you. Your party fights like it's still waking up.",
      outcome.healed
        ? "Here — I'm not cruel. (Wren patches up your whole party.)"
        : "No freebies twice. Rest up at Odd's hearth or bring tonics.",
      ...[getRivalFriendNudge()].flatMap((nudge) => (nudge ? [`Two of mine, one of yours. ${nudge}`] : [])),
      "Come find me when you want another go.",
    ]);
  }

  const zone = getRivalZone();
  if (zone === "emberfen") {
    // Older saves (or a released Pip): make sure the party can answer Cinder form.
    const lent = grantCoverageGift("rival-wren");
    return talk([
      "You made it. She nearly cooked me — the Matriarch.",
      ...(lent ? [`Nothing in your party hunts ember? Take ${lent}. Water hunts ember.`] : []),
      "She telegraphs. Mire form first — woodland hunts fen. Knock her to half and she splits into Cinder form: ember hunts woodland, water hunts ember.",
      "When she gathers embers, Cinderfall is next. GUARD it. A parried Cinderfall staggers her for a whole turn.",
      "And this time I'm in it with you. Every few turns my lot will patch you up, wash off a burn, or dazzle her.",
    ]);
  }
  if (zone === "shrine") {
    return shrineFinale();
  }

  if (!canBeginStorySpar()) {
    return talk([
      "Your lot's out cold. I don't spar with sleepers — get them rested (Odd's hearth, or a tonic) and come back.",
    ]);
  }
  if (questProgress["rival-wren"] === "active") {
    // #411: a lone companion is the first wall; say so before the fight.
    const nudge = getRivalFriendNudge();
    return talk(
      [
        "So you're the one the Moon Shrine keeps humming about. I'm Wren — I've walked every path from here to the fens.",
        `One battle, my whole team, one after the other: ${describeStorySparLineup("rival-wren")}. No breather between them.`,
        ...(nudge ? [`Just you and one companion? Against two of mine? ${nudge}`] : []),
        "Win, and I'll get the Mistwood path opened for you. Lose, and I'll patch you up and laugh.",
        ...wardLine("rival-wren"),
      ],
      { kind: "challenge", sparId: "rival-wren", label: "Spar Wren" },
    );
  }
  return talk(
    [
      "Back for more? I've been training too — and my storm finch wants a turn.",
      `${describeStorySparLineup("rival-wren")}. No prizes on rematches. Just bragging rights.`,
      ...wardLine("rival-wren"),
    ],
    { kind: "challenge", sparId: "rival-wren", label: "Rematch" },
  );
}

/** Beat 8: the egg hatches at the shrine, then the voyage hook (#385, #351). */
function shrineFinale(): StoryConversation {
  if (questProgress["shrine-finale"] === "active" && !hasFinaleCompanion()) {
    hatchFinaleCompanion();
  }
  recordQuestEvent({ type: "story_finale" });
  return {
    ...talk(
      SHRINE_FINALE.map((line) => (line.narration ? narrate(line.text) : line.text)),
      { kind: "advance" },
      SHRINE_FINALE.map((line) => line.cue),
    ),
    // Hook for the finale credits / share card (#393).
    endEvent: FINALE_COMPLETE_EVENT,
  };
}

/** The Matriarch never speaks: every line at her is narration (#401). */
function bossConversation(): StoryConversation {
  const outcome = consumeStorySparOutcome("cinder-matriarch");
  if (outcome?.result === "won") {
    return talk([
      "The Matriarch's fire gutters out. She settles into the peat, and the whole fen exhales.",
      "Where she sank, something glows in the cooling ash — a warm ember egg. It hums against your palm.",
      outcome.rewardText ? `Beside it: ${outcome.rewardText}.` : "The fen is quiet.",
      "Wren will want to see this. She said she'd wait at the Moon Shrine.",
    ].map(narrate));
  }
  if (outcome?.result === "lost") {
    return talk([
      "The Matriarch sinks back into the smoke. She is not done with you.",
      outcome.healed
        ? "Wren hauls your party clear and patches everyone up. Watch for the wind-up, Guard the Cinderfall, then try again."
        : "Wren hauls your party clear. Rest them before you try again.",
    ].map(narrate));
  }
  if (!canBeginStorySpar()) {
    return talk([
      narrate("The Matriarch's heat rolls over you. Your companions can't stand against her like this — rest them first."),
    ]);
  }
  const boss = STORY_SPARS["cinder-matriarch"].boss;
  return talk(
    [
      ...[
        "A great toad of ash and peat rises from the fen — the Cinder Matriarch. Her shape will not hold still.",
        `She fights in ${boss?.forms.length ?? 2} forms in one battle. ${boss?.forms[0]?.telegraph ?? ""}`,
        "At half strength she splits into Cinder form. Cinderfall comes after she gathers — Guard THAT turn. A parried Cinderfall staggers her.",
        "She swells to meet every companion you bring. Wren stands at your shoulder.",
      ].map(narrate),
      ...wardLine("cinder-matriarch"),
    ],
    { kind: "challenge", sparId: "cinder-matriarch", label: "Challenge" },
  );
}

/** Conversation for Wren / the boss; idle-only for visitors. */
export function storyNpcConversation(npc: NpcDefinition): StoryConversation {
  if (isVisitorMode()) {
    // Both idles describe the character ("Wren is stretching..."), not speech.
    return talk([narrate(npc.idleLines[0] ?? "...")]);
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
