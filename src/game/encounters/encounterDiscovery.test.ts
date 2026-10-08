import { beforeEach, describe, expect, it } from "vitest";
import { discoverOnEncounter } from "./encounterDiscovery";
import { worldState } from "../world/worldState";

beforeEach(() => {
  worldState.discoveredCreatures.length = 0;
});

describe("discoverOnEncounter", () => {
  it("records the creature at encounter start, before any reveal or flee", () => {
    expect(discoverOnEncounter("thunder-finch")).toBe(true);
    expect(worldState.discoveredCreatures).toContain("thunder-finch");
  });

  it("does not duplicate on repeat encounters", () => {
    discoverOnEncounter("thunder-finch");
    discoverOnEncounter("thunder-finch");
    expect(worldState.discoveredCreatures.filter((id) => id === "thunder-finch")).toHaveLength(1);
  });

  it("skips codex-excluded creatures", () => {
    expect(discoverOnEncounter("tide-sovereign")).toBe(false);
    expect(worldState.discoveredCreatures).not.toContain("tide-sovereign");
  });
});
