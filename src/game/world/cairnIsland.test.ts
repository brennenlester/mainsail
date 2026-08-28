import { beforeEach, describe, expect, it } from "vitest";
import {
  CAIRN_ISLAND_FLOOR_TINT,
  CAIRN_ISLAND_INDEX,
  CAIRN_LANDMARK_LOCAL,
} from "./cairnIsland";
import { HERMIT_ISLAND_INDEX } from "./hermitIsland";
import {
  biomeAtIslandTile,
  cairnLandmarkWorld,
  getArchipelagoProps,
  ISLAND_BIOME_FLOOR_TINT,
  ISLAND_WIDTH,
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

  it("uses a flat gray floor and a standing-stone rim", () => {
    const island = islandTemplateAtIndex(CAIRN_ISLAND_INDEX);
    expect(island.biome).toBe("cairn");
    expect(ISLAND_BIOME_FLOOR_TINT.cairn).toBe(CAIRN_ISLAND_FLOOR_TINT);
    expect(biomeAtIslandTile(island.x + 4, island.y + 4)).toBe("cairn");

    const props = getArchipelagoProps().filter(
      (p) =>
        p.x >= island.x &&
        p.x < island.x + ISLAND_WIDTH &&
        p.y >= island.y &&
        p.y < island.y + ISLAND_WIDTH,
    );
    const rimCount = props.filter((p) => {
      const dx = p.x - island.x;
      const dy = p.y - island.y;
      const onRim =
        dx === 0 ||
        dy === 0 ||
        dx === ISLAND_WIDTH - 1 ||
        dy === ISLAND_WIDTH - 1;
      return onRim && p.kind === "standing-stone";
    }).length;
    expect(rimCount).toBe(ISLAND_WIDTH * 4 - 4 - 1);
    expect(props.some((p) => p.kind === "tree" || p.kind === "fern")).toBe(
      false,
    );
  });

  it("points the obtain-cairn-sovereign hint south from the hermit", () => {
    const quest = QUESTS["obtain-cairn-sovereign"];
    expect(quest?.hint).toMatch(/south/i);
    expect(quest?.hint).toMatch(/not east/i);
    expect(quest?.hint).not.toMatch(/east of the hermit/i);
  });
});
