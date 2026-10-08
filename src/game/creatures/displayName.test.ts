import { describe, expect, it } from "vitest";
import { displayName, displayNameMarked } from "./displayName";

describe("displayName", () => {
  it("prefers the nickname", () => {
    expect(displayName({ definitionId: "thunder-finch", nickname: "Sprout" })).toBe("Sprout");
  });

  it("falls back to the species name", () => {
    expect(displayName({ definitionId: "thunder-finch" })).toBe("Thunder Finch");
  });

  it("ignores a blank nickname", () => {
    expect(displayName({ definitionId: "thunder-finch", nickname: "  " })).toBe("Thunder Finch");
  });

  it("adds the rare marker only for rare creatures", () => {
    expect(displayNameMarked({ definitionId: "thunder-finch", nickname: "Pip", rare: true })).toBe("Pip ✦");
    expect(displayNameMarked({ definitionId: "thunder-finch", nickname: "Pip" })).toBe("Pip");
  });
});
