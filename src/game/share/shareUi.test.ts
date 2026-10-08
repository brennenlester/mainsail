import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setPartyFromSnapshot, playerParty } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { setVisitorMode } from "../world/worldSession";
import { getWildEffectiveLevel, setWildLevelOverride } from "../progression/wildLevel";
import { openCardPreview, playNowUrl, showInvalidCardScreen } from "./cardPreview";
import { ensureChallengerParty, ghostAverageLevel, LOANER_PARTY } from "./challenge";
import { RARE_VARIANT_CHANCE, rareHueShift, rareVariantTint, rollRareVariant } from "./rareVariant";
import { snapshotFromParty, syncShareButton, setShareDisabled } from "./shareActions";
import type { ShareSnapshot } from "./shareCode";
import { isTouchControlsEnabled, setTouchControlsEnabled } from "../ui/touchControls";

const XSS = '<img src=x onerror="window.__pwned=1">';

function creature(overrides: Partial<CreatureInstance>): CreatureInstance {
  return {
    instanceId: "c-1",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 3,
    xp: 0,
    ...overrides,
  };
}

const fakeGame = {
  scene: { isActive: () => false },
} as unknown as Parameters<typeof openCardPreview>[0];

describe("rare variant", () => {
  it("rolls at about 1 in 16", () => {
    expect(RARE_VARIANT_CHANCE).toBeCloseTo(1 / 16);
    expect(rollRareVariant(() => 0.01)).toBe(true);
    expect(rollRareVariant(() => 0.5)).toBe(false);
  });

  it("is deterministic per species and never subtle", () => {
    expect(rareHueShift("mossling")).toBe(rareHueShift("mossling"));
    for (const id of ["mossling", "ember-wisp", "lantern-fox"]) {
      expect(rareHueShift(id)).toBeGreaterThanOrEqual(120);
      expect(rareHueShift(id)).toBeLessThanOrEqual(240);
      expect(rareVariantTint(id)).toBeGreaterThan(0);
      expect(rareVariantTint(id)).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe("snapshotFromParty", () => {
  it("captures level, evolution, rare and caps at 7", () => {
    const party = Array.from({ length: 9 }, (_, i) =>
      creature({ instanceId: `c-${i + 1}`, level: i + 1 }),
    );
    party[0] = creature({ definitionId: "bramblewarden", speciesId: "mossling", rare: true, level: 12 });
    const snap = snapshotFromParty(party, "Ivy", 20_733);
    expect(snap.party).toHaveLength(7);
    expect(snap.party[0]).toEqual({
      id: "bramblewarden",
      level: 12,
      rare: true,
      evolved: true,
      presence: false,
    });
    expect(snap.party[1].evolved).toBe(false);
  });
});

describe("share button visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="share-card-btn" hidden></button>';
    setVisitorMode(false);
    setShareDisabled(false);
  });
  afterEach(() => {
    setVisitorMode(false);
    setShareDisabled(false);
  });

  it("shows only for hosts with a party", () => {
    const btn = document.getElementById("share-card-btn") as HTMLButtonElement;
    setPartyFromSnapshot([], 1);
    syncShareButton();
    expect(btn.hidden).toBe(true);
    setPartyFromSnapshot([creature({})], 2);
    syncShareButton();
    expect(btn.hidden).toBe(false);
    setVisitorMode(true, "x");
    syncShareButton();
    expect(btn.hidden).toBe(true);
    setVisitorMode(false);
    setShareDisabled(true);
    expect(btn.hidden).toBe(true);
  });
});

describe("card preview DOM", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="playfield"></div></div>';
    (window as unknown as { __pwned?: number }).__pwned = undefined;
  });

  it("renders untrusted names as text, never HTML", () => {
    const snapshot: ShareSnapshot = {
      name: XSS,
      day: 20_733,
      party: [{ id: "mossling", level: 2, rare: false, evolved: false, presence: false }],
    };
    openCardPreview(fakeGame, snapshot);
    const root = document.getElementById("card-preview");
    expect(root).not.toBeNull();
    expect(root?.querySelector("img:not(.share-card-img)")).toBeNull();
    expect(root?.querySelector("[onerror]")).toBeNull();
    expect(document.getElementById("card-preview-title")?.textContent).toContain(XSS);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    const labels = [...(root?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["Play now", "Challenge"]);
  });

  it("mutes the game keyboard and clears held keys while a sheet is open", async () => {
    const { openShareSheet } = await import("./shareSheet");
    setTouchControlsEnabled(true);
    let reset = 0;
    const keyboard = { enabled: true };
    const game = {
      input: { keyboard },
      scene: { getScenes: () => [{ input: { keyboard: { resetKeys: () => (reset += 1) } } }] },
    } as unknown as Parameters<typeof openShareSheet>[0]["game"];
    const sheet = openShareSheet({ id: "kb-test", title: "t", imageAlt: "", buttons: [], game });
    expect(keyboard.enabled).toBe(false);
    expect(reset).toBe(1); // held keys cleared on open
    expect(isTouchControlsEnabled()).toBe(false);
    sheet.close();
    expect(keyboard.enabled).toBe(true);
    expect(reset).toBe(2);
    expect(isTouchControlsEnabled()).toBe(true);
  });

  it("drops a card that finishes rendering after the sheet closed", async () => {
    const { openShareSheet } = await import("./shareSheet");
    const sheet = openShareSheet({ id: "late", title: "t", imageAlt: "", buttons: [] });
    sheet.close();
    sheet.showCard(new Blob(["x"], { type: "image/png" }));
    expect(sheet.isOpen()).toBe(false);
    expect(sheet.image.getAttribute("src")).toBeNull();
  });

  it("shows a blocking notice for broken cards", () => {
    showInvalidCardScreen();
    expect(document.getElementById("card-preview-title")?.textContent).toBe(
      "This card link is broken",
    );
  });

  it("Play now drops every query param", () => {
    expect(playNowUrl("https://x.test/game/?card=abc&new=1#h")).toBe("https://x.test/game/");
  });
});

