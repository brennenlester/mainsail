import { beforeEach, describe, expect, it } from "vitest";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { applyWorldSnapshot, exportWorldSnapshot } from "../world/worldSnapshot";
import { setVisitorMode } from "../world/worldSession";
import { worldState } from "../world/worldState";
import { claimFinaleCard } from "./finaleTrigger";

describe("claimFinaleCard (#399)", () => {
  beforeEach(() => {
    setVisitorMode(false);
    worldState.storyFinaleCardShown = false;
  });

  it("claims the card exactly once", () => {
    expect(claimFinaleCard()).toBe(true);
    expect(claimFinaleCard()).toBe(false);
    expect(claimFinaleCard()).toBe(false);
  });

  it("stays claimed across a save / reload, so a replayed shrine scene never re-shows it", () => {
    expect(claimFinaleCard()).toBe(true);
    const saved = exportWorldSnapshot({ zoneId: "shrine", x: 5, y: 5 });
    expect(saved.storyFinaleCardShown).toBe(true);
    worldState.storyFinaleCardShown = false;
    applyWorldSnapshot(saved);
    expect(claimFinaleCard()).toBe(false);
  });

  it("is unclaimed on a save that predates the flag", () => {
    const questProgress = Object.fromEntries(
      QUEST_ORDER.map((id) => [id, "locked" as const]),
    ) as Record<QuestId, QuestStatus>;
    questProgress["first-befriend"] = "active";
    worldState.storyFinaleCardShown = true;
    applyWorldSnapshot({
      version: 1,
      hostLabel: "host",
      overworldUnlocked: false,
      questProgress,
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      position: { zoneId: "grove", x: 5, y: 5 },
    });
    expect(claimFinaleCard()).toBe(true);
  });
});
