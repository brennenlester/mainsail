import Phaser from "phaser";
import { DESIGN_SIZE } from "../render/pixelRatio";
import {
  HEARTH_LOTS_BOARD,
  HEARTH_LOTS_BOARD_TEXTURE,
  buyPendingLot,
  createLotsState,
  hearthLotsBoardCell,
  hearthLotsHopPath,
  lotsNetWorth,
  playOddIfNeeded,
  rollLots,
  skipPendingLot,
  type LotsPlayerId,
  type LotsSpace,
  type LotsState,
} from "../minigames/hearthLots";
import {
  MINIGAME_TEXT,
  addMinigameButton,
  bindMinigameQuit,
  bootMinigameOverlay,
  closeMinigameOverlay,
  resolveMinigameEnd,
} from "../minigames/overlay";
import { getPlayerName } from "../world/playerName";
import { queueLateImages } from "../render/lateAssets";

const CELL = 88;
const BOARD_LEFT = (DESIGN_SIZE - CELL * 5) / 2;
const BOARD_TOP = 108;
const HOP_MS = 170;
const PIP = 12;
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-PIP, -PIP],
    [PIP, PIP],
  ],
  3: [
    [-PIP, -PIP],
    [0, 0],
    [PIP, PIP],
  ],
  4: [
    [-PIP, -PIP],
    [PIP, -PIP],
    [-PIP, PIP],
    [PIP, PIP],
  ],
  5: [
    [-PIP, -PIP],
    [PIP, -PIP],
    [0, 0],
    [-PIP, PIP],
    [PIP, PIP],
  ],
  6: [
    [-PIP, -PIP],
    [-PIP, 0],
    [-PIP, PIP],
    [PIP, -PIP],
    [PIP, 0],
    [PIP, PIP],
  ],
};

function spaceFill(state: LotsState, space: LotsSpace): number {
  if (space.kind === "start") {
    return 0xb87840;
  }
  if (space.kind === "tax") {
    return 0x8a4048;
  }
  if (space.kind === "event") {
    return 0x3a6080;
  }
  if (state.player.owned.includes(space.index)) {
    return 0xc89048;
  }
  if (state.odd.owned.includes(space.index)) {
    return 0x8868a8;
  }
  return 0x5a4038;
}

function addDieFace(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  value: number | null,
): void {
  parent.removeAll(true);
  const face = scene.add.graphics();
  face.fillStyle(0xf4ead4, 1);
  face.fillRoundedRect(-26, -26, 52, 52, 8);
  face.lineStyle(3, 0x6a4838, 1);
  face.strokeRoundedRect(-26, -26, 52, 52, 8);
  parent.add(face);
  if (value === null) {
    return;
  }
  for (const [px, py] of PIP_LAYOUT[value] ?? []) {
    parent.add(scene.add.circle(px, py, 4.5, 0x3a2418));
  }
}

function playerDisplayName(): string {
  return getPlayerName() ?? "You";
}