describe("ghost challenge sandbox helpers", () => {
  const ghost: ShareSnapshot = {
    name: "Rival",
    day: 20_733,
    party: [
      { id: "lantern-fox", level: 10, rare: false, evolved: false, presence: false },
      { id: "stone-hound", level: 13, rare: false, evolved: false, presence: false },
    ],
  };

  afterEach(() => setWildLevelOverride(null));

  it("averages ghost levels", () => {
    expect(ghostAverageLevel(ghost)).toBe(12);
  });

  it("lends a save-less challenger a party at the ghost level", () => {
    setPartyFromSnapshot([], 1);
    ensureChallengerParty(ghost);
    expect(playerParty.creatures.map((c) => c.definitionId)).toEqual([...LOANER_PARTY]);
    expect(playerParty.creatures.every((c) => c.level === 12)).toBe(true);
  });

  it("fields reserve-only challengers from their reserve", () => {
    setPartyFromSnapshot([creature({}), creature({ instanceId: "c-2" })], 3, []);
    ensureChallengerParty(ghost);
    expect(playerParty.activeInstanceIds).toEqual(["c-1", "c-2"]);
  });

  it("keeps an existing challenger party untouched", () => {
    setPartyFromSnapshot([creature({ level: 30 })], 2);
    ensureChallengerParty(ghost);
    expect(playerParty.creatures).toHaveLength(1);
  });

  it("pins wild level to the ghost while overridden", () => {
    setPartyFromSnapshot([creature({ level: 2 })], 2);
    setWildLevelOverride(13);
    expect(getWildEffectiveLevel("stone-hound")).toBe(13);
    setWildLevelOverride(999);
    expect(getWildEffectiveLevel("stone-hound")).toBe(50);
    setWildLevelOverride(null);
    expect(getWildEffectiveLevel("stone-hound")).toBeLessThan(13);
  });
});
