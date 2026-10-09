import { afterEach, describe, expect, it, vi } from "vitest";
import { TrialOverlay, type BoonView, type PreviewView } from "./trialUi";

const preview: PreviewView = {
  kicker: "Eclipse Trial · Oct 8, 2026",
  pips: ["now", "todo", "todo", "todo", "todo"],
  score: 0,
  banner: "ROUND 1",
  foeLine: "Lantern Fox · Lv 10",
  foeId: "lantern-fox",
  mods: ["kindled"],
  boons: [],
  animate: false,
};

const boon: BoonView = {
  kicker: "Eclipse Trial",
  pips: ["done", "now", "todo", "todo", "todo"],
  score: 1500,
  banner: "ROUND 1 CLEARED",
  sub: "+1,500 score",
  party: [{ name: "Bramble", hp: 20, max: 40 }],
  nextLine: "Next: Mist Serpent · Lv 11",
  nextMods: ["twin-shadows", "rootbound"],
  offers: ["mend", "keen-edge", "quickened"],
  skipPoints: 150,
  animate: false,
};

const press = (key: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

let ui: TrialOverlay | null = null;
afterEach(() => {
  ui?.destroy();
  ui = null;
});

describe("Eclipse Trial screens (#420)", () => {
  it("round preview: modifiers explained, Enter begins, Esc leaves", () => {
    ui = new TrialOverlay(null);
    const begin = vi.fn();
    const leave = vi.fn();
    ui.renderPreview(preview, begin, leave);
    expect(ui.root.hidden).toBe(false);
    expect(ui.root.querySelector("#trial-title")?.textContent).toBe("ROUND 1");
    expect(ui.root.querySelector(".trial-mod-name")?.textContent).toBe("Kindled");
    expect(ui.root.querySelectorAll(".trial-pip")).toHaveLength(5);
    press("Enter");
    expect(begin).toHaveBeenCalledTimes(1);
    press("Escape");
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("the round a boon shapes names it without repeating 'Next round' (#423)", () => {
    ui = new TrialOverlay(null);
    ui.renderPreview({ ...preview, boons: ["keen-edge"] }, () => undefined, () => undefined);
    const text = ui.root.querySelector(".trial-sheet")!.textContent!;
    expect(text).toContain("Keen Edge: Your companions deal +10% damage.");
    expect(text).not.toContain("Next round");
  });

  it("boon cards answer to 1-3; 4 or S skips; chips show the next round", () => {
    ui = new TrialOverlay(null);
    const pick = vi.fn();
    ui.renderBoon(boon, pick, () => undefined);
    const cards = ui.root.querySelectorAll<HTMLButtonElement>("button.trial-boon");
    expect([...cards].map((c) => c.dataset.boon)).toEqual(["mend", "keen-edge", "quickened"]);
    expect(ui.root.querySelectorAll(".trial-chip")).toHaveLength(2);
    press("2");
    press("4");
    press("s");
    cards[2]!.click();
    expect(pick.mock.calls.map((c) => c[0])).toEqual(["keen-edge", null, null, "quickened"]);
  });

  it("keys go to a sheet opened on top instead (share sheet)", async () => {
    const { pushOverlay, popOverlay } = await import("../ui/overlayStack");
    ui = new TrialOverlay(null);
    const pick = vi.fn();
    ui.renderBoon(boon, pick, () => undefined);
    pushOverlay("share-overlay", () => undefined);
    press("1");
    expect(pick).not.toHaveBeenCalled();
    popOverlay("share-overlay");
    press("1");
    expect(pick).toHaveBeenCalledWith("mend");
  });

  it("renders untrusted text as text, never markup", () => {
    ui = new TrialOverlay(null);
    ui.renderResults(
      {
        kicker: "x",
        pips: ["done", "done", "lost", "todo", "todo"],
        title: '<img src=x onerror="window.__pwned=1">',
        score: 3210,
        breakdown: [["<b>Rounds</b>", "2 / 5"]],
        rewards: ["<script>bad()</script>"],
        lines: ["<i>line</i>"],
        animate: false,
      },
      [{ label: "Done", onClick: () => undefined }],
    );
    expect(ui.root.querySelector("img:not(.trial-card-img)")).toBeNull();
    expect(ui.root.querySelector("script, b, i")).toBeNull();
    expect(ui.root.querySelector(".trial-result-title")?.textContent).toContain("<img");
    expect(ui.root.querySelector(".trial-result-score")?.textContent).toBe("3,210");
  });

  it("hides for battles and gives the keyboard back", () => {
    ui = new TrialOverlay(null);
    const begin = vi.fn();
    ui.renderPreview(preview, begin, () => undefined);
    ui.hide();
    expect(ui.root.hidden).toBe(true);
    press("Enter");
    expect(begin).not.toHaveBeenCalled();
    ui.destroy();
    expect(document.getElementById("trial-overlay")).toBeNull();
  });
});
