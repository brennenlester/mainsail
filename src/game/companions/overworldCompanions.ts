import Phaser from "phaser";
import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures, getCreatureInstance, playerParty } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { playAbilitySfx } from "../audio/gameAudio";
import { MAX_FOLLOWERS } from "../render/partyOverworldFollowers";
import type { OverworldFx } from "../render/fx/overworldFx";
import { selectOverworldFollowers } from "../shrine/presence";
import {
  canOpenNicknamePrompt,
  isNicknamePromptOpen,
  promptNickname,
  setNicknameKeyboardHandler,
} from "../ui/nicknamePrompt";
import { getTopOverlayId } from "../ui/overlayStack";
import { isVisitorMode } from "../world/worldSession";
import type { PropKind } from "../world/zoneProps";
import type { ZoneId } from "../world/zoneTypes";
import {
  ABILITIES,
  findAbilityUser,
  findSiteInteraction,
  grantsAbilityBond,
  siteHintYields,
  nearestCuriousSpot,
  sitesInZone,
  type AbilityId,
  type CompanionSite,
  type SiteInteraction,
} from "./abilities";
import { addBond, BOND_GAIN, bondTierName, drainBondTierUps } from "./bond";
import { claimSite, getClaimedSites, isSiteClaimed } from "./companionState";

/** What IsometricScene lends the controller — keeps the scene hooks tiny. */
export type CompanionHost = {
  scene: Phaser.Scene;
  fx(): OverworldFx | undefined;
  zoneId(): ZoneId;
  playerTile(): { x: number; y: number };
  /** Grid → world px at the tile's ground point. */
  groundAt(x: number, y: number): { x: number; y: number };
  depthAt(x: number, y: number): number;
  followerSprites(): readonly Phaser.GameObjects.Image[];
  toast(message: string, ok: boolean): void;
  movePlayerTo(x: number, y: number): void;
  spawnProp(x: number, y: number, kind: PropKind): void;
  /** Hand keyboard focus to the DOM (nickname prompt) and back. */
  setKeyboardCaptured(captured: boolean): void;
  /** Dialogue, minigame, shrine, or encounter in progress. */
  isBusy(): boolean;
};

const TEX = {
  brush: "companion-brush",
  stash: "companion-stash",
  glimmer: "companion-glimmer",
  ripple: "companion-ripple",
} as const;

function ensureTextures(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  make(TEX.brush, 40, 30, (g) => {
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(20, 26, 36, 8);
    const tufts: Array<[number, number, number, number]> = [
      [10, 18, 9, 0x9a7a3a],
      [20, 13, 11, 0xb08a42],
      [30, 18, 9, 0x8a6a30],
      [16, 21, 8, 0xc8a050],
      [26, 22, 8, 0xa88040],
    ];
    for (const [x, y, r, c] of tufts) {
      g.fillStyle(c, 1);
      g.fillCircle(x, y, r);
    }
    g.lineStyle(1.5, 0x6a4a20, 0.8);
    for (const [x1, y1, x2, y2] of [[12, 12, 8, 4], [20, 8, 21, 1], [28, 12, 33, 5], [16, 16, 13, 9]]) {
      g.lineBetween(x1!, y1!, x2!, y2!);
    }
  });
  make(TEX.stash, 26, 22, (g) => {
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(13, 19, 24, 6);
    g.fillStyle(0x8a5a2a, 1);
    g.fillRoundedRect(2, 6, 22, 13, 3);
    g.fillStyle(0xa8743a, 1);
    g.fillRoundedRect(2, 3, 22, 7, 3);
    g.fillStyle(0xf0c860, 1);
    g.fillRect(11, 8, 4, 5);
    g.lineStyle(1, 0x5a3a18, 1);
    g.strokeRoundedRect(2, 3, 22, 16, 3);
  });
  make(TEX.glimmer, 20, 20, (g) => {
    g.fillStyle(0xd8ffc0, 0.9);
    g.fillTriangle(10, 0, 11.5, 10, 8.5, 10);
    g.fillTriangle(10, 20, 11.5, 10, 8.5, 10);
    g.fillTriangle(0, 10, 10, 8.5, 10, 11.5);
    g.fillTriangle(20, 10, 10, 8.5, 10, 11.5);
    g.fillCircle(10, 10, 2.5);
  });
  make(TEX.ripple, 30, 12, (g) => {
    g.lineStyle(2, 0xe8f8ff, 0.8);
    g.strokeEllipse(15, 6, 26, 8);
  });
}

/**
 * Overworld side of companions (#367): ability sites (brush, islet stashes,
 * hidden nodes), E-interaction, bond tier-up celebrations, and the nickname
 * prompt for newly joined friends.
 */
