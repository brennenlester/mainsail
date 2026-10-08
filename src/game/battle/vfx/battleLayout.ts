/**
 * Full-stage battle layout (#404). Pure math, no Phaser: BattleScene frames
 * `view` with its camera and places everything from these rects.
 *
 * Coordinates are design px. The classic 640 core keeps x = 0..640 (portrait)
 * or y = 0..640 (landscape); the view grows along the stage's long axis so
 * the arena fills the whole stage instead of a letterboxed square.
 *
 * `ui` scales chrome (plates, cards, fonts) so base sizes read at a
 * near-constant CSS size: base px × unit × ui ≈ 0.92 CSS px on phones.
 */

export const CORE = 640;
/** Landscape stages shorter than this (CSS px) get the side command column. */
export const SIDE_MAX_STAGE_H = 520;
/** CSS px per design px is multiplied by ui to reach this many CSS px per base px. */
const UI_CSS_PER_BASE = 0.92;

/** Base (pre-`ui`) sizes shared by the scene's widgets. */
export const BASE = {
  margin: 12,
  gap: 8,
  titleRow: 24,
  plate: { w: 236, h: 60 },
  bossBar: { h: 62 },
  intentRow: 26,
  log: 40,
  card: 70,
  /** Short portrait stages (still two sub-label lines, >= 44 CSS px). */
  tightCard: 60,
  wideCard: 70,
  aux: 50,
  /** Fonts: card sublabel / title. Keep sub ≥ 12 so phones read ≥ 11 CSS px. */
  subFont: 13,
  titleFont: 16,
} as const;

/** Classic arena (s = 1): dais centre to homes, and the creature box. */
const WILD_OFFSET = { x: 137, y: -34 };
const PLAYER_OFFSET = { x: -142, y: 70 };
const CREATURE = { w: 150, h: 163 };
/**
 * Design px kept clear on each side of the arena so the player's art (whose
 * sprite box is wider than CREATURE.w) never touches the stage edge on narrow
 * phones (#409).
 */
const ARENA_EDGE_PAD = 22;
/** Arena layer scale at s = 1 (the art's dais sits at layer y = 240). */
export const ARENA_LAYER_SCALE = 1.18;
export const ARENA_DAIS_LAYER_Y = 240;

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type BattleLayoutMode = "portrait" | "wide" | "side";

export type BattleLayoutInput = {
  /** Stage (canvas) CSS size. */
  stageW: number;
  stageH: number;
  /** Move cards to place (1-5). */
  moveCount: number;
  /** Story battle: a wide boss bar replaces the wild plate. */
  story?: boolean;
  /** Foe art scale (the story boss is drawn larger). */
  foeScale?: number;
};

/** Portrait arenas shorter than this (CSS px) get the tight pass. */
export const TIGHT_ARENA_CSS = 300;

export type BattleLayout = {
  mode: BattleLayoutMode;
  /** Short portrait stage: smaller cards, plate + intent share a row, tips go to the log. */
  tight: boolean;
  /** Design-space rect the camera frames; same aspect as the stage. */
  view: Rect;
  /** CSS px per design px. */
  unit: number;
  /** Chrome scale (base px -> design px). */
  ui: number;
  /** Title / fast toggle row: centre y, left and right edges. */
  topRow: { y: number; left: number; right: number };
  /** Wild plate, or the boss bar on a story battle. */
  foePlate: Rect;
  playerPlate: Rect;
  intent: { y: number; left: number; right: number };
  /** Region the arena composition is fitted into. */
  arenaRegion: Rect;
  dais: Point;
  /** Arena / spacing scale relative to the classic 640 layout. */
  s: number;
  /** Creature display scale (can exceed `s` on narrow, tall stages). */
  cs: number;
  wildHome: Point;
  playerHome: Point;
  /** Backing panel behind log / cards / buttons. */
  sheet: Rect;
  log: Rect;
  moves: Rect[];
  /** Up to two action slots: [Switch, Befriend]; `auxSingle` when only one shows. */
  aux: [Rect, Rect];
  auxSingle: Rect;
  /** Centre for VS / story banners and confetti. */
  banner: Point;
  /** Top-centre anchor for tips (hunter teach, befriend odds) over the arena sky. */
  tip: Point;
  /** Modal menus / result panel centre and room. */
  modal: { x: number; y: number; maxW: number; maxH: number };
};

