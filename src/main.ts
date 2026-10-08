import Phaser from "phaser";
import "./style.css";
import { initQuestProgress } from "./game/story/questProgress";
import { createGame } from "./game/Game";
import { initNameIntro } from "./game/ui/nameIntro";
import {
  hasDevPreviewParam,
  resolveBootRoute,
  setBootContext,
} from "./game/opening/bootRoute";
import { startOpeningBeat } from "./game/opening/openingCaption";
import { initStatusPanelControls } from "./game/ui/statusPanel";
import { initCanvasFocusReturn } from "./game/ui/canvasFocus";
import { shouldResetHostSave } from "./game/world/bootParams";
import {
  clearJoinParamAndReload,
  parseInviteParam,
} from "./game/world/invite";
import {
  applyWorldSnapshot,
  isValidWorldSnapshot,
} from "./game/world/worldSnapshot";
import {
  clearHostSave,
  loadHostSave,
  restoreHostSave,
  resumeHostPersist,
  suspendHostPersist,
} from "./game/world/worldSave";
import { setVisitorMode } from "./game/world/worldSession";
import { getPlayerName, setPlayerName } from "./game/world/playerName";
import { readShareParam } from "./game/share/shareCode";
import {
  openCardPreview,
  showInvalidCardScreen,
} from "./game/share/cardPreview";
import { initShareControls, setShareDisabled } from "./game/share/shareActions";
import { bindCreatureArt } from "./game/ui/creatureArt";
import { initHudLock } from "./game/ui/hudLock";

function consumeNewParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("new")) {
    return;
  }
  url.searchParams.delete("new");
  const query = url.searchParams.toString();
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}

function showInvalidInviteScreen(): void {
  const overlay = document.getElementById("invite-error");
  const startFresh = document.getElementById("invite-error-start-fresh");
  const playfield = document.getElementById("playfield");
  if (!overlay || !startFresh) {
    return;
  }
  playfield?.setAttribute("hidden", "");
  overlay.hidden = false;
  startFresh.addEventListener("click", () => {
    clearHostSave();
    clearJoinParamAndReload();
  });
}

/** Any decode failure, even an unexpected throw, lands on the broken-card screen. */
function readShareParamSafely(): ReturnType<typeof readShareParam> {
  try {
    return readShareParam();
  } catch {
    return { status: "invalid" };
  }
}

const inviteResult = parseInviteParam();
// ?join= always wins; a ?card= share link is only read without an invite.
const shareResult =
  inviteResult.status === "absent" ? readShareParamSafely() : ({ status: "absent" } as const);
if (inviteResult.status === "invalid") {
  // Blocking error — do not boot, clear saves, or write quest progress.
  showInvalidInviteScreen();
} else if (shareResult.status === "invalid") {
  // Same rule for broken share cards: never boot from untrusted input.
  showInvalidCardScreen();
} else {
  const params = new URLSearchParams(window.location.search);
  // Only honor ?new= when the URL carries no invite at all — a shared ?join=
  // link with &new=1 appended must not wipe the recipient's save (#189).
  const newGame = shouldResetHostSave(inviteResult.status, params);
  if (newGame) {
    clearHostSave();
    consumeNewParam();
  }
  let hasSave = false;

  if (inviteResult.status === "ok" && isValidWorldSnapshot(inviteResult.snapshot)) {
    suspendHostPersist();
    applyWorldSnapshot(inviteResult.snapshot);
    setVisitorMode(true, inviteResult.snapshot.hostLabel);
    resumeHostPersist();
  } else {
    if (shareResult.status === "ok") {
      // Card sandbox (#368): never resumed, so nothing this page does (incl.
      // Challenge spar rewards) can reach the recipient's save.
      suspendHostPersist();
    }
    const saved = loadHostSave({ readOnly: shareResult.status === "ok" });
    if (saved) {
      hasSave = true;
      restoreHostSave(saved);
    } else {
      initQuestProgress();
    }
    if (shareResult.status === "ok") {
      const challengerName = getPlayerName() ?? "Challenger";
      setVisitorMode(true, `${shareResult.snapshot.name}'s card`);
      setPlayerName(challengerName);
      setShareDisabled(true);
    }
  }

  const invite =
    inviteResult.status === "ok" ? inviteResult.snapshot : null;
  // Title screen (#363 / #350) unless this is a visitor link, `?new=1`, or a
  // dev encounter/spar preview — those keep booting straight into play.
  const route = resolveBootRoute({
    // A valid ?card= link is a read-only sandbox too: skip the title so its
    // New Game (which wipes the save) is never reachable (#368).
    visitor:
      (invite !== null && isValidWorldSnapshot(invite)) ||
      shareResult.status === "ok",
    newGame,
    devPreview: import.meta.env.DEV && hasDevPreviewParam(params),
  });
  setBootContext({ route, hasSave });
  const game = createGame("game");
  if (import.meta.env.DEV) {
    // QA handle for Playwright screenshot passes (dev server only).
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  }
  initStatusPanelControls();
  initCanvasFocusReturn();
  initShareControls(game);
  bindCreatureArt(game);
  initHudLock();
  if (shareResult.status === "ok") {
    // Card links skip the title (route is "play") and never show the name intro.
    openCardPreview(game, shareResult.snapshot);
  } else if (route === "play") {
    // TitleScene runs the name intro itself after New Game / Continue.
    initNameIntro(startOpeningBeat);
  }

  // ponytail: dev-only encounter preview via ?encounter=ember-wisp or ?spar=ember-wisp
  if (import.meta.env.DEV && !invite && shareResult.status === "absent") {
    const previewParams = new URLSearchParams(window.location.search);
    const creatureId =
      previewParams.get("encounter") ?? previewParams.get("spar");
    if (creatureId) {
      const launchPreview = (): void => {
        if (!game.scene.isActive("IsometricScene")) {
          window.setTimeout(launchPreview, 40);
          return;
        }
        const iso = game.scene.getScene("IsometricScene") as Phaser.Scene;
        if (previewParams.has("spar")) {
          iso.scene.launch("BattleScene", {
            wildCreatureId: creatureId,
            // QA: the preview stands in for a wild-encounter spar.
            allowBefriend: true,
            wandererPartner: {
              name: "Wanderer's Spark",
              maxHp: 24,
              attack: 6,
              defense: 4,
              moves: [
                {
                  id: "nudge",
                  name: "Nudge",
                  power: 5,
                  type: "hearth",
                  accuracy: 100,
                },
              ],
            },
          });
        } else {
          iso.scene.launch("EncounterScene", { creatureId });
        }
        iso.scene.pause();
      };
      game.events.once("ready", launchPreview);
    }
  }
}
