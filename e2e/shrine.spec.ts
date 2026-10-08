import { expect, test, type Page } from "@playwright/test";

/** Dev server only: reach the live game modules to stage a mid-story save. */
async function openShrineAtStory3(page: Page): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Playwright");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#status-panel")).toBeVisible();
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __game?: Phaser.Game }).__game?.scene
        .getScene("IsometricScene")
        ?.sys?.isActive(),
    ),
  );

  await page.evaluate(async () => {
    const quests = await import("/src/game/story/questProgress.ts");
    quests.restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
    });
    const inventory = await import("/src/game/inventory/playerInventory.ts");
    inventory.setInventoryFromSnapshot(
      {
        "moss-fiber": 2,
        "folklore-dust": 1,
        stone: 3,
        pebble: 2,
        "wild-fiber": 4,
        "ember-ash": 1,
      },
      {},
    );
    const party = await import("/src/game/creatures/party.ts");
    if (!party.hasCreature("mossling")) {
      party.addToParty("mossling");
    }
    const disclosure = await import("/src/game/shrine/shrineDisclosure.ts");
    disclosure.resetShrineDisclosure();
    // Adding a companion opens the nickname prompt; dismiss it for the test.
    document.getElementById("nickname-overlay")?.remove();
    (await import("/src/game/ui/overlayStack.ts")).popOverlay("nickname");

    const game = (window as unknown as { __game: Phaser.Game }).__game;
    game.scene.getScene("IsometricScene").scene.pause();
    game.scene.run("ShrineScene", { mode: "altar" });
  });
  await expect(page.locator(".shrine-panel")).toBeVisible();
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`shrine guides the first craft into Fusion at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openShrineAtStory3(page);

    // The quest recipe is suggested, never a Wood Cudgel.
    const banner = page.locator("[data-craft-suggest]");
    await expect(banner).toHaveAttribute("data-craft-suggest", "moss-salve");
    await expect(page.locator(".shrine-tab")).toHaveText(["Craft", "Use"]);

    // The panel stays inside the stage; the body scrolls instead of clipping.
    const panelBox = await page.locator(".shrine-panel").boundingBox();
    const stageBox = await page.locator("#game").boundingBox();
    expect(panelBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(stageBox!.x - 1);
    expect(panelBox!.y).toBeGreaterThanOrEqual(stageBox!.y - 1);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(
      stageBox!.x + stageBox!.width + 1,
    );
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(
      stageBox!.y + stageBox!.height + 1,
    );

    // One tap fills the real grid; one more crafts.
    await page.locator('[data-craft-action="fill-grid"]').click();
    await expect(page.locator("[data-craft-result]")).toBeEnabled();
    await page.locator('[data-craft-action="craft-now"]').click();

    // Fusion appears live, pulsing and focused, without leaving the altar.
    const fusionTab = page.locator('[data-shrine-tab="fusion"]');
    await expect(fusionTab).toBeVisible();
    await expect(fusionTab).toHaveClass(/is-new/);
    await expect(fusionTab).toBeFocused();

    await page.locator('[data-craft-action="go-fusion"]').click();
    await expect(fusionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".sh-row", { hasText: "Mossling" })).toBeVisible();
  });
}

test("shrine panel hides during the evolution cutscene and returns after Continue", async ({
  page,
}) => {
  await openShrineAtStory3(page);
  await page.locator('[data-craft-action="fill-grid"]').click();
  await page.locator('[data-craft-action="craft-now"]').click();
  await page.locator('[data-craft-action="go-fusion"]').click();
  await page.locator(".sh-row", { hasText: "Mossling" }).click();

  const activeScenes = () =>
    page.evaluate(() =>
      (window as unknown as { __game: Phaser.Game }).__game.scene
        .getScenes(true)
        .map((s) => s.scene.key),
    );
  await expect.poll(activeScenes).toContain("EvolutionScene");
  await expect(page.locator(".shrine-root")).toBeHidden();
  await expect(page.locator(".shrine-craft-host .crafting-grid")).toBeHidden();

  // Advance the cutscene until it hands control back to the shrine.
  await expect(async () => {
    await page.keyboard.press("Space");
    expect(await activeScenes()).not.toContain("EvolutionScene");
  }).toPass({ timeout: 20_000, intervals: [700] });
  await expect(page.locator(".shrine-root")).toBeVisible();
  await expect(page.locator('[data-shrine-tab="fusion"]')).toBeFocused();
});

test("Use tab empty state sends the player back to Craft", async ({ page }) => {
  await openShrineAtStory3(page);
  await page.locator('[data-shrine-tab="use"]').click();
  await expect(page.getByText("Nothing to use yet")).toBeVisible();
  await page.locator("[data-shrine-go-craft]").click();
  await expect(page.locator('[data-shrine-tab="craft"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("[data-craft-suggest]")).toBeVisible();
});

test("Esc closes the shrine and resumes the world", async ({ page }) => {
  await openShrineAtStory3(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".shrine-panel")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/shrine-active/);
});
