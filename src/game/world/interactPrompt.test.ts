import { describe, expect, it } from "vitest";
import { findGatherPropNearPlayer } from "./gatherNodes";
import {
  INTERACT_PROMPT_PRIORITY,
  overlayAction,
  pickInteractPrompt,
} from "./interactPrompt";
import { findNearbyDoor, isNearShrine } from "./interactProximity";
import { getZone } from "./zones";

describe("pickInteractPrompt", () => {
  it("returns exactly one label in shrine → door → gate → minigame → npc → dock → sailing → gather order", () => {
    const picked = pickInteractPrompt({
      shrine: "Press E — Moon Shrine",
      door: "Press E — Weaver's Cottage",
      gather: "Press E — Collect pebbles",
    });
    expect(picked).toEqual({
      kind: "shrine",
      label: "Press E — Moon Shrine",
    });
  });

  it("picks door over gather when both sit on the same village tile", () => {
    const village = getZone("village");
    const door = findNearbyDoor(village, 13, 2);
    const gather = findGatherPropNearPlayer("village", 13, 2);
    expect(door?.label).toBe("Weaver's Cottage");
    expect(gather?.kind).toBe("pebble-pile");
    expect(
      pickInteractPrompt({
        door: `Press E — ${door?.label}`,
        gather: `Press E — ${gather?.action.prompt}`,
      })?.kind,
    ).toBe("door");
  });

  it("picks shrine over gather on the shrine pebble-pile tile", () => {
    const shrine = getZone("shrine");
    expect(isNearShrine(shrine, 6, 6)).toBe(true);
    const gather = findGatherPropNearPlayer("shrine", 6, 6);
    expect(gather?.kind).toBe("pebble-pile");
    expect(
      pickInteractPrompt({
        shrine: "Press E — Moon Shrine",
        gather: `Press E — ${gather?.action.prompt}`,
      })?.kind,
    ).toBe("shrine");
  });

  it("hides when nothing is in range", () => {
    expect(pickInteractPrompt({})).toBeUndefined();
  });

  it("lets each earlier kind beat the next in INTERACT_PROMPT_PRIORITY", () => {
    const labels = {
      shrine: "Press E — Moon Shrine",
      door: "Press E — Weaver's Cottage",
      gate: "Press E — Cottage gate",
      minigame: "Press E — Hearth Lots",
      npc: "Press E — Talk to Odd",
      dock: "Press E — Board boat",
      sailing: "Sailing",
      gather: "Press E — Collect pebbles",
    } as const;
    expect(INTERACT_PROMPT_PRIORITY).toEqual([
      "shrine",
      "door",
      "gate",
      "minigame",
      "npc",
      "dock",
      "sailing",
      "gather",
    ]);
    for (let i = 0; i < INTERACT_PROMPT_PRIORITY.length - 1; i += 1) {
      const earlier = INTERACT_PROMPT_PRIORITY[i];
      const later = INTERACT_PROMPT_PRIORITY[i + 1];
      expect(
        pickInteractPrompt({
          [earlier]: labels[earlier],
          [later]: labels[later],
        })?.kind,
        `${earlier} should beat ${later}`,
      ).toBe(earlier);
    }
  });
});

describe("overlayAction", () => {
  it("creates, reuses, and destroys a single overlay", () => {
    expect(overlayAction(false, undefined)).toBe("idle");
    expect(overlayAction(false, "Press E — Moon Shrine")).toBe("create");
    expect(overlayAction(true, "Press E — Moon Shrine")).toBe("update");
    expect(overlayAction(true, "Press E — Weaver's Cottage")).toBe("update");
    expect(overlayAction(true, undefined)).toBe("destroy");
  });
});