export function battleLayoutMode(stageW: number, stageH: number): BattleLayoutMode {
  if (stageH >= stageW) {
    return "portrait";
  }
  return stageH < SIDE_MAX_STAGE_H ? "side" : "wide";
}

/** Design rect with the stage's aspect that keeps the 640 core on the short axis. */
export function battleView(stageW: number, stageH: number): Rect {
  const w = Math.max(1, stageW);
  const h = Math.max(1, stageH);
  if (h >= w) {
    return { x: 0, y: 0, w: CORE, h: (CORE * h) / w };
  }
  const vw = (CORE * w) / h;
  return { x: (CORE - vw) / 2, y: 0, w: vw, h: CORE };
}

/** Chrome scale for a given CSS-per-design-px ratio. */
export function battleUiScale(unit: number): number {
  return Math.min(2.4, Math.max(0.85, UI_CSS_PER_BASE / unit));
}

/**
 * Arena fitted into a region: creatures as big as the room allows (`cs`),
 * the dais / spacing scale (`s`) compressed on narrow stages so both stay on
 * screen, and the pair biased low (sky + tips above, close to the sheet).
 */
export function fitArena(
  region: Rect,
  /** Foe art scale vs a normal creature (the story boss is drawn 1.3x). */
  foeScale = 1,
): {
  s: number;
  cs: number;
  dais: Point;
  wildHome: Point;
  playerHome: Point;
} {
  const f = Math.max(1, foeScale);
  const spreadY = -WILD_OFFSET.y + PLAYER_OFFSET.y + 30;
  const halfRoom = region.w / 2 - ARENA_EDGE_PAD;
  const byHeight = region.h / (spreadY * 0.8 + CREATURE.h * f);
  const byWidth = halfRoom / Math.max(CREATURE.w / 2 - PLAYER_OFFSET.x * 0.8, (CREATURE.w / 2) * f + WILD_OFFSET.x * 0.8);
  const cs = Math.min(1.75, Math.max(0.55, Math.min(byHeight, byWidth)));
  const s = Math.min(
    1.6,
    Math.max(
      0.5,
      Math.min(
        cs,
        (halfRoom - (CREATURE.w / 2) * cs) / -PLAYER_OFFSET.x,
        (halfRoom - (CREATURE.w / 2) * cs * f) / WILD_OFFSET.x,
        (region.h - CREATURE.h * cs * f) / spreadY,
      ),
    ),
  );
  const above = -WILD_OFFSET.y * s + CREATURE.h * cs * f;
  const below = (PLAYER_OFFSET.y + 30) * s;
  const dais = {
    x: region.x + region.w / 2,
    y: region.y + above + Math.max(0, region.h - above - below) * 0.7,
  };
  return {
    s,
    cs,
    dais,
    wildHome: { x: dais.x + WILD_OFFSET.x * s, y: dais.y + WILD_OFFSET.y * s },
    playerHome: { x: dais.x + PLAYER_OFFSET.x * s, y: dais.y + PLAYER_OFFSET.y * s },
  };
}

function splitRow(x: number, y: number, w: number, h: number, count: number, gap: number): Rect[] {
  if (count <= 0) {
    return [];
  }
  const cw = (w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: x + i * (cw + gap), y, w: cw, h }));
}

/** Move-card rects in a 2-row grid: 4 -> 2x2, 5 -> 3+2, 3 -> 2+1, 1-2 -> stacked. */
export function gridMoves(x: number, y: number, w: number, cardH: number, gap: number, n: number): Rect[] {
  if (n <= 0) {
    return [];
  }
  if (n <= 2) {
    return Array.from({ length: n }, (_, i) => ({ x, y: y + i * (cardH + gap), w, h: cardH }));
  }
  const top = Math.ceil(n / 2);
  return [
    ...splitRow(x, y, w, cardH, top, gap),
    ...splitRow(x, y + cardH + gap, w, cardH, n - top, gap),
  ];
}