export class HearthLotsScene extends Phaser.Scene {
  private state: LotsState = createLotsState();
  private statusText!: Phaser.GameObjects.Text;
  private boardRoot!: Phaser.GameObjects.Container;
  private pieceRoot!: Phaser.GameObjects.Container;
  private dieFace!: Phaser.GameObjects.Container;
  private playerToken!: Phaser.GameObjects.Container;
  private oddToken!: Phaser.GameObjects.Container;
  private closing = { current: false };
  private moving = false;
  private shownRoll: number | null = null;
  private rollButton!: Phaser.GameObjects.Text;
  private buyButton!: Phaser.GameObjects.Text;
  private skipButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "HearthLotsScene" });
  }

  /** The painted board is fetched the first time the table opens (#410). */
  preload(): void {
    queueLateImages(this, [HEARTH_LOTS_BOARD_TEXTURE], "Setting out the board…");
  }

  create(): void {
    bootMinigameOverlay(this);
    this.closing = { current: false };
    this.moving = false;
    this.shownRoll = null;
    this.state = createLotsState();
    this.add
      .text(24, 22, "Hearth Lots", {
        ...MINIGAME_TEXT,
        color: "#fff8ec",
        fontSize: "22px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.statusText = this.add
      .text(24, 52, this.state.log, {
        ...MINIGAME_TEXT,
        color: "#e8d8c0",
        fontSize: "15px",
        wordWrap: { width: DESIGN_SIZE - 140, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);
    this.boardRoot = this.add.container(0, 0);
    this.pieceRoot = this.add.container(0, 0);
    this.dieFace = this.add.container(DESIGN_SIZE / 2, BOARD_TOP + CELL * 2.15);
    this.pieceRoot.add(this.dieFace);
    this.playerToken = this.makeToken(playerDisplayName(), 0xf0c878, true);
    this.oddToken = this.makeToken("Odd", 0xc890d8, false);
    this.pieceRoot.add([this.playerToken, this.oddToken]);

    bindMinigameQuit(this, () => this.quit());
    this.rollButton = addMinigameButton(this, 90, 580, "Roll");
    this.rollButton.on("pointerdown", () => this.roll());
    this.buyButton = addMinigameButton(this, 220, 580, "Claim");
    this.buyButton.on("pointerdown", () => this.claim());
    this.skipButton = addMinigameButton(this, 350, 580, "Pass");
    this.skipButton.on("pointerdown", () => this.pass());
    this.input.keyboard?.on("keydown-E", () => {
      if (this.moving) {
        return;
      }
      if (this.state.pendingBuy !== null) {
        this.claim();
      } else {
        this.roll();
      }
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.roll());
    this.refresh();
  }

  private makeToken(
    label: string,
    fill: number,
    showNameTag: boolean,
  ): Phaser.GameObjects.Container {
    const token = this.add.container(0, 0);
    token.add(this.add.circle(0, 0, 11, fill).setStrokeStyle(2, 0x1a3040, 0.35));
    const initial = label.trim().charAt(0).toUpperCase() || "?";
    token.add(
      this.add
        .text(0, 0, initial, {
          ...MINIGAME_TEXT,
          color: "#1a3040",
          fontSize: "11px",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5),
    );
    if (showNameTag) {
      token.add(
        this.add
          .text(0, -16, label, {
            ...MINIGAME_TEXT,
            color: "#000000",
            fontSize: "12px",
            fontStyle: "bold",
          })
          .setOrigin(0.5, 1),
      );
    }
    return token;
  }

  private cellCenter(index: number): { x: number; y: number } {
    const { col, row } = hearthLotsBoardCell(index);
    return {
      x: BOARD_LEFT + col * CELL + CELL / 2,
      y: BOARD_TOP + row * CELL + CELL / 2,
    };
  }

  private tokenPoint(index: number, who: LotsPlayerId): { x: number; y: number } {
    const { x, y } = this.cellCenter(index);
    return {
      x: x + (who === "player" ? -16 : 16),
      y: y + 22,
    };
  }

  private roll(): void {
    if (
      this.closing.current ||
      this.moving ||
      this.state.status !== "playing" ||
      this.state.whoseTurn !== "player" ||
      this.state.pendingBuy !== null
    ) {
      return;
    }
    this.playTurn("player", 1 + Math.floor(Math.random() * 6));
  }

  private claim(): void {
    if (this.closing.current || this.moving) {
      return;
    }
    this.state = buyPendingLot(this.state);
    this.refresh();
    this.maybeOdd();
  }

  private pass(): void {
    if (this.closing.current || this.moving) {
      return;
    }
    this.state = skipPendingLot(this.state);
    this.refresh();
    this.maybeOdd();
  }

  private maybeOdd(): void {
    if (
      this.closing.current ||
      this.moving ||
      this.state.status !== "playing" ||
      this.state.whoseTurn !== "odd"
    ) {
      return;
    }
    this.time.delayedCall(220, () => {
      if (
        this.closing.current ||
        this.state.status !== "playing" ||
        this.state.whoseTurn !== "odd"
      ) {
        return;
      }
      this.playTurn("odd", 1 + Math.floor(Math.random() * 6));
    });
  }

  private playTurn(who: LotsPlayerId, roll: number): void {
    const from = who === "player" ? this.state.player.position : this.state.odd.position;
    const path = hearthLotsHopPath(from, roll);
    const token = who === "player" ? this.playerToken : this.oddToken;
    this.moving = true;
    this.shownRoll = path.length;
    addDieFace(this, this.dieFace, this.shownRoll);
    this.statusText.setText(
      `${who === "player" ? playerDisplayName() : "Odd"} rolled ${this.shownRoll}.`,
    );
    this.syncButtons();
    this.hopAlong(token, who, path, () => {
      this.state =
        who === "odd" ? playOddIfNeeded(this.state, roll) : rollLots(this.state, roll);
      this.moving = false;
      this.refresh();
      this.maybeOdd();
    });
  }

  private hopAlong(
    token: Phaser.GameObjects.Container,
    who: LotsPlayerId,
    path: number[],
    onDone: () => void,
  ): void {
    const step = (i: number) => {
      if (this.closing.current) {
        return;
      }
      if (i >= path.length) {
        onDone();
        return;
      }
      const dest = this.tokenPoint(path[i], who);
      const fromX = token.x;
      const fromY = token.y;
      this.tweens.add({
        targets: { t: 0 },
        t: 1,
        duration: HOP_MS,
        ease: "Sine.easeInOut",
        onUpdate: (_tween, target: { t: number }) => {
          const p = target.t;
          token.x = fromX + (dest.x - fromX) * p;
          token.y = fromY + (dest.y - fromY) * p - Math.sin(p * Math.PI) * 18;
        },
        onComplete: () => {
          token.setPosition(dest.x, dest.y);
          step(i + 1);
        },
      });
    };
    step(0);
  }

  private refresh(): void {
    this.boardRoot.removeAll(true);
    const painted = this.textures.exists(HEARTH_LOTS_BOARD_TEXTURE);
    if (painted) {
      const art = this.add
        .image(
          DESIGN_SIZE / 2,
          BOARD_TOP + CELL * 2.5,
          HEARTH_LOTS_BOARD_TEXTURE,
        )
        .setDisplaySize(CELL * 5, CELL * 5);
      this.boardRoot.add(art);
    }
    for (const space of HEARTH_LOTS_BOARD) {
      const { x, y } = this.cellCenter(space.index);
      const pending = this.state.pendingBuy === space.index;
      if (!painted) {
        const cell = this.add
          .rectangle(x, y, CELL - 6, CELL - 6, spaceFill(this.state, space), 0.96)
          .setStrokeStyle(pending ? 3 : 2, pending ? 0xffe8a0 : 0xd8a05c);
        this.boardRoot.add(cell);
      } else {
        const owner = this.state.player.owned.includes(space.index)
          ? 0xc89048
          : this.state.odd.owned.includes(space.index)
            ? 0x8868a8
            : pending
              ? 0xffe8a0
              : 0x000000;
        const wash = this.add
          .rectangle(
            x,
            y,
            CELL - 8,
            CELL - 8,
            owner,
            pending ? 0.28 : owner === 0x000000 ? 0 : 0.4,
          )
          .setStrokeStyle(pending ? 3 : 1, pending ? 0xffe8a0 : 0x000000, pending ? 1 : 0.15);
        this.boardRoot.add(wash);
      }
      const label = this.add
        .text(x, y - 14, space.name, {
          ...MINIGAME_TEXT,
          color: "#fff8ec",
          fontSize: "11px",
          align: "center",
          wordWrap: { width: CELL - 14, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0.5);
      this.boardRoot.add(label);
    }

    const summary = this.add
      .text(
        DESIGN_SIZE / 2,
        BOARD_TOP + CELL * 2.5 + 44,
        [
          `Round ${Math.min(this.state.round + 1, 12)} / 12`,
          `${playerDisplayName()} ${this.state.player.marks} marks (${lotsNetWorth(this.state, "player")} worth)`,
          `Odd ${this.state.odd.marks} marks (${lotsNetWorth(this.state, "odd")} worth)`,
        ].join("\n"),
        {
          ...MINIGAME_TEXT,
          color: "#fff8ec",
          fontSize: "14px",
          align: "center",
        },
      )
      .setOrigin(0.5, 0.5);
    this.boardRoot.add(summary);

    this.shownRoll = this.state.lastRoll;
    addDieFace(this, this.dieFace, this.shownRoll);
    if (!this.moving) {
      const you = this.tokenPoint(this.state.player.position, "player");
      const odd = this.tokenPoint(this.state.odd.position, "odd");
      this.playerToken.setPosition(you.x, you.y);
      this.oddToken.setPosition(odd.x, odd.y);
    }

    this.statusText.setText(this.state.log);
    this.syncButtons();
    if (this.state.status !== "playing") {
      resolveMinigameEnd(
        this,
        "hearth-lots",
        this.state.status === "won",
        this.statusText,
        this.closing,
      );
    }
  }

  private syncButtons(): void {
    this.rollButton.setVisible(
      !this.moving &&
        this.state.status === "playing" &&
        this.state.whoseTurn === "player" &&
        this.state.pendingBuy === null,
    );
    this.buyButton.setVisible(!this.moving && this.state.pendingBuy !== null);
    this.skipButton.setVisible(!this.moving && this.state.pendingBuy !== null);
  }

  private quit(): void {
    if (this.closing.current) {
      return;
    }
    this.closing.current = true;
    this.tweens.killAll();
    closeMinigameOverlay(this);
  }
}
