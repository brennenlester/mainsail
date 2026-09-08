import { beforeEach, describe, expect, it } from "vitest";
import { VILLAGE_CODE_GATE, VILLAGE_COTTAGE_DOORS } from "./villageGate";
import { beginConversation, resetNpcStateForTest } from "./npcState";
import { getNpcById } from "./npcs";
import { HERMIT_NPC_ID } from "./hermitIsland";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { CAIRN_SOVEREIGN_ID } from "../encounters/godLand";
import { TIDE_SOVEREIGN_ID } from "../encounters/godSail";
import { HORIZON_SOVEREIGN_ID } from "../shrine/godFusion";
import {
  setCairnSovereignObtained,
  setHorizonFusionCount,
  setTideSovereignObtained,
  setVillageGateUnlocked,
  worldState,
} from "./worldState";

const GATE_LORE = /east gate|village story|gate code|\d{4}/i;

function sovereign(definitionId: string, instanceId: string): CreatureInstance {
  return {
    instanceId,
    definitionId,
    speciesId: definitionId,
    currentHp: 10,
    level: 1,
    xp: 0,
  };
}

describe("village gate layout", () => {
  it("keeps stable cottage gate and door coordinates", () => {
    expect(VILLAGE_CODE_GATE).toEqual({ x: 8, y: 5 });
    expect(VILLAGE_COTTAGE_DOORS.hearthkeep).toEqual({ x: 11, y: 8 });
  });
});

describe("hermit Reed dialogue (#318)", () => {
  const reed = getNpcById(HERMIT_NPC_ID)!;

  beforeEach(() => {
    resetNpcStateForTest();
    setPartyFromSnapshot([], 1);
    setTideSovereignObtained(0, false);
    setCairnSovereignObtained(0, false);
    setHorizonFusionCount(0, false);
    setVillageGateUnlocked(false, false);
  });

  it("teaches fusion-sage lore without village-gate copy", () => {
    const catalog = [...reed.introLines, ...reed.idleLines].join(" ");
    expect(catalog).toMatch(/joining|Horizon|Sovereign/i);
    expect(catalog).not.toMatch(GATE_LORE);

    const first = beginConversation(reed);
    expect(first.lines.join(" ")).toMatch(/Sovereign/i);
    expect(first.lines.join(" ")).not.toMatch(GATE_LORE);

    const again = beginConversation(reed);
    expect(again.lines.join(" ")).not.toMatch(GATE_LORE);
    expect(again.lines.join(" ").length).toBeGreaterThan(0);
  });

  it("points south to Stone Sovereign after Tide is in the party", () => {
    beginConversation(reed);
    setTideSovereignObtained(1, false);
    setPartyFromSnapshot([sovereign(TIDE_SOVEREIGN_ID, "t")], 2);
    const talk = beginConversation(reed);
    const text = talk.lines.join(" ");
    expect(text).toMatch(/Tide Sovereign/i);
    expect(text).toMatch(/south/i);
    expect(text).toMatch(/cairn/i);
    expect(text).not.toMatch(GATE_LORE);
  });

  it("uses cairn-south lines when Tide is already in the party", () => {
    setTideSovereignObtained(1, false);
    setPartyFromSnapshot([sovereign(TIDE_SOVEREIGN_ID, "t")], 2);
    const first = beginConversation(reed);
    const text = first.lines.join(" ");
    expect(text).toMatch(/south/i);
    expect(text).toMatch(/cairn/i);
    expect(text).not.toMatch(GATE_LORE);
  });

  it("points to Moon Shrine Horizon fusion when both sovereigns are in the party", () => {
    beginConversation(reed);
    setTideSovereignObtained(1, false);
    setCairnSovereignObtained(1, false);
    setPartyFromSnapshot(
      [
        sovereign(TIDE_SOVEREIGN_ID, "t"),
        sovereign(CAIRN_SOVEREIGN_ID, "c"),
      ],
      3,
    );
    const talk = beginConversation(reed);
    const text = talk.lines.join(" ");
    expect(text).toMatch(/Moon Shrine/i);
    expect(text).toMatch(/Horizon/i);
    expect(text).not.toMatch(GATE_LORE);
  });

  it("does not claim both sovereigns walk with you after they were fused", () => {
    beginConversation(reed);
    setTideSovereignObtained(1, false);
    setCairnSovereignObtained(1, false);
    setHorizonFusionCount(1, false);
    setPartyFromSnapshot([sovereign(HORIZON_SOVEREIGN_ID, "h")], 2);
    const talk = beginConversation(reed);
    const text = talk.lines.join(" ");
    expect(text).toMatch(/second joining/i);
    expect(text).toMatch(/Moon Shrine/i);
    expect(text).not.toMatch(/Tide and Stone walk with you/i);
    expect(text).not.toMatch(/Win its respect/i);
    expect(text).not.toMatch(/fuse them into Horizon/i);
    expect(text).not.toMatch(GATE_LORE);
  });

  it("does not treat lifetime claims as current ownership", () => {
    beginConversation(reed);
    setTideSovereignObtained(1, false);
    setCairnSovereignObtained(1, false);
    setPartyFromSnapshot([], 1);
    const talk = beginConversation(reed);
    const text = talk.lines.join(" ");
    expect(text).not.toMatch(/walk with you/i);
    expect(text).not.toMatch(/fuse them into Horizon/i);
  });

  it("does not send the player hunting after Horizon fusions are capped", () => {
    beginConversation(reed);
    setTideSovereignObtained(2, false);
    setCairnSovereignObtained(2, false);
    setHorizonFusionCount(2, false);
    setPartyFromSnapshot([sovereign(HORIZON_SOVEREIGN_ID, "h1"), sovereign(HORIZON_SOVEREIGN_ID, "h2")], 3);
    const talk = beginConversation(reed);
    const text = talk.lines.join(" ");
    expect(text).toMatch(/finished|already answers/i);
    expect(text).not.toMatch(/Win its respect/i);
    expect(text).not.toMatch(/fuse them into Horizon/i);
    expect(text).not.toMatch(GATE_LORE);
  });

  it("does not teach a new Horizon braid on first meeting after the cap", () => {
    setTideSovereignObtained(2, false);
    setCairnSovereignObtained(2, false);
    setHorizonFusionCount(2, false);
    setPartyFromSnapshot(
      [sovereign(HORIZON_SOVEREIGN_ID, "h1"), sovereign(HORIZON_SOVEREIGN_ID, "h2")],
      3,
    );
    const first = beginConversation(reed);
    const text = first.lines.join(" ");
    expect(text).toMatch(/finished|already answers/i);
    expect(text).not.toMatch(/braid them into Horizon/i);
    expect(text).not.toMatch(GATE_LORE);
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
