import { describe, expect, it } from "vitest";
import { shouldResetHostSave } from "./bootParams";

describe("shouldResetHostSave", () => {
  it("never resets when a valid invite is present, even with ?new=1", () => {
    expect(
      shouldResetHostSave("ok", new URLSearchParams("join=abc&new=1")),
    ).toBe(false);
  });

  it("resets on ?new=1 with no invite param", () => {
    expect(shouldResetHostSave("absent", new URLSearchParams("new=1"))).toBe(
      true,
    );
  });

  it("never resets on an invalid invite, even with ?new=1", () => {
    expect(
      shouldResetHostSave("invalid", new URLSearchParams("join=broken&new=1")),
    ).toBe(false);
  });

  it("does not reset without ?new", () => {
    expect(shouldResetHostSave("absent", new URLSearchParams(""))).toBe(false);
  });

  it("never resets when a share card is present, even with ?new=1", () => {
    expect(
      shouldResetHostSave("absent", new URLSearchParams("card=abc&new=1")),
    ).toBe(false);
  });
});
