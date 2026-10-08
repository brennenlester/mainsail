import type Phaser from "phaser";
import { UNARMED_WANDERER } from "../battle/wandererWeapons";
import {
  ACTIVE_PARTY_LIMIT,
  addToParty,
  getActiveCreatures,
  getEffectiveMaxHp,
  playerParty,
} from "../creatures/party";
import { setWildLevelOverride } from "../progression/wildLevel";
import { el } from "./shareSheet";
import type { ShareSnapshot } from "./shareCode";

/**
 * "Challenge" from a shared card (#368): sequential spars against a read-only
 * ghost of the sharer's party, reusing BattleScene. Runs only inside the
 * card sandbox (visitor mode + suspended host persistence, see main.ts), so
 * spar rewards live in memory and vanish on reload.
 */

/** Loaner trio for challengers with no save of their own. */
export const LOANER_PARTY = ["mossling", "ember-wisp", "brook-nymph"] as const;

export type ChallengeResult = { wins: number; total: number };

export function ghostAverageLevel(snapshot: ShareSnapshot): number {
  const total = snapshot.party.reduce((sum, c) => sum + c.level, 0);
  return Math.max(1, Math.round(total / Math.max(1, snapshot.party.length)));
}

/** Give a save-less challenger a fair loaner party (sandbox memory only). */
export function ensureChallengerParty(snapshot: ShareSnapshot): void {
  if (playerParty.creatures.length > 0) {
    // Reserve-only saves: field the first companions (sandbox memory only;
    // visitor mode blocks the Party panel, so the player cannot do it).
    if (playerParty.activeInstanceIds.length === 0) {
      playerParty.activeInstanceIds = playerParty.creatures
        .slice(0, ACTIVE_PARTY_LIMIT)
        .map((c) => c.instanceId);
    }
    return;
  }
  const level = ghostAverageLevel(snapshot);
  for (const id of LOANER_PARTY) {
    addToParty(id, level);
  }
}

function healActives(): void {
  for (const creature of getActiveCreatures()) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
}

function showBanner(text: string): () => void {
  document.getElementById("share-banner")?.remove();
  const banner = el("div", "share-banner", text);
  banner.id = "share-banner";
  banner.setAttribute("role", "status");
  document.body.append(banner);
  return () => banner.remove();
}

/** BattleScene keeps the opponent on a private field; read it after shutdown. */
function ghostWasDefeated(battle: Phaser.Scene): boolean {
  const wild = (battle as unknown as { wild?: { currentHp?: number } }).wild;
  return typeof wild?.currentHp === "number" && wild.currentHp <= 0;
}

export function runGhostChallenge(
  game: Phaser.Game,
  snapshot: ShareSnapshot,
  onDone: (result: ChallengeResult) => void,
): void {
  ensureChallengerParty(snapshot);
  const total = snapshot.party.length;
  let wins = 0;

  const fight = (index: number): void => {
    const ghost = snapshot.party[index];
    if (!ghost) {
      setWildLevelOverride(null);
      onDone({ wins, total });
      return;
    }
    if (!game.scene.isActive("IsometricScene")) {
      window.setTimeout(() => fight(index), 60);
      return;
    }
    // ponytail: full heal between rounds keeps the gauntlet a skill check, not attrition.
    healActives();
    setWildLevelOverride(ghost.level);
    const hideBanner = showBanner(
      `${snapshot.name}'s ghost party · Round ${index + 1} of ${total}`,
    );
    const iso = game.scene.getScene("IsometricScene");
    const battle = game.scene.getScene("BattleScene");
    battle.events.once("shutdown", () => {
      hideBanner();
      const won = ghostWasDefeated(battle);
      if (won) {
        wins += 1;
      }
      setWildLevelOverride(null);
      if (won && index + 1 < total) {
        window.setTimeout(() => fight(index + 1), 250);
      } else {
        onDone({ wins, total });
      }
    });
    iso.scene.launch("BattleScene", {
      wildCreatureId: ghost.id,
      wandererPartner: UNARMED_WANDERER,
    });
    iso.scene.pause();
  };

  fight(0);
}
