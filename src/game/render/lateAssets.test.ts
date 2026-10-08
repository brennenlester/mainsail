import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { HEARTH_LOTS_BOARD_TEXTURE } from "../minigames/hearthLots";
import {
  LATE_CREATURE_IDS,
  LATE_IMAGES,
  isLateImageKey,
  lateCreatureKeys,
} from "./lateAssets";

const PUBLIC = path.resolve(__dirname, "../../../public");

describe("late-game images (#410)", () => {
  it("points every late key at a file that exists", () => {
    for (const url of Object.values(LATE_IMAGES)) {
      expect(fs.existsSync(path.join(PUBLIC, url)), url).toBe(true);
    }
  });

  it("covers the four sovereigns and the Hearth Lots board", () => {
    for (const id of LATE_CREATURE_IDS) {
      expect(isLateImageKey(getCreatureDefinition(id).spriteKey)).toBe(true);
    }
    expect(isLateImageKey(HEARTH_LOTS_BOARD_TEXTURE)).toBe(true);
  });

  it("maps creature ids to late keys, ignoring atlas creatures", () => {
    expect(lateCreatureKeys(["mossling", "tide-sovereign", "tide-sovereign"])).toEqual([
      "creature-tide-sovereign",
    ]);
    expect(lateCreatureKeys([])).toEqual([]);
  });
});
