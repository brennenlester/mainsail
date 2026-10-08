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

const inviteResult = parseInviteParam();
if (inviteResult.status === "invalid") {
  // Blocking error — do not boot, clear saves, or write quest progress.
  showInvalidInviteScreen();
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
    const saved = loadHostSave();
    if (saved) {
      hasSave = true;
      restoreHostSave(saved);
    } else {
      initQuestProgress();
    }
  }

  const invite =
    inviteResult.status === "ok" ? inviteResult.snapshot : null;
  // Title screen (#363 / #350) unless this is a visitor link, `?new=1`, or a
  // dev encounter/spar preview — those keep booting straight into play.
  const route = resolveBootRoute({
    visitor: invite !== null && isValidWorldSnapshot(invite),
    newGame,
    devPreview: import.meta.env.DEV && hasDevPreviewParam(params),
  });
  setBootContext({ route, hasSave });
  const game = createGame("game");
  initStatusPanelControls();
  if (route === "play") {
    // TitleScene runs the name intro itself after New Game / Continue.
    initNameIntro(startOpeningBeat);
  }

  // ponytail: dev-only encounter preview via ?encounter=ember-wisp or ?spar=ember-wisp
  if (import.meta.env.DEV && !invite) {
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
