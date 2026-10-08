import { beforeEach, describe, expect, it } from "vitest";
import { setPartyFromSnapshot } from "../creatures/party";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import {
  initQuestProgress,
  restoreQuestProgress,
} from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import {
  buildInviteUrl,
  parseInviteParam,
} from "./invite";
import { setPlacedBoat, setSailing } from "./dockBoat";
import { setVisitorMode } from "./worldSession";
import { setOverworldUnlocked } from "./worldState";

function lockedProgress(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
}

describe("invite encode/decode", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setPlacedBoat(false);
    setSailing(false);
    setOverworldUnlocked(false);
    restoreQuestProgress(lockedProgress());
    initQuestProgress();
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
    setInventoryFromSnapshot({}, {});
    window.history.replaceState({}, "", "/");
  });

  it("invites from a ford islet land the visitor on the shore (#367)", () => {
    setOverworldUnlocked(true);
    const url = new URL(buildInviteUrl("overworld", 3, 14));
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    const result = parseInviteParam();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.snapshot.position).toEqual({ zoneId: "overworld", x: 2, y: 12 });
  });

  it("round-trips a host snapshot through join URL", () => {
    const url = buildInviteUrl("grove", 5, 5);
    expect(url).toContain("join=");

    const parsed = new URL(url);
    window.history.replaceState({}, "", `${parsed.pathname}${parsed.search}`);
    const result = parseInviteParam();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.snapshot.position).toEqual({
      zoneId: "grove",
      x: 5,
      y: 5,
    });
    expect(result.snapshot.party[0]?.definitionId).toBe("mossling");
    expect(result.snapshot.questProgress["first-befriend"]).toBe("active");
  });

  it("marks malformed join payloads invalid", () => {
    window.history.replaceState({}, "", "/?join=not-valid");
    expect(parseInviteParam().status).toBe("invalid");
  });

  it("treats missing join as absent", () => {
    window.history.replaceState({}, "", "/");
    expect(parseInviteParam().status).toBe("absent");
  });

  it("normalizes mid-sail invites onto the pier without sailing", () => {
    setPlacedBoat(true);
    setSailing(true);
    setOverworldUnlocked(true);
    const url = buildInviteUrl("overworld", 6, 14);
    const parsedUrl = new URL(url);
    window.history.replaceState({}, "", `${parsedUrl.pathname}${parsedUrl.search}`);
    const result = parseInviteParam();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.snapshot.sailing).toBe(false);
    expect(result.snapshot.position).toEqual({
      zoneId: "harbor",
      x: 3,
      y: 6,
    });
    expect(result.snapshot.placedBoat).toBe(true);
  });

  it("normalizes on-foot archipelago island invites onto the Harbor pier", () => {
    setPlacedBoat(true);
    setSailing(false);
    setOverworldUnlocked(true);
    // Host standing on the seed lush island pier (NW 9×9 island, pier at ox+4, oy+8).
    const url = buildInviteUrl("archipelago", 14, 18);
    const parsedUrl = new URL(url);
    window.history.replaceState({}, "", `${parsedUrl.pathname}${parsedUrl.search}`);
    const result = parseInviteParam();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.snapshot.sailing).toBe(false);
    expect(result.snapshot.position).toEqual({
      zoneId: "harbor",
      x: 3,
      y: 6,
    });
  });
});
