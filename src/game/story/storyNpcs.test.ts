import { beforeEach, describe, expect, it } from "vitest";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import {
  beginStorySpar,
  getStorySparNpcLine,
  resetStorySparForTest,
  resolveStorySpar,
} from "../battle/storySpar";
import { QUESTS } from "./quests";
import { setBrynGroveStartersGifted, setVillageGateUnlocked } from "../world/worldState";
import { playerParty } from "../creatures/party";
import { FINALE_HATCHLING } from "./storySpars";
import { FINALE_COMPLETE_EVENT } from "./finaleScene";
import { isTileWalkable } from "../world/collision";
import { beginConversation } from "../world/npcState";
import { getNpcById, getZoneNpcs } from "../world/npcs";
import { MISTWOOD_GATE } from "../world/villageGate";
import { isGatePropOpen } from "../world/zoneProps";
import { getZone } from "../world/zones";
import { setVisitorMode } from "../world/worldSession";
import { worldState } from "../world/worldState";
import {
  createEmptyQuestProgress,
  getActiveQuestId,
  restoreQuestProgress,
} from "./questProgress";
import { QUEST_ORDER } from "./quests";
import type { QuestId, QuestStatus } from "./questTypes";
import { getRivalZone } from "./storyNpcs";
import { BOSS_NPC_ID, RIVAL_NPC_ID } from "./storySpars";

function progressAt(activeId: QuestId | "done"): Record<QuestId, QuestStatus> {
  const progress = createEmptyQuestProgress();
  const index =
    activeId === "done" ? QUEST_ORDER.length : QUEST_ORDER.indexOf(activeId);
  QUEST_ORDER.forEach((id, i) => {
    progress[id] = i < index ? "complete" : i === index ? "active" : "locked";
  });
  return progress;
}

function talkTo(npcId: string) {
  const npc = getNpcById(npcId);
  if (!npc) {
    throw new Error(`missing ${npcId}`);
  }
  return beginConversation(npc);
}

beforeEach(() => {
  setVisitorMode(false);
  resetStorySparForTest();
  setInventoryFromSnapshot({}, {});
  setPartyFromSnapshot(
    [
      {
        instanceId: "a",
        definitionId: "bramblewarden",
        speciesId: "mossling",
        currentHp: 20,
        level: 3,
        xp: 0,
      } as CreatureInstance,
    ],
    2,
  );
});

describe("Wren and the Matriarch follow the beat (#369)", () => {
  it("introduces Wren at the rival beat and moves her with the story", () => {
    setPartyFromSnapshot([], 1);
    restoreQuestProgress(progressAt("first-evolution"));
    expect(getRivalZone()).toBeNull();
    expect(getZoneNpcs("village").map((n) => n.id)).not.toContain(RIVAL_NPC_ID);

    restoreQuestProgress(progressAt("rival-wren"));
    expect(getZoneNpcs("village").map((n) => n.id)).toContain(RIVAL_NPC_ID);

    restoreQuestProgress(progressAt("cinder-matriarch"));
    expect(getZoneNpcs("emberfen").map((n) => n.id)).toEqual([
      RIVAL_NPC_ID,
      BOSS_NPC_ID,
    ]);
    expect(getZoneNpcs("village").map((n) => n.id)).not.toContain(RIVAL_NPC_ID);

    restoreQuestProgress(progressAt("shrine-finale"));
    expect(getZoneNpcs("shrine").map((n) => n.id)).toContain(RIVAL_NPC_ID);
    expect(getZoneNpcs("emberfen").map((n) => n.id)).not.toContain(BOSS_NPC_ID);

    restoreQuestProgress(progressAt("done"));
    expect(getZoneNpcs("village").map((n) => n.id)).toContain(RIVAL_NPC_ID);
  });

  it("keeps story characters off occupied prop and altar tiles", () => {
    for (const zoneId of ["village", "shrine", "emberfen"] as const) {
      restoreQuestProgress(
        progressAt(
          zoneId === "village"
            ? "rival-wren"
            : zoneId === "shrine"
              ? "shrine-finale"
              : "cinder-matriarch",
        ),
      );
      const zone = getZone(zoneId);
      for (const npc of getZoneNpcs(zoneId)) {
        expect(isTileWalkable(zone, npc.x, npc.y), `${zoneId} ${npc.id}`).toBe(true);
        if (zone.shrineInteract) {
          expect(
            Math.max(
              Math.abs(npc.x - zone.shrineInteract.x),
              Math.abs(npc.y - zone.shrineInteract.y),
            ),
          ).toBeGreaterThan(2);
        }
      }
    }
  });
});

