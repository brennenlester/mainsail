import { describe, expect, it } from "vitest";
import { codexZonesHtml } from "./codex";

describe("codexZonesHtml (#391)", () => {
  it("shows art + name for met creatures and a silhouette for the rest", () => {
    const html = codexZonesHtml(new Set(["mossling"]));
    const doc = new DOMParser().parseFromString(html, "text/html");

    const known = doc.querySelector('canvas[data-creature="mossling"]');
    expect(known).not.toBeNull();
    expect(known?.getAttribute("data-silhouette")).toBeNull();
    expect(html).toContain("Mossling");

    // Ember Wisp shares the Grove but has not been met: shape only, no name.
    const unknown = doc.querySelector('canvas[data-creature="ember-wisp"]');
    expect(unknown?.getAttribute("data-silhouette")).toBe("1");
    expect(unknown?.closest("li")?.textContent).toContain("???");
    expect(unknown?.closest("li")?.textContent).not.toContain("Ember Wisp");
  });

  it("keeps every habitat visible with silhouettes while nothing is met there", () => {
    const html = codexZonesHtml(new Set(["mossling"]));
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("section.codex-zone").length).toBeGreaterThan(1);
    expect(doc.querySelectorAll(".codex-zone-locked").length).toBeGreaterThan(0);
  });
});
