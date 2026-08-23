import { beforeEach, describe, expect, it } from "vitest";
import { HUNTER_MULTIPLIER } from "../creatures/folkloreTypes";
import {
  getActiveQuestId,
  initQuestProgress,
  restoreQuestProgress,
} from "../story/questProgress";
import { QUEST_ORDER, QUESTS } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { setVisitorMode } from "../world/worldSession";
import { setOverworldUnlocked } from "../world/worldState";
import {
  formatHunterMatchupTeach,
  formatHunterMultiplierLabel,
  isHunterMatchupTeachActive,
} from "./hunterMatchupTeach";

function lockedProgress(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
}

describe("hunter matchup teach (#269)", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setOverworldUnlocked(false);
    restoreQuestProgress(lockedProgress());
    initQuestProgress();
  });

  it("Story 2 hint names the hunter mechanic and advertised multiplier", () => {
    const hint = QUESTS["first-spar"].hint;
    expect(hint.toLowerCase()).toContain("hunter");
    expect(hint).toContain(formatHunterMultiplierLabel());
    expect(hint.toLowerCase()).not.toBe(
      "trigger an encounter, choose spar, and win — this opens the overworld gate.",
    );
  });

  it("teaching surface gates on active first-spar (incl. mid-Story-2 resume)", () => {
    expect(isHunterMatchupTeachActive()).toBe(false);

    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "active",
    });
    expect(getActiveQuestId()).toBe("first-spar");
    expect(isHunterMatchupTeachActive()).toBe(true);

    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "active",
    });
    expect(isHunterMatchupTeachActive()).toBe(false);

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
    });
    expect(isHunterMatchupTeachActive()).toBe(false);
  });

  it("pre-move teach names hunter relationship for the active types", () => {
    const advantage = formatHunterMatchupTeach("ember", "woodland");
    expect(advantage.toLowerCase()).toContain("hunter");
    expect(advantage).toContain("ember");
    expect(advantage).toContain("woodland");
    expect(advantage).toContain(formatHunterMultiplierLabel());
    expect(advantage.toLowerCase()).toContain("advantage");

    const neutral = formatHunterMatchupTeach("ember", "water");
    expect(neutral.toLowerCase()).toContain("hunter");
    expect(neutral).toContain("woodland");
    expect(neutral).toContain("water");
    expect(neutral).toContain(formatHunterMultiplierLabel());
  });

  it("advertised multiplier equals folkloreTypes HUNTER_MULTIPLIER", () => {
    expect(HUNTER_MULTIPLIER).toBe(1.5);
    expect(formatHunterMultiplierLabel()).toBe(`×${HUNTER_MULTIPLIER}`);
    expect(QUESTS["first-spar"].hint).toContain(`×${HUNTER_MULTIPLIER}`);
    expect(formatHunterMatchupTeach("water", "ember")).toContain(
      `×${HUNTER_MULTIPLIER}`,
    );
  });
});
