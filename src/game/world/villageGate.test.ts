import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  VILLAGE_CODE_GATE,
  VILLAGE_COTTAGE_DOORS,
  VILLAGE_COTTAGE_ZONE_IDS,
} from "./villageGate";
import { beginConversation, resetNpcStateForTest } from "./npcState";
import { getNpcById } from "./npcs";
import { HERMIT_NPC_ID } from "./hermitIsland";
import {
  setTideSovereignObtained,
  setVillageGateUnlocked,
  worldState,
} from "./worldState";

describe("village gate layout", () => {
  it("keeps stable cottage gate and door coordinates", () => {
    expect(VILLAGE_CODE_GATE).toEqual({ x: 8, y: 5 });
    expect(VILLAGE_COTTAGE_DOORS.hearthkeep).toEqual({ x: 11, y: 8 });
  });

  it("lists cottage interiors used to complete story step 7", () => {
    expect([...VILLAGE_COTTAGE_ZONE_IDS]).toEqual([
      "warden-cottage",
      "weaver-cottage",
      "hearthkeep-cottage",
    ]);
  });

  it("does not ship a leftover villageGateCode module", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    expect(existsSync(path.join(here, "villageGateCode.ts"))).toBe(false);
  });
});

describe("hermit Reed dialogue (#318)", () => {
  const reed = getNpcById(HERMIT_NPC_ID)!;

  beforeEach(() => {
    resetNpcStateForTest();
    setTideSovereignObtained(0, false);
    setVillageGateUnlocked(false, false);
  });

  it("does not mention a numeric gate code before Tide Sovereign", () => {
    const first = beginConversation(reed);
    expect(first.lines.join(" ")).toMatch(/Sovereign/i);
    expect(first.lines.join(" ")).not.toMatch(/\d{4}/);

    const again = beginConversation(reed);
    expect(again.lines.join(" ")).not.toMatch(/\d{4}/);
    expect(again.lines.join(" ").length).toBeGreaterThan(0);
  });

  it("points to story-driven gate unlock after Tide Sovereign", () => {
    beginConversation(reed);
    setTideSovereignObtained(1, false);
    const talk = beginConversation(reed);
    expect(talk.lines.join(" ")).toMatch(/east gate/i);
    expect(talk.lines.join(" ")).not.toMatch(/\d{4}/);
  });

  it("uses story-driven gate lines when Tide was already claimed", () => {
    setTideSovereignObtained(1, false);
    const first = beginConversation(reed);
    expect(first.lines.join(" ")).toMatch(/east gate/i);
    expect(first.lines.join(" ")).not.toMatch(/\d{4}/);
  });
});

describe("villageGateUnlocked flag", () => {
  it("defaults locked and can be set", () => {
    setVillageGateUnlocked(false, false);
    expect(worldState.villageGateUnlocked).toBe(false);
    setVillageGateUnlocked(true, false);
    expect(worldState.villageGateUnlocked).toBe(true);
  });
});