export class OverworldCompanions {
  private readonly host: CompanionHost;
  private siteObjects = new Map<string, Phaser.GameObjects.GameObject[]>();
  private cooldownUntil: Partial<Record<AbilityId, number>> = {};
  private knownIds: Set<string>;
  private nicknameQueue: string[] = [];

  constructor(host: CompanionHost) {
    this.host = host;
    // Only creatures that join after boot get the nickname prompt.
    this.knownIds = new Set(playerParty.creatures.map((c) => c.instanceId));
    setNicknameKeyboardHandler((captured) => host.setKeyboardCaptured(captured));
    if (import.meta.env.DEV) {
      // ponytail: dev-only QA handle for Playwright checks.
      (window as unknown as { __ivyCompanions?: unknown }).__ivyCompanions = this;
    }
  }

  /** Draw unresolved sites after the scene rebuilt the zone. */
  enterZone(): void {
    ensureTextures(this.host.scene);
    this.siteObjects.clear();
    for (const site of sitesInZone(this.host.zoneId())) {
      this.drawSite(site);
    }
  }

  private drawSite(site: CompanionSite): void {
    const { scene } = this.host;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const claimed = isSiteClaimed(site.id);
    if (site.ability === "burn" && !claimed) {
      const at = this.host.groundAt(site.x, site.y);
      objs.push(
        scene.add.image(at.x, at.y, TEX.brush).setOrigin(0.5, 1).setScale(1.2)
          .setDepth(this.host.depthAt(site.x, site.y)),
      );
    } else if (site.ability === "sense" && !claimed) {
      const at = this.host.groundAt(site.x, site.y);
      const glimmer = scene.add.image(at.x, at.y - 10, TEX.glimmer)
        .setDepth(this.host.depthAt(site.x, site.y))
        .setAlpha(0.25);
      scene.tweens.add({
        targets: glimmer,
        alpha: 0.7,
        scale: 1.2,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      objs.push(glimmer);
    } else if (site.ability === "ford" && site.landing && site.stash) {
      // Ripples mark the shallows between shore and islet.
      for (let y = site.y + 1; y < site.landing.y; y += 1) {
        const at = this.host.groundAt(site.x, y);
        const ripple = scene.add.image(at.x, at.y - 10, TEX.ripple)
          .setDepth(this.host.depthAt(site.x, y))
          .setAlpha(0.5);
        scene.tweens.add({
          targets: ripple,
          scale: 1.25,
          alpha: 0.15,
          duration: 1400,
          yoyo: true,
          repeat: -1,
        });
        objs.push(ripple);
      }
      if (!claimed) {
        const at = this.host.groundAt(site.stash.x, site.stash.y);
        objs.push(
          scene.add.image(at.x, at.y, TEX.stash).setOrigin(0.5, 1).setScale(1.3)
            .setDepth(this.host.depthAt(site.stash.x, site.stash.y)),
        );
      }
    }
    this.siteObjects.set(site.id, objs);
  }

  private clearSite(siteId: string, keepRipples = false): void {
    for (const obj of this.siteObjects.get(siteId) ?? []) {
      const image = obj as Phaser.GameObjects.Image;
      if (keepRipples && image.texture?.key === TEX.ripple) continue;
      this.host.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
  }

  private current(): SiteInteraction | undefined {
    if (isVisitorMode()) return undefined;
    const { x, y } = this.host.playerTile();
    return findSiteInteraction(this.host.zoneId(), x, y, getClaimedSites());
  }

  /**
   * Interact prompt label, or undefined when no site is in reach. Without an
   * able companion the hint yields to a nearby gather node.
   */
  promptLabel(gatherNearby = false): string | undefined {
    const hit = this.current();
    if (!hit) return undefined;
    if (hit.kind === "stash") return "Press E — Open stash";
    if (hit.kind === "ford-back") return "Press E — Ford back to shore";
    const ability = ABILITIES[hit.site.ability];
    const user = findAbilityUser(getActiveCreatures(), hit.site.ability);
    if (!user) return siteHintYields(false, gatherNearby) ? undefined : ability.needHint;
    return `Press E — ${displayName(user)}: ${ability.verb}`;
  }

  /** Handle E. Returns true when a site consumed the press. */
  tryInteract(now: number): boolean {
    const hit = this.current();
    if (!hit) return false;
    if (hit.kind === "stash") {
      this.openStash(hit.site);
      return true;
    }
    if (hit.kind === "ford-back") {
      const shore = { x: hit.site.x, y: hit.site.y };
      this.splash(this.host.playerTile());
      this.host.movePlayerTo(shore.x, shore.y);
      this.splash(shore);
      playAbilitySfx(this.host.scene);
      return true;
    }
    const ability = ABILITIES[hit.site.ability];
    const user = findAbilityUser(getActiveCreatures(), hit.site.ability);
    if (!user) {
      // No able companion: leave E for gathering (hint stays in the prompt).
      return false;
    }
    const until = this.cooldownUntil[ability.id] ?? 0;
    if (now < until) {
      this.host.toast(`${displayName(user)} needs a breather (${Math.ceil((until - now) / 1000)}s).`, false);
      return true;
    }
    this.cooldownUntil[ability.id] = now + ability.cooldownMs;
    playAbilitySfx(this.host.scene);
    const bondTierUp = grantsAbilityBond(hit, getClaimedSites())
      ? addBond(user, BOND_GAIN.ability, "ability").tierUp
      : undefined;
    const site = hit.site;

    if (site.ability === "ford" && site.landing) {
      this.splash(this.host.playerTile());
      this.host.movePlayerTo(site.landing.x, site.landing.y);
      this.splash(site.landing);
      this.host.toast(`${displayName(user)} carries you across the shallows.`, true);
    } else {
      const at = this.host.groundAt(site.x, site.y);
      this.host.fx()?.abilityBurst(at.x, at.y - 12, site.ability);
      this.clearSite(site.id);
      const loot = claimSite(site.id);
      if (site.revealsProp) {
        this.host.spawnProp(site.x, site.y, site.revealsProp);
      }
      const what = site.ability === "burn" ? "burns away the brush" : "sniffs out a hidden node";
      this.host.toast(`${displayName(user)} ${what}!${loot ? `\n${loot}` : ""}`, true);
    }
    if (bondTierUp === undefined) {
      this.cheer(user);
    }
    return true;
  }

  private openStash(site: CompanionSite): void {
    // The ford bond lands here, once, when the islet stash is claimed.
    const carrier = findAbilityUser(getActiveCreatures(), site.ability);
    if (carrier && grantsAbilityBond({ kind: "stash", site }, getClaimedSites())) {
      addBond(carrier, BOND_GAIN.ability, "ability");
    }
    const loot = claimSite(site.id);
    if (!loot || !site.stash) return;
    this.clearSite(site.id, true);
    const at = this.host.groundAt(site.stash.x, site.stash.y);
    this.host.fx()?.gatherBurst(at.x, at.y - 10, 0xf0c860);
    playAbilitySfx(this.host.scene);
    this.host.toast(`Islet stash!\n${loot}`, true);
  }

  private splash(tile: { x: number; y: number }): void {
    const at = this.host.groundAt(tile.x, tile.y);
    this.host.fx()?.abilityBurst(at.x, at.y - 6, "ford");
  }

  private cheer(creature: CreatureInstance): void {
    const fx = this.host.fx();
    const index = this.followerIndex(creature.instanceId);
    if (fx && index >= 0) {
      fx.showBark(this.host.followerSprites(), index, "Did it!");
    }
  }

  private followerIndex(instanceId: string): number {
    return selectOverworldFollowers(getActiveCreatures(), MAX_FOLLOWERS).findIndex(
      (c) => c.instanceId === instanceId,
    );
  }

  /** Grid tile a curious follower should drift toward, if any. */
  curiousSpot(): { x: number; y: number } | undefined {
    const { x, y } = this.host.playerTile();
    return nearestCuriousSpot(this.host.zoneId(), x, y, getClaimedSites());
  }

  /** Per-frame: celebrate bond tier-ups and offer nicknames to new friends. */
  update(): void {
    for (const up of drainBondTierUps()) {
      const creature = getCreatureInstance(up.instanceId);
      if (!creature) continue;
      const player = this.host.playerTile();
      this.host.fx()?.bondTierUp(
        this.host.followerSprites(),
        this.followerIndex(up.instanceId),
        this.host.groundAt(player.x, player.y),
      );
      this.host.toast(`Bond deepened: ${displayName(creature)} is now ${bondTierName(up.tier)}!`, true);
    }

    if (playerParty.creatures.length !== this.knownIds.size) {
      for (const creature of playerParty.creatures) {
        if (!this.knownIds.has(creature.instanceId)) {
          this.knownIds.add(creature.instanceId);
          if (!creature.nickname && !isVisitorMode()) {
            this.nicknameQueue.push(creature.instanceId);
          }
        }
      }
      // Removals (fusion inputs) shrink the party; resync the set.
      if (playerParty.creatures.length !== this.knownIds.size) {
        this.knownIds = new Set(playerParty.creatures.map((c) => c.instanceId));
      }
    }
    if (
      canOpenNicknamePrompt({
        queued: this.nicknameQueue.length,
        promptOpen: isNicknamePromptOpen(),
        busy: this.host.isBusy(),
        topOverlay: getTopOverlayId(),
      })
    ) {
      const creature = getCreatureInstance(this.nicknameQueue.shift()!);
      if (creature) {
        void promptNickname(creature);
      }
    }
  }
}

export function displayName(creature: CreatureInstance): string {
  return creature.nickname ?? getCreatureDefinition(creature.definitionId).name;
}
