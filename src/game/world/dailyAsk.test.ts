import { beforeEach, describe, expect, it } from "vitest";
import { CREATURE_MATERIALS } from "../inventory/materials";
import {
  addMaterial,
  getItemCount,
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import {
  DAILY_ASK_AMOUNT,
  DAILY_ASK_REWARD_AMOUNT,
  DAILY_ASK_REWARD_ITEM,
  DAILY_ASK_ROTATION,
  activateDailyAsk,
  ensureDailyAsk,
  getDailyAskState,
  resetDailyAskForTest,
  selectDailyAskMaterial,
  setDailyAskNowForTest,
  turnInDailyAsk,
} from "./dailyAsk";
import {
  beginConversation,
  resetNpcStateForTest,
  setClaimedNpcGifts,
  setSideQuestStatuses,
} from "./npcState";
import { getNpcById } from "./npcs";
import { SIDE_QUEST_IDS } from "./sideQuests";
import { setDiscoveredCreatures } from "./worldState";
import { setVisitorMode } from "./worldSession";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
} from "./worldSnapshot";

const ALL_CREATURE_IDS = Object.keys(CREATURE_MATERIALS);
const ALL_MATERIAL_IDS = [...new Set(Object.values(CREATURE_MATERIALS))];

function dateAt(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0);
}

beforeEach(() => {
  resetNpcStateForTest();
  resetDailyAskForTest();
  setInventoryFromSnapshot({}, {});
  setDiscoveredCreatures([]);
  setVisitorMode(false);
  setDailyAskNowForTest(() => dateAt("2026-08-21"));
});

describe("selectDailyAskMaterial", () => {
  it("returns null when nothing is discovered (AC2)", () => {
    expect(selectDailyAskMaterial("2026-08-21", [])).toBeNull();
  });

  it("only returns materials from discovered creatures (AC2)", () => {
    const discovered = ALL_CREATURE_IDS.slice(0, 3);
    const material = selectDailyAskMaterial("2026-08-21", discovered);
    expect(material).toBeTruthy();
    const allowed = new Set(
      discovered.map((id) => CREATURE_MATERIALS[id]),
    );
    expect(allowed.has(material!)).toBe(true);
  });

  it("covers every discovered material across 27 days (AC4)", () => {
    expect(DAILY_ASK_ROTATION.length).toBe(27);
    const seen = new Set<string>();
    for (let i = 0; i < 27; i++) {
      const key = `2026-01-${String(i + 1).padStart(2, "0")}`;
      const material = selectDailyAskMaterial(key, ALL_CREATURE_IDS);
      expect(material).toBeTruthy();
      seen.add(material!);
    }
    expect(seen.size).toBe(27);
    expect([...seen].sort()).toEqual([...ALL_MATERIAL_IDS].sort());
  });
});

describe("ensureDailyAsk stability (AC1)", () => {
  it("is stable within a day across ensure calls and snapshot round-trips", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const first = ensureDailyAsk();
    expect(first).toBeTruthy();
    expect(first!.dayKey).toBe("2026-08-21");
    expect(ensureDailyAsk()?.materialId).toBe(first!.materialId);
    expect(ensureDailyAsk()?.npcId).toBe(first!.npcId);

    activateDailyAsk();
    const snap = exportWorldSnapshot({ zoneId: "grove", x: 3, y: 7 });
    expect(isValidWorldSnapshot(snap)).toBe(true);
    expect(snap.dailyAsk?.materialId).toBe(first!.materialId);
    expect(snap.dailyAsk?.status).toBe("active");

    resetDailyAskForTest();
    setDailyAskNowForTest(() => dateAt("2026-08-21"));
    expect(getDailyAskState()).toBeNull();
    applyWorldSnapshot(snap);
    expect(getDailyAskState()?.materialId).toBe(first!.materialId);
    expect(getDailyAskState()?.status).toBe("active");
    expect(ensureDailyAsk()?.materialId).toBe(first!.materialId);
  });

  it("rolls a new ask on a new calendar day", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const day1 = ensureDailyAsk();
    setDailyAskNowForTest(() => dateAt("2026-08-22"));
    const day2 = ensureDailyAsk();
    expect(day2?.dayKey).toBe("2026-08-22");
    // Preferred slot advances; with full pool the material changes.
    expect(day2?.materialId).not.toBe(day1?.materialId);
  });
});

describe("turn-in sink (AC3)", () => {
  it("removes materials from inventory on turn-in", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const ask = ensureDailyAsk()!;
    activateDailyAsk();
    addMaterial(ask.materialId, DAILY_ASK_AMOUNT + 2);
    expect(getMaterialCount(ask.materialId)).toBe(DAILY_ASK_AMOUNT + 2);

    const lines = turnInDailyAsk();
    expect(lines).toBeTruthy();
    expect(getMaterialCount(ask.materialId)).toBe(2);
    expect(getItemCount(DAILY_ASK_REWARD_ITEM)).toBe(DAILY_ASK_REWARD_AMOUNT);
    expect(getDailyAskState()?.status).toBe("complete");
  });

  it("does not consume when short", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const ask = ensureDailyAsk()!;
    activateDailyAsk();
    addMaterial(ask.materialId, DAILY_ASK_AMOUNT - 1);
    expect(turnInDailyAsk()).toBeNull();
    expect(getMaterialCount(ask.materialId)).toBe(DAILY_ASK_AMOUNT - 1);
    expect(getDailyAskState()?.status).toBe("active");
  });
});

describe("visitor guard (AC5)", () => {
  it("does not let visitors claim or turn in the daily ask", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const ask = ensureDailyAsk()!;
    const npc = getNpcById(ask.npcId)!;
    setClaimedNpcGifts([ask.npcId]);
    addMaterial(ask.materialId, DAILY_ASK_AMOUNT);

    setVisitorMode(true);
    const before = getMaterialCount(ask.materialId);
    const convo = beginConversation(npc);
    expect(getMaterialCount(ask.materialId)).toBe(before);
    expect(getDailyAskState()?.status).toBe("locked");
    // Visitor idle only — no offer / turn-in copy.
    expect(getDailyAskState()?.status).toBe("locked");
    expect(getItemCount(DAILY_ASK_REWARD_ITEM)).toBe(0);
  });
});

describe("conversation wiring", () => {
  it("offers, progresses, and turns in via today's host NPC", () => {
    setDiscoveredCreatures(ALL_CREATURE_IDS);
    const ask = ensureDailyAsk()!;
    const npc = getNpcById(ask.npcId)!;
    setClaimedNpcGifts([ask.npcId]);
    setSideQuestStatuses(
      Object.fromEntries(
        SIDE_QUEST_IDS.map((id) => [id, "complete" as const]),
      ),
    );

    const offer = beginConversation(npc);
    expect(offer.lines.join(" ").toLowerCase()).toContain("ask");
    expect(getDailyAskState()?.status).toBe("active");

    const progress = beginConversation(npc);
    expect(progress.lines.join(" ").toLowerCase()).toContain("waiting");

    addMaterial(ask.materialId, DAILY_ASK_AMOUNT);
    const turnIn = beginConversation(npc);
    expect(turnIn.lines.join(" ").toLowerCase()).toMatch(/thank/);
    expect(getMaterialCount(ask.materialId)).toBe(0);
    expect(getDailyAskState()?.status).toBe("complete");
  });
});
