import { describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget } from "../creatures/folkloreTypes";
import {
  OPENING_ENCOUNTERS,
  openingPersonalityLine,
  pickOpeningEncounter,
} from "./openingScript";

describe("opening script data", () => {
  it("every beat names a real creature with a one-line personality", () => {
    for (const beat of OPENING_ENCOUNTERS) {
      expect(getCreatureDefinition(beat.creatureId).id).toBe(beat.creatureId);
      expect(beat.personality.length).toBeGreaterThan(0);
      expect(beat.personality).not.toMatch(/\n/);
      expect(beat.personality.length).toBeLessThanOrEqual(80);
    }
  });

  it("the first-spar foe is the Mossling's prey (one matchup taught)", () => {
    const spar = OPENING_ENCOUNTERS.find((b) => b.id === "first-spar")!;
    const moss = getCreatureDefinition("mossling").folkloreType;
    expect(getHunterTarget(moss)).toBe(getCreatureDefinition(spar.creatureId).folkloreType);
  });
});

describe("pickOpeningEncounter", () => {
  it("scripts the first meet while Story 1 is active in the grove", () => {
    expect(
      pickOpeningEncounter({ activeQuestId: "first-befriend", zoneId: "grove" })?.creatureId,
    ).toBe("mossling");
  });

  it("does nothing outside the beat's zone or quest", () => {
    expect(pickOpeningEncounter({ activeQuestId: "first-befriend", zoneId: "shrine" })).toBeNull();
    expect(pickOpeningEncounter({ activeQuestId: "reach-village", zoneId: "grove" })).toBeNull();
    expect(pickOpeningEncounter({ activeQuestId: null, zoneId: "grove" })).toBeNull();
  });

  it("never scripts encounters for visitors", () => {
    expect(
      pickOpeningEncounter({ activeQuestId: "first-befriend", zoneId: "grove", visitor: true }),
    ).toBeNull();
  });

  it("scripts the first spar only when the lead hunts the foe", () => {
    expect(
      pickOpeningEncounter({ activeQuestId: "first-spar", zoneId: "grove", leadType: "woodland" })
        ?.creatureId,
    ).toBe("peat-sprite");
    expect(
      pickOpeningEncounter({ activeQuestId: "first-spar", zoneId: "grove", leadType: "hearth" }),
    ).toBeNull();
    expect(pickOpeningEncounter({ activeQuestId: "first-spar", zoneId: "grove" })).toBeNull();
  });
});

describe("openingPersonalityLine", () => {
  it("returns the line only while that creature's beat is active", () => {
    expect(openingPersonalityLine("mossling", "first-befriend")).toMatch(/hum/i);
    expect(openingPersonalityLine("mossling", "shrine-craft")).toBeNull();
    expect(openingPersonalityLine("ember-wisp", "first-befriend")).toBeNull();
  });
});
