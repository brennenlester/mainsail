import { beforeEach, describe, expect, it } from "vitest";
import {
  CAIRN_ISLAND_INDEX,
  CAIRN_LANDMARK_LOCAL,
} from "./cairnIsland";
import { HERMIT_ISLAND_INDEX } from "./hermitIsland";
import {
  cairnLandmarkWorld,
  getArchipelagoProps,
  islandTemplateAtIndex,
  resetArchipelagoStream,
} from "./archipelagoStream";
import { QUESTS } from "../story/quests";

beforeEach(() => {
  resetArchipelagoStream();
});

describe("cairn island placement (#319)", () => {
  it("places the stone isle directly south of the hermit island", () => {
    const hermit = islandTemplateAtIndex(HERMIT_ISLAND_INDEX);
    const cairn = islandTemplateAtIndex(CAIRN_ISLAND_INDEX);
    expect(cairn.col).toBe(hermit.col);
    expect(cairn.row).toBe(hermit.row + 1);
    expect(cairn.x).toBe(hermit.x);
    expect(cairn.y).toBeGreaterThan(hermit.y);
  });

  it("stamps a standing-stone cairn landmark on the stone isle", () => {
    const landmark = cairnLandmarkWorld();
    const props = getArchipelagoProps();
    expect(
      props.some(
        (p) =>
          p.x === landmark.x &&
          p.y === landmark.y &&
          p.kind === "standing-stone",
      ),
    ).toBe(true);
    const island = islandTemplateAtIndex(CAIRN_ISLAND_INDEX);
    expect(landmark).toEqual({
      x: island.x + CAIRN_LANDMARK_LOCAL.dx,
      y: island.y + CAIRN_LANDMARK_LOCAL.dy,
    });
  });

  it("points the obtain-cairn-sovereign hint south from the hermit", () => {
    const quest = QUESTS["obtain-cairn-sovereign"];
    expect(quest?.hint).toMatch(/south/i);
    expect(quest?.hint).not.toMatch(/east of the hermit/i);
  });
});
