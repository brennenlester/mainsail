import { beforeEach, describe, expect, it } from "vitest";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import { resetShrineDisclosure } from "./shrineDisclosure";
import {
  currentShrineTabs,
  newlyRevealedTabs,
  resolveInitialTab,
  shrineTabs,
} from "./shrineTabs";

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id);

describe("shrineTabs", () => {
  beforeEach(() => {
    resetShrineDisclosure();
    setInventoryFromSnapshot({}, {});
  });

  it("hides Fusion until disclosed and never shows it from a portable shrine", () => {
    expect(ids(shrineTabs("altar", false))).toEqual(["craft", "use"]);
    expect(ids(shrineTabs("altar", true))).toEqual(["craft", "use", "fusion"]);
    expect(ids(shrineTabs("portable", true))).toEqual(["craft", "use"]);
  });

  it("reveals Fusion live the moment a growth relic lands in the pack", () => {
    const before = ids(currentShrineTabs("altar"));
    expect(before).not.toContain("fusion");

    // Crafting Moss Salve at the altar.
    setInventoryFromSnapshot({}, { "moss-salve": 1 });
    const after = ids(currentShrineTabs("altar"));
    expect(after).toContain("fusion");
    expect(newlyRevealedTabs(before as never, after as never)).toEqual([
      "fusion",
    ]);
  });

  it("keeps Fusion once disclosed even if the relic is used up", () => {
    setInventoryFromSnapshot({}, { "moss-salve": 1 });
    expect(ids(currentShrineTabs("altar"))).toContain("fusion");
    setInventoryFromSnapshot({}, {});
    expect(ids(currentShrineTabs("altar"))).toContain("fusion");
  });

  it("reports nothing new when the list is unchanged", () => {
    expect(newlyRevealedTabs(["craft", "use"], ["craft", "use"])).toEqual([]);
  });

  it("only opens a requested tab that exists", () => {
    const withFusion = shrineTabs("altar", true);
    expect(resolveInitialTab("fusion", withFusion)).toBe("fusion");
    expect(resolveInitialTab("fusion", shrineTabs("altar", false))).toBe("craft");
    expect(resolveInitialTab(undefined, withFusion)).toBe("craft");
  });
});
