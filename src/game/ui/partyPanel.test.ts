import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeParty,
  creatureCardLabel,
  hpBarState,
  openParty,
  setPartyEditLocked,
} from "./partyPanel";
import {
  ACTIVE_PARTY_LIMIT,
  getActiveCreatures,
  getReserveCreatures,
  setPartyFromSnapshot,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { setVisitorMode } from "../world/worldSession";
import { resetOverlayStack } from "./overlayStack";

function member(overrides: Partial<CreatureInstance> & Pick<CreatureInstance, "instanceId">): CreatureInstance {
  return {
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 20,
    level: 4,
    xp: 0,
    ...overrides,
  };
}

function seed(creatures: CreatureInstance[]): void {
  setPartyFromSnapshot(creatures, creatures.length + 1);
}

function cards(listId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`#${listId} .party-card`));
}

describe("hpBarState", () => {
  it("buckets by fraction and flags fainted", () => {
    expect(hpBarState(0, 20)).toBe("fainted");
    expect(hpBarState(20, 20)).toBe("healthy");
    expect(hpBarState(10, 20)).toBe("hurt");
    expect(hpBarState(3, 20)).toBe("low");
  });
});

describe("party panel cards", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setPartyEditLocked(false);
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
  });

  afterEach(() => {
    closeParty();
    resetOverlayStack();
    document.body.replaceChildren();
  });

  it("shows name (displayName), level, type chip, HP bar and bond hearts per creature", () => {
    seed([
      member({ instanceId: "a", nickname: "Sir Mossington", level: 7, bond: 55 }),
      member({ instanceId: "b", definitionId: "ember-wisp", speciesId: "ember-wisp", currentHp: 5 }),
    ]);
    openParty();
    const [first, second] = cards("party-active-list");
    expect(first?.querySelector(".party-card-name")?.textContent).toBe("Sir Mossington");
    expect(first?.querySelector(".party-level")?.textContent).toBe("Lv 7");
    expect(first?.querySelector(".party-chip")?.textContent).toBe("woodland");
    expect(first?.querySelector<HTMLElement>(".party-chip")?.dataset.type).toBe("woodland");
    // bond 55 = tier 2 (Close): 3 filled hearts of 5.
    expect(first?.querySelector(".party-hearts")?.textContent).toBe("♥♥♥♥♥");
    expect(first?.querySelector(".party-heart-empty")?.textContent).toBe("♥♥");
    // Un-nicknamed creatures fall back to the species name.
    expect(second?.querySelector(".party-card-name")?.textContent).toBe("Ember Wisp");
    expect(second?.querySelector(".party-card-hp-text")?.textContent).toMatch(/^5\//);
    expect(second?.querySelector<HTMLElement>(".party-card-hp")?.dataset.state).toBe("low");
    expect(second?.querySelector<HTMLElement>(".party-card-hp-fill")?.style.width).toMatch(/%$/);
  });

  it("renders hostile nicknames as text, never markup", () => {
    seed([member({ instanceId: "a", nickname: "<img src=x onerror=alert(1)>" })]);
    openParty();
    expect(document.querySelector("#party-active-list img")).toBeNull();
    expect(document.querySelector(".party-card-name")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("keeps a11y labels: a spoken summary, pressed state, and a rename button per card", () => {
    seed([member({ instanceId: "a", nickname: "Sprout", level: 3, currentHp: 0 })]);
    openParty();
    const main = document.querySelector<HTMLButtonElement>(".party-creature-btn")!;
    expect(main.getAttribute("aria-label")).toBe(creatureCardLabel(getActiveCreatures()[0]!));
    expect(main.getAttribute("aria-label")).toContain("Sprout");
    expect(main.getAttribute("aria-label")).toContain("level 3");
    expect(main.getAttribute("aria-label")).toContain("fainted");
    expect(main.getAttribute("aria-pressed")).toBe("false");
    main.click();
    expect(document.querySelector(".party-creature-btn")?.getAttribute("aria-pressed")).toBe("true");
    const rename = document.querySelector<HTMLButtonElement>(".party-card-rename")!;
    expect(rename.getAttribute("aria-label")).toBe("Rename Sprout");
    expect(document.getElementById("party-close")?.getAttribute("aria-label")).toBe("Close");
  });

  it("still swaps active and reserve creatures from the cards", () => {
    const creatures = Array.from({ length: ACTIVE_PARTY_LIMIT + 1 }, (_, i) => member({ instanceId: `c-${i}` }));
    seed(creatures);
    openParty();
    expect(cards("party-reserve-list")).toHaveLength(1);
    const swap = document.getElementById("party-swap") as HTMLButtonElement;
    expect(swap.disabled).toBe(true);
    cards("party-active-list")[0]!.querySelector<HTMLButtonElement>(".party-creature-btn")!.click();
    cards("party-reserve-list")[0]!.querySelector<HTMLButtonElement>(".party-creature-btn")!.click();
    expect((document.getElementById("party-swap") as HTMLButtonElement).disabled).toBe(false);
    (document.getElementById("party-swap") as HTMLButtonElement).click();
    expect(getReserveCreatures()[0]?.instanceId).toBe("c-0");
    expect(getActiveCreatures().map((c) => c.instanceId)).toContain(`c-${ACTIVE_PARTY_LIMIT}`);
  });

  it("promotes and demotes through the action buttons", () => {
    seed([member({ instanceId: "a" }), member({ instanceId: "b" })]);
    openParty();
    cards("party-active-list")[1]!.querySelector<HTMLButtonElement>(".party-creature-btn")!.click();
    (document.getElementById("party-demote") as HTMLButtonElement).click();
    expect(getReserveCreatures().map((c) => c.instanceId)).toEqual(["b"]);
    cards("party-reserve-list")[0]!.querySelector<HTMLButtonElement>(".party-creature-btn")!.click();
    (document.getElementById("party-promote") as HTMLButtonElement).click();
    expect(getReserveCreatures()).toHaveLength(0);
  });

  it("disables selection and rename for visitors", () => {
    seed([member({ instanceId: "a" })]);
    setVisitorMode(true);
    openParty();
    expect(document.querySelector<HTMLButtonElement>(".party-creature-btn")?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>(".party-card-rename")?.disabled).toBe(true);
  });

  it("keeps the Gift and Rename actions in the detail card", () => {
    seed([member({ instanceId: "a", nickname: "Sprout" })]);
    openParty();
    const labels = Array.from(document.querySelectorAll("#party-detail button")).map((b) => b.textContent);
    expect(labels.some((l) => l?.startsWith("Gift"))).toBe(true);
    expect(labels).toContain("Rename");
  });
});