describe("rival conversation", () => {
  it("offers the challenge, then banters by outcome", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    const intro = talkTo(RIVAL_NPC_ID);
    expect(intro.prompt).toEqual({
      kind: "challenge",
      sparId: "rival-wren",
      label: "Spar Wren",
    });

    expect(intro.lines.join(" ")).toMatch(/Lantern Fox \(Lv 3\), then Rootwalker \(Lv 4\)/);

    beginStorySpar("rival-wren");
    resolveStorySpar(false);
    const loss = talkTo(RIVAL_NPC_ID);
    expect(loss.lines.join(" ")).toMatch(/Told you/);
    expect(loss.prompt.kind).toBe("advance");

    beginStorySpar("rival-wren");
    resolveStorySpar(true);
    const win = talkTo(RIVAL_NPC_ID);
    expect(win.lines.join(" ")).toMatch(/Mistwood path is open/);
    expect(win.lines.join(" ")).toMatch(/Brook Tonic×2/);
    expect(win.lines.join(" ")).toMatch(/take Pip the Brook Nymph/);

    const rematch = talkTo(RIVAL_NPC_ID);
    expect(rematch.prompt).toMatchObject({ kind: "challenge", label: "Rematch" });
    // Rematch escalation: a third creature and higher levels.
    expect(rematch.lines.join(" ")).toMatch(/Thunder Finch \(Lv 4\)/);
  });

  it("nudges a lone companion to Bryn's gift before the fight, and the gift clears it (#411)", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setVillageGateUnlocked(true, false);
    setBrynGroveStartersGifted([]);
    // Lone evolved Mossling line: Bryn has an Ember Wisp waiting.
    const intro = talkTo(RIVAL_NPC_ID);
    expect(intro.prompt).toMatchObject({ kind: "challenge", sparId: "rival-wren" });
    expect(intro.lines.join(" ")).toMatch(/Bring a friend: Warden Bryn has an Ember Wisp for you/);
    expect(getStorySparNpcLine()).toMatch(/^Wren: Bring a friend: Warden Bryn/);
    // The quest hint names the cottage and the gift, too.
    expect(QUESTS["rival-wren"].hint).toMatch(/Warden Bryn \(Warden's Cottage/);
    expect(QUESTS["rival-wren"].hint).toMatch(/Ember Wisp or Mossling/);

    // Not a dead end: Bryn really gives it, and the nudge goes away.
    const bryn = beginConversation(getNpcById("warden-bryn")!);
    expect(bryn.lines.join(" ")).toMatch(/Ember Wisp/);
    expect(playerParty.creatures).toHaveLength(2);
    expect(talkTo(RIVAL_NPC_ID).lines.join(" ")).not.toMatch(/Bring a friend/);
    expect(getStorySparNpcLine()).toBeNull();
  });

  it("points a lone companion at the bench or the Grove once Bryn has nothing left", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setVillageGateUnlocked(true, false);
    setBrynGroveStartersGifted(["ember-wisp"]);
    expect(talkTo(RIVAL_NPC_ID).lines.join(" ")).toMatch(/befriend another companion in Whisper Grove/);
    // A rested-out second companion: heal or swap it in.
    setPartyFromSnapshot(
      [
        { instanceId: "a", definitionId: "bramblewarden", speciesId: "mossling", currentHp: 20, level: 4, xp: 0 } as CreatureInstance,
        { instanceId: "b", definitionId: "ember-wisp", speciesId: "ember-wisp", currentHp: 0, level: 4, xp: 0 } as CreatureInstance,
      ],
      3,
    );
    expect(talkTo(RIVAL_NPC_ID).lines.join(" ")).toMatch(/Moon Shrine altar/);
  });

  it("will not spar a fully fainted party (no free heal)", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setPartyFromSnapshot(
      [{ instanceId: "z", definitionId: "mossling", speciesId: "mossling", currentHp: 0, level: 3, xp: 0 } as CreatureInstance],
      2,
    );
    const fainted = talkTo(RIVAL_NPC_ID);
    expect(fainted.prompt.kind).toBe("advance");
    expect(fainted.lines.join(" ")).toMatch(/out cold/);
  });

  it("gives the boss tip in Emberfen without a challenge", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    const tip = talkTo(RIVAL_NPC_ID);
    expect(tip.prompt.kind).toBe("advance");
    expect(tip.lines.join(" ")).toMatch(/telegraphs/);
    expect(tip.lines.join(" ")).toMatch(/GUARD/);
    // An older save with no water companion gets Pip from Wren's tip, once.
    expect(tip.lines.join(" ")).toMatch(/Take Pip the Brook Nymph/);
    expect(talkTo(RIVAL_NPC_ID).lines.join(" ")).not.toMatch(/Take Pip/);
  });

  it("plays the finale at the shrine: the egg hatches, then the voyage hook (#385)", () => {
    restoreQuestProgress(progressAt("shrine-finale"));
    const finale = talkTo(RIVAL_NPC_ID);
    expect(finale.lines.join(" ")).toMatch(/Eclipse/);
    expect(finale.cues).toContain("hatch");
    expect(finale.cues).toHaveLength(finale.lines.length);
    // The hatch line comes before the voyage hook.
    const hatch = finale.cues!.indexOf("hatch");
    const sea = finale.cues!.indexOf("sea");
    expect(hatch).toBeGreaterThan(-1);
    expect(sea).toBeGreaterThan(hatch);
    expect(getActiveQuestId()).toBeNull();
    expect(finale.endEvent).toBe(FINALE_COMPLETE_EVENT);
    // The hatch line is the narrator's, not Wren's; the voyage hook is hers (#401).
    expect(finale.narration).toHaveLength(finale.lines.length);
    expect(finale.narration![hatch]).toBe(true);
    expect(finale.narration![sea]).toBe(false);
    expect(finale.narration![0]).toBe(false);
    const hatchlings = playerParty.creatures.filter(
      (c) => c.nickname === FINALE_HATCHLING.nickname,
    );
    expect(hatchlings).toHaveLength(1);
    expect(hatchlings[0]).toMatchObject({
      definitionId: "cinder-toad",
      rare: true,
      trait: { kind: "damage-buff", moveId: "ember-spit" },
    });

    // Talking again (story complete) never hatches a second one.
    talkTo(RIVAL_NPC_ID);
    expect(playerParty.creatures.filter((c) => c.nickname === FINALE_HATCHLING.nickname)).toHaveLength(1);
  });

  it("never hatches for visitors", () => {
    restoreQuestProgress(progressAt("shrine-finale"));
    setVisitorMode(true);
    talkTo(RIVAL_NPC_ID);
    expect(playerParty.creatures.some((c) => c.nickname === FINALE_HATCHLING.nickname)).toBe(false);
    expect(getActiveQuestId()).toBe("shrine-finale");
  });

  it("only idles for visitors", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setVisitorMode(true);
    const visit = talkTo(RIVAL_NPC_ID);
    expect(visit.prompt.kind).toBe("advance");
  });
});

