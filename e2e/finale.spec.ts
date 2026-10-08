import { expect, test, type Page } from "@playwright/test";

/**
 * The ending, end to end (#401): win the Cinder Matriarch fight (dev handle
 * on the live BattleScene), carry the egg to the Moon Shrine, watch the
 * hatch cutscene, and continue through the finale card. Dev-server only:
 * scenes come from `window.__game`, state from the app's own modules.
 */

type Scenes = { isActive(key: string): boolean; getScene(key: string): unknown };
type Win = Window & { __game?: { scene: Scenes } };
type SceneHost = { scene: { pause(): void; launch(key: string, data: object): void } };

const active = (page: Page, key: string): Promise<boolean> =>
  page.evaluate((k) => Boolean((window as Win).__game?.scene.isActive(k)), key);

/** Press `key` until `done()` holds (dialogue lines, result panels). */
async function pressUntil(page: Page, key: string, done: () => Promise<boolean>, timeout = 20_000): Promise<void> {
  await expect(async () => {
    if (!(await done())) {
      await page.keyboard.press(key);
    }
    expect(await done()).toBe(true);
  }).toPass({ timeout, intervals: [350] });
}

/** New save with a level-12 party, the story at `questId`. */
async function seed(page: Page, questId: string): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Finn");
  await page.locator("#name-intro-submit").click();
  await expect.poll(() => active(page, "IsometricScene"), { timeout: 20_000 }).toBe(true);
  // Let the opening beat settle before seeding the late-game state.
  await page.waitForTimeout(1500);
  await page.evaluate(async (quest) => {
    const party = await import("/src/game/creatures/party.ts");
    party.addToParty("mossling", 12);
    party.addToParty("brook-nymph", 12);
    party.addToParty("ember-wisp", 12);
    const quests = await import("/src/game/story/questProgress.ts");
    const { QUEST_ORDER } = await import("/src/game/story/quests.ts");
    const progress = quests.createEmptyQuestProgress();
    const at = QUEST_ORDER.indexOf(quest as never);
    QUEST_ORDER.forEach((id, i) => {
      progress[id] = i < at ? "complete" : i === at ? "active" : "locked";
    });
    quests.restoreQuestProgress(progress);
  }, questId);
}

/** Warp to the Moon Shrine and open Wren's finale dialogue. */
async function talkToWrenAtShrine(page: Page): Promise<void> {
  await page.evaluate(() => {
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as SceneHost & {
      playerGridX: number;
      playerGridY: number;
      loadZone(zone: string): void;
      syncPlayerToGrid(): void;
    };
    iso.playerGridX = 3;
    iso.playerGridY = 7;
    iso.loadZone("shrine");
    iso.syncPlayerToGrid();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as SceneHost;
    iso.scene.pause();
    iso.scene.launch("DialogueScene", { npcId: "rival-wren" });
  });
}

const dialogueLine = (page: Page): Promise<number> =>
  page.evaluate(() => ((window as Win).__game!.scene.getScene("DialogueScene") as { lineIndex: number }).lineIndex);

test("boss win -> hatch cutscene at the shrine -> finale card -> keep exploring", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await seed(page, "cinder-matriarch");
  await page.evaluate(() => {
    const iso = (window as Win).__game!.scene.getScene("IsometricScene") as SceneHost;
    iso.scene.pause();
    iso.scene.launch("DialogueScene", { npcId: "cinder-matriarch" });
  });

  // Challenge -> the real boss battle.
  await pressUntil(page, "Enter", () => active(page, "BattleScene"));
  await page.waitForTimeout(2500);
  type Battle = {
    wild: { currentHp: number; maxHp: number };
    player: { moves: unknown[] };
    wildSprite: { frame: { name: string } };
    refreshHp(): void;
    playerTurn(move: unknown): void;
    endBattle(won: boolean): void;
  };
  // Knock her across half: Cinder form must swap to its own art (#401).
  await page.evaluate(() => {
    const battle = (window as Win).__game!.scene.getScene("BattleScene") as Battle;
    battle.wild.currentHp = Math.round(battle.wild.maxHp * 0.5) + 1;
    battle.refreshHp();
    battle.playerTurn(battle.player.moves[0]);
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => ((window as Win).__game!.scene.getScene("BattleScene") as Battle).wildSprite.frame.name,
        ),
      { timeout: 10_000 },
    )
    .toMatch(/^creature-cinder-matriarch-phase2-battle/);
  // Then win it through the dev handle.
  await page.evaluate(() => {
    const battle = (window as Win).__game!.scene.getScene("BattleScene") as Battle;
    battle.wild.currentHp = 0;
    battle.refreshHp();
    battle.endBattle(true);
  });
  // Result panel -> victory narration -> back in the world, egg in hand.
  await pressUntil(page, "Enter", () => active(page, "DialogueScene"));
  await pressUntil(page, "Enter", async () => !(await active(page, "DialogueScene")));
  expect(
    await page.evaluate(async () => (await import("/src/game/story/questProgress.ts")).getActiveQuestId()),
  ).toBe("shrine-finale");

  await talkToWrenAtShrine(page);

  // Two lines in, the hatch takes the stage with the HUD locked.
  await pressUntil(page, "Enter", () => active(page, "HatchScene"));
  await expect(page.locator("body")).toHaveClass(/cutscene-active/);
  // Cinderling was added (and saved) before the animation.
  expect(
    await page.evaluate(async () => {
      const { playerParty } = await import("/src/game/creatures/party.ts");
      return playerParty.creatures.some((c) => c.nickname === "Cinderling" && c.rare === true);
    }),
  ).toBe(true);
  await page.waitForTimeout(1200);
  // Skip to Wren's reaction, then continue: back on the hatch narration line.
  await pressUntil(page, "Space", async () => !(await active(page, "HatchScene")));
  await expect(page.locator("body")).not.toHaveClass(/cutscene-active/);
  expect(await dialogueLine(page)).toBe(2);

  // Voyage hook, then the finale card on close.
  await pressUntil(page, "Enter", () => active(page, "FinaleScene"));
  await expect(page.locator("body")).toHaveClass(/cutscene-active/);
  await pressUntil(page, "Enter", async () => !(await active(page, "FinaleScene")));
  await expect.poll(() => active(page, "IsometricScene")).toBe(true);
  expect(
    await page.evaluate(async () => (await import("/src/game/world/worldState.ts")).worldState.storyFinaleCardShown),
  ).toBe(true);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("a hatch cutscene that fails to build never strands the dialogue", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, "shrine-finale");
  // Force HatchScene's build to throw.
  await page.evaluate(async () => {
    const { HatchScene } = await import("/src/game/finale/HatchScene.ts");
    (HatchScene.prototype as unknown as { build(): void }).build = () => {
      throw new Error("probe: hatch build failed");
    };
  });
  await talkToWrenAtShrine(page);
  // Past the egg line: the failed cutscene hands straight back.
  await expect
    .poll(
      async () => {
        if ((await active(page, "DialogueScene")) && (await dialogueLine(page)) < 2) {
          await page.keyboard.press("Enter");
        }
        return (await active(page, "DialogueScene")) ? dialogueLine(page) : -1;
      },
      { timeout: 15_000, intervals: [400] },
    )
    .toBe(2);
  await expect.poll(() => active(page, "HatchScene")).toBe(false);
  await expect(page.locator("body")).not.toHaveClass(/cutscene-active/);
  // The dialogue still advances and closes into the finale card.
  await pressUntil(page, "Enter", () => active(page, "FinaleScene"));
});
