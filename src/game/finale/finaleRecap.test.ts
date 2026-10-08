import { describe, expect, it } from "vitest";
import type { CreatureInstance } from "../creatures/types";
import { effectKey } from "../shrine/shrineEffects";
import {
  buildFinaleRecap,
  FINALE_RECAP_LIMIT,
  finaleShareParty,
  planFinaleLayout,
} from "./finaleRecap";

function c(
  instanceId: string,
  definitionId: string,
  extra: Partial<CreatureInstance> = {},
): CreatureInstance {
  return { instanceId, definitionId, speciesId: definitionId, currentHp: 10, level: 3, xp: 0, ...extra };
}

describe("finale recap (#393)", () => {
  it("builds the credits copy with the player's name", () => {
    const recap = buildFinaleRecap({ playerName: "  Rowan ", party: [c("a", "mossling")] });
    expect(recap.title).toBe("Ivyward");
    expect(recap.tagline).toBe("Thanks for playing");
    expect(recap.heading).toBe("Rowan and companions");
  });

  it("falls back when no name is set", () => {
    expect(buildFinaleRecap({ playerName: null, party: [] }).heading).toBe("You and your companions");
    expect(buildFinaleRecap({ playerName: "", party: [] }).summary).toBe("Your path is still open.");
  });

  it("orders by bond then level and tags growth", () => {
    const party = [
      c("a", "mossling", { level: 9 }),
      c("b", "hearthflame", { speciesId: "ember-wisp", bond: 120, nickname: "Cinder" }),
      c("d", "lantern-fox", { level: 5, appliedEffects: [effectKey("lantern-fox", "fox-fire-charm")] }),
    ];
    const recap = buildFinaleRecap({ playerName: "R", party });
    expect(recap.companions.map((x) => x.instanceId)).toEqual(["b", "a", "d"]);
    const [lead] = recap.companions;
    expect(lead).toMatchObject({ name: "Cinder", speciesName: "Hearthflame", evolved: true, bondName: "Devoted", hearts: 4 });
    expect(recap.companions[2]!.presence).toBe(true);
    expect(recap.summary).toBe("3 companions · 2 grown · deepest bond: Devoted");
  });

  it("caps the recap and reports overflow", () => {
    const party = Array.from({ length: FINALE_RECAP_LIMIT + 2 }, (_, i) => c(`c${i}`, "mossling"));
    const recap = buildFinaleRecap({ playerName: "R", party });
    expect(recap.companions).toHaveLength(FINALE_RECAP_LIMIT);
    expect(recap.overflow).toBe(2);
    expect(finaleShareParty(recap, party)).toHaveLength(FINALE_RECAP_LIMIT);
  });

  it("skips unknown species instead of throwing", () => {
    const recap = buildFinaleRecap({ playerName: "R", party: [c("x", "no-such-creature"), c("a", "mossling")] });
    expect(recap.companions.map((x) => x.instanceId)).toEqual(["a"]);
    expect(recap.summary.startsWith("1 companion ·")).toBe(true);
  });
});

describe("planFinaleLayout (#409)", () => {
  const STAGE = 640;

  it("centres a small party: no empty band, equal room above and below", () => {
    for (const count of [1, 2, 3, 4]) {
      const plan = planFinaleLayout(count, STAGE);
      expect(plan.rows).toBe(1);
      expect(plan.dy).toBeGreaterThan(40);
      // Content bottom (buttons) sits as far from the stage bottom as the title is from the top.
      const bottomGap = STAGE - (plan.buttonsY + 24);
      const topGap = 38 + plan.dy;
      expect(Math.abs(bottomGap - topGap)).toBeLessThanOrEqual(1);
    }
  });

  it("a two-row party nearly fills the card and stays on screen", () => {
    const plan = planFinaleLayout(7, STAGE);
    expect(plan.rows).toBe(2);
    expect(plan.dy).toBeLessThan(25);
    expect(plan.buttonsY + 24).toBeLessThanOrEqual(STAGE);
  });

  it("keeps the summary and buttons below the cells", () => {
    for (const count of [1, 5]) {
      const plan = planFinaleLayout(count, STAGE);
      expect(plan.summaryY).toBeGreaterThan(plan.cellsTop + 150);
      expect(plan.buttonsY).toBeGreaterThan(plan.summaryY);
    }
  });
});