export function battleLayout(input: BattleLayoutInput): BattleLayout {
  const roomy = computeLayout(input, false);
  return roomy.mode === "portrait" && roomy.arenaRegion.h * roomy.unit < TIGHT_ARENA_CSS
    ? computeLayout(input, true)
    : roomy;
}

function computeLayout(input: BattleLayoutInput, tight: boolean): BattleLayout {
  const mode = battleLayoutMode(input.stageW, input.stageH);
  const view = battleView(input.stageW, input.stageH);
  const unit = Math.max(1, input.stageW) / view.w;
  const ui = battleUiScale(unit);
  const m = BASE.margin * ui;
  const gap = BASE.gap * ui;
  const n = Math.max(0, Math.min(5, input.moveCount));
  const story = input.story === true;
  const bottom = view.y + view.h - m;

  // --- Command area (sheet) -------------------------------------------------
  let sheet: Rect;
  let log: Rect;
  let moves: Rect[];
  let aux: [Rect, Rect];
  let auxSingle: Rect;
  /** Area left for the top rows + arena. */
  let stageArea: Rect;

  if (mode === "side") {
    const cmdW = Math.min(view.w * 0.42, 310 * ui);
    const cmdX = view.x + view.w - m - cmdW;
    const auxH = BASE.aux * ui;
    const auxY = bottom - auxH;
    aux = splitRow(cmdX, auxY, cmdW, auxH, 2, gap) as [Rect, Rect];
    auxSingle = { x: cmdX, y: auxY, w: cmdW, h: auxH };
    const logTop = view.y + m * 0.6 + BASE.titleRow * ui + gap;
    log = { x: cmdX, y: logTop, w: cmdW, h: BASE.log * ui * 1.3 };
    const cardsTop = log.y + log.h + gap;
    const avail = auxY - gap - cardsTop;
    const slots = Math.max(4, n);
    const cardH = Math.min(BASE.card * ui, (avail - gap * (slots - 1)) / slots);
    moves = Array.from({ length: n }, (_, i) => ({ x: cmdX, y: cardsTop + i * (cardH + gap), w: cmdW, h: cardH }));
    sheet = { x: cmdX - m * 0.75, y: view.y, w: view.x + view.w - (cmdX - m * 0.75), h: view.h };
    stageArea = { x: view.x + m, y: view.y, w: sheet.x - (view.x + m) - m * 0.5, h: view.h };
  } else if (mode === "wide") {
    const colW = Math.min(view.w - 2 * m, 880 * ui);
    const colX = view.x + (view.w - colW) / 2;
    const cardH = BASE.wideCard * ui;
    const cardsY = bottom - cardH;
    moves = n === 1
      ? [{ x: colX + colW / 4, y: cardsY, w: colW / 2, h: cardH }]
      : splitRow(colX, cardsY, colW, cardH, n, gap);
    const rowH = BASE.aux * ui;
    const rowY = cardsY - gap - rowH;
    const auxW = 190 * ui;
    aux = [
      { x: colX + colW - 2 * auxW - gap, y: rowY, w: auxW, h: rowH },
      { x: colX + colW - auxW, y: rowY, w: auxW, h: rowH },
    ];
    auxSingle = aux[1];
    log = { x: colX, y: rowY, w: colW - 2 * auxW - 2 * gap, h: rowH };
    const sheetTop = rowY - gap;
    sheet = { x: view.x, y: sheetTop, w: view.w, h: view.y + view.h - sheetTop };
    stageArea = { x: colX, y: view.y, w: colW, h: sheetTop - view.y };
  } else {
    const colX = view.x + m;
    const colW = view.w - 2 * m;
    // Tight: still >= 44 CSS px (48 x 0.92), just less padding.
    const auxH = (tight ? 48 : BASE.aux) * ui;
    const auxY = bottom - auxH;
    aux = splitRow(colX, auxY, colW, auxH, 2, gap) as [Rect, Rect];
    auxSingle = { x: colX, y: auxY, w: colW, h: auxH };
    const cardH = (tight ? BASE.tightCard : BASE.card) * ui;
    const cardsTop = auxY - gap - (2 * cardH + gap);
    moves = gridMoves(colX, cardsTop, colW, cardH, gap, n);
    const logH = BASE.log * ui;
    log = { x: colX, y: cardsTop - gap - logH, w: colW, h: logH };
    const sheetTop = log.y - gap;
    sheet = { x: view.x, y: sheetTop, w: view.w, h: view.y + view.h - sheetTop };
    stageArea = { x: view.x, y: view.y, w: view.w, h: sheetTop - view.y };
  }

  // --- Top rows: title, plates, intent --------------------------------------
  const inner = mode === "portrait"
    ? { x: stageArea.x + m, w: stageArea.w - 2 * m }
    : { x: stageArea.x, w: stageArea.w };
  const rowH = BASE.titleRow * ui;
  let y = view.y + m * 0.6;
  const topRow = mode === "side"
    ? { y: y + rowH / 2, left: sheet.x + m * 0.75, right: view.x + view.w - m }
    : { y: y + rowH / 2, left: inner.x, right: inner.x + inner.w };
  if (mode !== "side") {
    y += rowH + gap * 0.5;
  }
  const plateH = BASE.plate.h * ui;
  const plateW = Math.min(BASE.plate.w * ui, (inner.w - gap) / 2);
  let foePlate: Rect;
  let playerPlate: Rect;
  if (story) {
    if (mode === "side") {
      // The ward chip rides above the bar: leave it a row.
      y += rowH;
    }
    foePlate = { x: inner.x, y, w: inner.w, h: BASE.bossBar.h * ui };
    y += foePlate.h + gap;
    playerPlate = { x: inner.x, y, w: plateW, h: plateH };
    if (tight) {
      // Short phones: the intent rides beside your plate instead of its own row.
      playerPlate.w = Math.min(plateW, inner.w * 0.42);
      const intent = { y: y + plateH / 2, left: inner.x + playerPlate.w + gap, right: inner.x + inner.w };
      y += plateH + gap;
      return finish(intent, y);
    }
    y += plateH + gap;
  } else {
    playerPlate = { x: inner.x, y, w: plateW, h: plateH };
    foePlate = { x: inner.x + inner.w - plateW, y, w: plateW, h: plateH };
    y += plateH + gap;
  }
  const intentH = BASE.intentRow * ui;
  return finish({ y: y + intentH / 2, left: inner.x, right: inner.x + inner.w }, y + intentH + gap);

  function finish(intent: BattleLayout["intent"], arenaTop: number): BattleLayout {
    const arenaRegion: Rect = {
      x: stageArea.x,
      y: arenaTop,
      w: stageArea.w,
      h: Math.max(1, stageArea.y + stageArea.h - arenaTop),
    };
    const arena = fitArena(arenaRegion, input.foeScale);
    const center = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    return {
      mode,
      tight,
      view,
      unit,
      ui,
      topRow,
      foePlate,
      playerPlate,
      intent,
      arenaRegion,
      dais: arena.dais,
      s: arena.s,
      cs: arena.cs,
      wildHome: arena.wildHome,
      playerHome: arena.playerHome,
      sheet,
      log,
      moves,
      aux,
      auxSingle,
      banner: { x: arenaRegion.x + arenaRegion.w / 2, y: arenaRegion.y + arenaRegion.h / 2 },
      tip: { x: arenaRegion.x + arenaRegion.w / 2, y: arenaRegion.y },
      modal: { x: center.x, y: center.y, maxW: view.w - 2 * m, maxH: view.h - 2 * m },
    };
  }
}

/** Rect in design px -> CSS px height (for the >= 44 px touch target rule). */
export function cssSize(layout: Pick<BattleLayout, "unit">, designPx: number): number {
  return designPx * layout.unit;
}