describe("boss conversation", () => {
  it("telegraphs her forms and signature, then sends you to the shrine with the egg", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    const intro = talkTo(BOSS_NPC_ID);
    expect(intro.prompt).toMatchObject({ kind: "challenge", sparId: "cinder-matriarch" });
    expect(intro.lines.join(" ")).toMatch(/Mire form \(fen\)/);
    expect(intro.lines.join(" ")).toMatch(/Cinder form/);
    expect(intro.lines.join(" ")).toMatch(/Guard/);

    beginStorySpar("cinder-matriarch");
    resolveStorySpar(false);
    const loss = talkTo(BOSS_NPC_ID);
    expect(loss.lines.join(" ")).toMatch(/patches everyone up/);
    // "Wren hauls your party clear" is narration, never the Matriarch speaking (#401).
    expect(loss.narration).toEqual(loss.lines.map(() => true));
    expect(intro.narration).toEqual(intro.lines.map(() => true));

    beginStorySpar("cinder-matriarch");
    resolveStorySpar(true);
    const victory = talkTo(BOSS_NPC_ID);
    expect(victory.lines.join(" ")).toMatch(/ember egg/);
    expect(victory.lines.join(" ")).toMatch(/Moon Shrine/);
    expect(victory.narration).toEqual(victory.lines.map(() => true));
    expect(getActiveQuestId()).toBe("shrine-finale");
  });
});

describe("Mistwood region gate", () => {
  it("blocks the Folklore Fields east exit until the rival is beaten", () => {
    const overworld = getZone("overworld");
    restoreQuestProgress(progressAt("rival-wren"));
    expect(worldState.mistwoodPathOpen).toBe(false);
    expect(isTileWalkable(overworld, MISTWOOD_GATE.x, MISTWOOD_GATE.y)).toBe(false);
    const gateProp = { ...MISTWOOD_GATE, kind: "gate" as const };
    expect(isGatePropOpen("overworld", gateProp, true, true)).toBe(false);

    restoreQuestProgress(progressAt("reach-mistwood"));
    expect(isTileWalkable(overworld, MISTWOOD_GATE.x, MISTWOOD_GATE.y)).toBe(true);
    expect(isGatePropOpen("overworld", gateProp, true, true)).toBe(true);
    expect(
      overworld.transitions.some(
        (t) =>
          t.x === MISTWOOD_GATE.x &&
          t.y === MISTWOOD_GATE.y &&
          t.targetZone === "mistwood",
      ),
    ).toBe(true);
  });
});
