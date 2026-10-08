import { beforeEach, describe, expect, it } from "vitest";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import {
  beginStorySpar,
  resetStorySparForTest,
  resolveStorySparRound,
} from "../battle/storySpar";
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

    beginStorySpar("rival-wren");
    resolveStorySparRound(false);
    const loss = talkTo(RIVAL_NPC_ID);
    expect(loss.lines.join(" ")).toMatch(/Told you/);
    expect(loss.prompt.kind).toBe("advance");

    beginStorySpar("rival-wren");
    resolveStorySparRound(true);
    const interlude = talkTo(RIVAL_NPC_ID);
    expect(interlude.prompt).toMatchObject({ label: "Next round" });
    expect(interlude.lines.join(" ")).toMatch(/Round 2\/2: Rootwalker/);

    resolveStorySparRound(true);
    const win = talkTo(RIVAL_NPC_ID);
    expect(win.lines.join(" ")).toMatch(/Mistwood path is open/);
    expect(win.lines.join(" ")).toMatch(/Brook Tonic×2/);

    const rematch = talkTo(RIVAL_NPC_ID);
    expect(rematch.prompt).toMatchObject({ kind: "challenge", label: "Rematch" });
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
  });

  it("plays the finale at the shrine and completes the main story", () => {
    restoreQuestProgress(progressAt("shrine-finale"));
    const finale = talkTo(RIVAL_NPC_ID);
    expect(finale.lines.join(" ")).toMatch(/Eclipse/);
    expect(getActiveQuestId()).toBeNull();
  });

  it("only idles for visitors", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setVisitorMode(true);
    const visit = talkTo(RIVAL_NPC_ID);
    expect(visit.prompt.kind).toBe("advance");
  });
});

describe("boss conversation", () => {
  it("telegraphs each form before it rises", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    const intro = talkTo(BOSS_NPC_ID);
    expect(intro.prompt).toMatchObject({ kind: "challenge", sparId: "cinder-matriarch" });
    expect(intro.lines.join(" ")).toMatch(/Mire form \(fen\)/);

    beginStorySpar("cinder-matriarch");
    resolveStorySparRound(true);
    const phaseTwo = talkTo(BOSS_NPC_ID);
    expect(phaseTwo.lines.join(" ")).toMatch(/Cinder form \(ember\)/);
    expect(phaseTwo.prompt).toMatchObject({ label: "Face her" });

    resolveStorySparRound(true);
    const victory = talkTo(BOSS_NPC_ID);
    expect(victory.lines.join(" ")).toMatch(/Moon Shrine/);
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
