import { afterEach, describe, expect, it } from "vitest";
import {
  HP_PIP_SEGMENTS,
  hpPipFillCount,
  hpPipState,
  renderPartyHpHud,
} from "./partyHpHud";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";

function member(
  overrides: Partial<CreatureInstance> &
    Pick<CreatureInstance, "instanceId" | "currentHp">,
): CreatureInstance {
  const definitionId = overrides.definitionId ?? "mossling";
  return {
    definitionId,
    speciesId: definitionId,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

describe("hpPipState / hpPipFillCount", () => {
  it("classifies full, hurt, and fainted", () => {
    expect(hpPipState(28, 28)).toBe("full");
    expect(hpPipState(14, 28)).toBe("hurt");
    expect(hpPipState(0, 28)).toBe("fainted");
  });

  it("maps living HP to at least one filled pip and fainted to zero", () => {
    expect(hpPipFillCount(1, 28)).toBe(1);
    expect(hpPipFillCount(28, 28)).toBe(HP_PIP_SEGMENTS);
    expect(hpPipFillCount(0, 28)).toBe(0);
  });

  it("keeps near-full hurt below a full pip row", () => {
    expect(hpPipFillCount(27, 28)).toBe(HP_PIP_SEGMENTS - 1);
    expect(hpPipState(27, 28)).toBe("hurt");
  });
});

describe("renderPartyHpHud", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    setPartyFromSnapshot([], 1, []);
  });

  it("renders one pip row per active member and none for reserve", () => {
    setPartyFromSnapshot(
      [
        member({ instanceId: "a", currentHp: 28 }),
        member({
          instanceId: "b",
          definitionId: "stone-hound",
          currentHp: 10,
        }),
        member({
          instanceId: "c",
          definitionId: "isle-fernling",
          currentHp: 0,
        }),
      ],
      4,
      ["a", "b"],
    );
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderPartyHpHud(el);

    const rows = el.querySelectorAll(".party-hp-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("data-hp-state")).toBe("full");
    expect(rows[1]?.getAttribute("data-hp-state")).toBe("hurt");
    expect(el.querySelector(".party-hp-reserve")?.textContent).toBe(
      "Reserve ×1",
    );
    expect(rows[0]?.querySelectorAll(".hp-pip--filled")).toHaveLength(
      HP_PIP_SEGMENTS,
    );
    expect(rows[1]?.querySelectorAll(".hp-pip--filled").length).toBeGreaterThan(
      0,
    );
    expect(rows[1]?.querySelectorAll(".hp-pip--empty").length).toBeGreaterThan(
      0,
    );
  });

  it("marks fainted rows with fainted-shaped pips only", () => {
    setPartyFromSnapshot(
      [member({ instanceId: "a", currentHp: 0 })],
      2,
      ["a"],
    );
    const el = document.createElement("div");
    renderPartyHpHud(el);
    const row = el.querySelector(".party-hp-row");
    expect(row?.getAttribute("data-hp-state")).toBe("fainted");
    expect(row?.querySelectorAll(".hp-pip--fainted")).toHaveLength(
      HP_PIP_SEGMENTS,
    );
    expect(row?.querySelectorAll(".hp-pip--filled")).toHaveLength(0);
  });

  it("shows the nickname, falling back to the species name (#401)", () => {
    setPartyFromSnapshot(
      [
        member({ instanceId: "a", currentHp: 28, nickname: "Sprout" }),
        member({ instanceId: "b", definitionId: "stone-hound", currentHp: 28 }),
      ],
      3,
      ["a", "b"],
    );
    const el = document.createElement("div");
    renderPartyHpHud(el);
    const names = [...el.querySelectorAll(".party-hp-name")].map((n) => n.textContent);
    expect(names).toEqual(["Sprout", "Stone Hound"]);
  });

  it("fits seven active rows without omitting any", () => {
    const creatures = Array.from({ length: 7 }, (_, i) =>
      member({
        instanceId: `c-${i}`,
        currentHp: 28 - i * 3,
      }),
    );
    setPartyFromSnapshot(
      creatures,
      8,
      creatures.map((c) => c.instanceId),
    );
    const el = document.createElement("div");
    renderPartyHpHud(el);
    expect(el.querySelectorAll(".party-hp-row")).toHaveLength(7);
  });
});
