import { describe, expect, it } from "vitest";
import {
  BASE,
  battleLayout,
  battleLayoutMode,
  battleView,
  cssSize,
  gridMoves,
  type Rect,
} from "./battleLayout";

const SIZES = [
  { name: "desktop", w: 1280, h: 800, mode: "wide" },
  { name: "phone", w: 390, h: 844, mode: "portrait" },
  { name: "phone landscape", w: 844, h: 390, mode: "side" },
  { name: "small phone", w: 320, h: 568, mode: "portrait" },
] as const;

const inside = (r: Rect, v: Rect): boolean =>
  r.x >= v.x - 0.5 && r.y >= v.y - 0.5 && r.x + r.w <= v.x + v.w + 0.5 && r.y + r.h <= v.y + v.h + 0.5;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

describe("battleView", () => {
  it("keeps the stage aspect and the 640 core on the short axis", () => {
    const portrait = battleView(390, 844);
    expect(portrait.w).toBe(640);
    expect(portrait.h / portrait.w).toBeCloseTo(844 / 390, 5);
    const wide = battleView(1280, 800);
    expect(wide.h).toBe(640);
    expect(wide.w / wide.h).toBeCloseTo(1.6, 5);
    // Core stays centred so 0..640 art still lands mid-stage.
    expect(wide.x + wide.w / 2).toBeCloseTo(320, 5);
  });

  it("picks portrait / wide / side by stage shape", () => {
    for (const s of SIZES) {
      expect(battleLayoutMode(s.w, s.h)).toBe(s.mode);
    }
  });
});

describe("battleLayout", () => {
  for (const s of SIZES) {
    for (const story of [false, true]) {
      it(`${s.name}${story ? " (story)" : ""}: chrome fits the view, touch targets >= 44 CSS px`, () => {
        const l = battleLayout({ stageW: s.w, stageH: s.h, moveCount: 4, story });
        const all = [l.foePlate, l.playerPlate, l.log, ...l.moves, ...l.aux, l.auxSingle];
        for (const r of all) {
          expect(inside(r, l.view)).toBe(true);
        }
        expect(l.moves).toHaveLength(4);
        for (const card of l.moves) {
          expect(cssSize(l, card.h)).toBeGreaterThanOrEqual(44);
        }
        for (const button of l.aux) {
          expect(cssSize(l, button.h)).toBeGreaterThanOrEqual(44);
        }
        // Sublabels read at >= 11 CSS px.
        expect(BASE.subFont * l.ui * l.unit).toBeGreaterThanOrEqual(11);
        // Cards never overlap each other or the buttons.
        const pieces = [...l.moves, ...l.aux, l.log];
        for (let i = 0; i < pieces.length; i++) {
          for (let j = i + 1; j < pieces.length; j++) {
            expect(overlaps(pieces[i]!, pieces[j]!)).toBe(false);
          }
        }
        // Plates sit above the arena, and the arena above / beside the sheet.
        expect(l.playerPlate.y + l.playerPlate.h).toBeLessThanOrEqual(l.arenaRegion.y);
        if (l.mode === "side") {
          expect(l.arenaRegion.x + l.arenaRegion.w).toBeLessThanOrEqual(l.sheet.x);
        } else {
          expect(l.arenaRegion.y + l.arenaRegion.h).toBeLessThanOrEqual(l.sheet.y + 0.5);
        }
      });
    }
  }

  it("phone portrait: arena fills the width with big creatures and a 2x2 move sheet", () => {
    const l = battleLayout({ stageW: 390, stageH: 844, moveCount: 4 });
    expect(l.cs).toBeGreaterThan(1.4);
    const [a, b, c, d] = l.moves;
    expect(a!.y).toBe(b!.y);
    expect(c!.y).toBe(d!.y);
    expect(c!.y).toBeGreaterThan(a!.y);
    // Sheet hugs the bottom of the view.
    expect(l.aux[0].y + l.aux[0].h).toBeGreaterThan(l.view.h - 30);
    // Plates at the top.
    expect(l.playerPlate.y).toBeLessThan(l.view.h * 0.15);
  });

  it("desktop: arena composition is centred and fills the height", () => {
    const l = battleLayout({ stageW: 1280, stageH: 800, moveCount: 4 });
    expect(l.view.h).toBe(640);
    expect(l.dais.x).toBeCloseTo(320, 0);
    expect(l.moves[0]!.y).toBe(l.moves[3]!.y);
  });

  it("homes stay inside the arena region at every size", () => {
    for (const s of SIZES) {
      const l = battleLayout({ stageW: s.w, stageH: s.h, moveCount: 4 });
      for (const home of [l.wildHome, l.playerHome]) {
        expect(home.x).toBeGreaterThan(l.arenaRegion.x);
        expect(home.x).toBeLessThan(l.arenaRegion.x + l.arenaRegion.w);
        expect(home.y).toBeLessThanOrEqual(l.arenaRegion.y + l.arenaRegion.h);
      }
    }
  });
});

describe("gridMoves", () => {
  it("lays 4 as 2x2, 5 as 3+2, 1-2 stacked full width", () => {
    expect(gridMoves(0, 0, 100, 10, 0, 4).map((r) => [r.x, r.y])).toEqual([
      [0, 0],
      [50, 0],
      [0, 10],
      [50, 10],
    ]);
    expect(gridMoves(0, 0, 90, 10, 0, 5).filter((r) => r.y === 0)).toHaveLength(3);
    expect(gridMoves(0, 0, 100, 10, 0, 1)[0]!.w).toBe(100);
    expect(gridMoves(0, 0, 100, 10, 0, 2).map((r) => r.y)).toEqual([0, 10]);
  });
});
