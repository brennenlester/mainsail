import { describe, expect, it } from "vitest";
import {
  disambiguateNames,
  displayName,
  displayNameIn,
  displayNameMarked,
  displayNameMarkedIn,
} from "./displayName";

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

describe("displayNameIn (#423)", () => {
  const a = { instanceId: "1", definitionId: "mossling", nickname: "Pip" };
  const b = { instanceId: "2", definitionId: "brook-nymph", nickname: "pip", rare: true };
  const c = { instanceId: "3", definitionId: "thunder-finch" };

  it("leaves unique names alone", () => {
    expect(displayNameIn(a, [a, c])).toBe("Pip");
    expect(displayNameIn(c, [a, c])).toBe("Thunder Finch");
  });

  it("marks only the later duplicates in view", () => {
    expect(displayNameIn(a, [a, b, c])).toBe("Pip");
    expect(displayNameIn(b, [a, b, c])).toBe("pip ·2");
    expect(displayNameMarkedIn(b, [a, b, c])).toBe("pip ·2 ✦");
  });

  it("keeps the plain name for a creature outside the view", () => {
    expect(displayNameIn(b, [a, c])).toBe("pip");
  });

  it("disambiguates resolved name lists the same way", () => {
    expect(disambiguateNames(["Pip", "Rill", "pip", "Pip"])).toEqual(["Pip", "Rill", "pip ·2", "Pip ·3"]);
  });
});
