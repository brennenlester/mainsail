import { expect, test, type Page } from "@playwright/test";

async function enterWorld(page: Page): Promise<void> {
  await page.goto("/?new=1");
  await page.locator("#name-intro-input").fill("Layout");
  await page.locator("#name-intro-submit").click();
  await expect(page.locator("#name-intro")).toBeHidden();
  await expect(page.locator("#status-panel")).toBeVisible();
}

const VIEWPORTS = [
  { name: "desktop 1280x800", width: 1280, height: 800 },
  { name: "tablet 1024x768", width: 1024, height: 768 },
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "small phone 360x640", width: 360, height: 640 },
] as const;

for (const vp of VIEWPORTS) {
  test(`stage fills the viewport with no page scroll (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await enterWorld(page);
    // The canvas resizes after the first layout pass.
    await expect
      .poll(async () => {
        const canvas = await page.locator("#game canvas").boundingBox();
        const dock = await page.locator("#status-panel").boundingBox();
        if (!canvas || !dock) return false;
        // Canvas spans the full width and everything above the dock.
        return (
          Math.abs(canvas.width - vp.width) <= 2 &&
          Math.abs(canvas.height + dock.height - vp.height) <= 3
        );
      })
      .toBe(true);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);
  });
}

test("page backdrop is themed navy, not pale mint", async ({ page }) => {
  await page.goto("/");
  const [r, g, b] = await page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? [];
    return m.slice(0, 3).map(Number);
  });
  expect(r + g + b).toBeLessThan(255); // dark
  expect(b).toBeGreaterThan(r);
});

test("status dock tells the story in player words and keeps one stable button row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterWorld(page);
  await expect(page.locator("#status-gate")).toHaveText(/^Story 1\/8 — next: /);
  await expect(page.locator("#status-gate")).not.toContainText("LOCKED");
  const row = await page.locator("#status-actions").boundingBox();
  expect(row?.height ?? 999).toBeLessThan(60);
  // Audio / reset live in the menu, not the primary row.
  await expect(page.locator("#mute-audio-btn")).toBeHidden();
  await page.locator("#status-overflow-btn").click();
  await expect(page.locator("#mute-audio-btn")).toBeVisible();
});

test("full-screen scenes lock the HUD: story card, caption and dock step aside", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enterWorld(page);
  await expect(page.locator("#quest-hud")).toBeVisible();

  await page.evaluate(() => document.body.classList.add("cutscene-active"));
  await expect(page.locator("#quest-hud")).toBeHidden();
  await expect(page.locator("#status-panel")).toHaveAttribute("inert", "");

  await page.evaluate(() => document.body.classList.remove("cutscene-active"));
  await expect(page.locator("#quest-hud")).toBeVisible();
  await expect(page.locator("#status-panel")).not.toHaveAttribute("inert", "");
});

for (const vp of [
  { name: "phone landscape 844x390", width: 844, height: 390 },
  { name: "phone portrait 360x640", width: 360, height: 640 },
  { name: "desktop 1280x800", width: 1280, height: 800 },
] as const) {
  test(`the "…" menu is fully on screen and every item is clickable (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await enterWorld(page);
    await page.locator("#status-overflow-btn").click();
    const items = page.locator(
      "#status-overflow-menu button:visible, #status-overflow-menu input:visible",
    );
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2); // at least Mute + Volume
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      await item.scrollIntoViewIfNeeded();
      const box = await item.boundingBox();
      expect(box, `item ${i} has a box`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      // Actionability check without firing (Reset would reload the page).
      await item.click({ trial: true });
    }
    const menu = await page.locator("#status-overflow-menu").boundingBox();
    expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(vp.height);
  });
}

test("the menu is a plain disclosure: named button, focus in on open, Escape returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterWorld(page);
  const button = page.locator("#status-overflow-btn");
  await expect(button).toHaveAttribute("aria-label", "More: sound, invite, reset");
  await expect(button).toHaveAttribute("aria-controls", "status-overflow-menu");
  await expect(page.locator("#status-overflow-menu [role=menuitem]")).toHaveCount(0);
  await expect(page.locator("#status-overflow-menu")).not.toHaveAttribute("role", "menu");

  // Keyboard user: any Tab leaves pointer mode (canvas focus hand-back stands
  // down), then the button takes focus and opens with Enter.
  await page.keyboard.press("Tab");
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#status-overflow-menu :focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#status-overflow-menu")).toBeHidden();
  await expect(button).toBeFocused();
});
