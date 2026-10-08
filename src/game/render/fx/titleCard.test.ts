import { beforeEach, describe, expect, it } from "vitest";
import { isZoneTitleCardShowing, showZoneTitleCard } from "./titleCard";

beforeEach(() => {
  document.body.innerHTML = '<div id="game"></div>';
});

describe("isZoneTitleCardShowing (#401)", () => {
  it("is false before any card, true while it animates, false once it fades out", () => {
    expect(isZoneTitleCardShowing()).toBe(false);
    showZoneTitleCard("Mossgrove", "morning");
    expect(isZoneTitleCardShowing()).toBe(true);
    document.getElementById("zone-title-card")!.dispatchEvent(new Event("animationend"));
    expect(isZoneTitleCardShowing()).toBe(false);
  });
});
