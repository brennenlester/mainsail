import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PATTERN_GLYPHS } from "../crafting/recipes";
import {
  getIngredientIconSrc,
  getItemIconSrc,
  getMaterialIconSrc,
  ITEM_NAMES,
  MATERIAL_NAMES,
} from "./materials";

describe("ingredient icon paths", () => {
  it("maps every catalog material to a public PNG path", () => {
    for (const id of Object.keys(MATERIAL_NAMES)) {
      const src = getMaterialIconSrc(id);
      expect(src).toBeDefined();
      expect(src!.endsWith(`assets/materials/${id}.png`)).toBe(true);
      expect(src!.startsWith(import.meta.env.BASE_URL)).toBe(true);
    }
  });

  it("maps every catalog item to a public PNG path", () => {
    for (const id of Object.keys(ITEM_NAMES)) {
      const src = getItemIconSrc(id);
      expect(src).toBeDefined();
      expect(src!.endsWith(`assets/items/${id}.png`)).toBe(true);
      expect(src!.startsWith(import.meta.env.BASE_URL)).toBe(true);
    }
  });

  it("resolves materials and items through getIngredientIconSrc", () => {
    expect(getIngredientIconSrc("wood")).toContain("assets/materials/wood.png");
    expect(getIngredientIconSrc("boat")).toContain("assets/items/boat.png");
  });

  it("covers every recipe glyph", () => {
    for (const id of Object.values(PATTERN_GLYPHS)) {
      expect(getIngredientIconSrc(id)).toBeDefined();
    }
  });

  it("returns undefined for unknown ids", () => {
    expect(getMaterialIconSrc("unknown-mat")).toBeUndefined();
    expect(getItemIconSrc("unknown-item")).toBeUndefined();
    expect(getIngredientIconSrc("not-in-catalog")).toBeUndefined();
  });

  it("has a PNG on disk for every catalog id", () => {
    const root = process.cwd();
    for (const id of Object.keys(MATERIAL_NAMES)) {
      expect(
        existsSync(path.join(root, "public/assets/materials", `${id}.png`)),
      ).toBe(true);
    }
    for (const id of Object.keys(ITEM_NAMES)) {
      expect(
        existsSync(path.join(root, "public/assets/items", `${id}.png`)),
      ).toBe(true);
    }
  });
});
