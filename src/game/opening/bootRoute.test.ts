import { describe, expect, it } from "vitest";
import {
  getBootContext,
  hasDevPreviewParam,
  resolveBootRoute,
  setBootContext,
} from "./bootRoute";

const plain = { visitor: false, newGame: false, devPreview: false };

describe("resolveBootRoute", () => {
  it("shows the title on a plain host boot", () => {
    expect(resolveBootRoute(plain)).toBe("title");
  });

  it("bypasses the title for a visitor ?join= link", () => {
    expect(resolveBootRoute({ ...plain, visitor: true })).toBe("play");
  });

  it("?new=1 skips the title straight to the name intro", () => {
    expect(resolveBootRoute({ ...plain, newGame: true })).toBe("play");
  });

  it("dev ?encounter= / ?spar= previews bypass the title", () => {
    expect(resolveBootRoute({ ...plain, devPreview: true })).toBe("play");
  });
});

describe("hasDevPreviewParam", () => {
  it("detects encounter and spar previews only", () => {
    expect(hasDevPreviewParam(new URLSearchParams("encounter=ember-wisp"))).toBe(true);
    expect(hasDevPreviewParam(new URLSearchParams("spar=mossling"))).toBe(true);
    expect(hasDevPreviewParam(new URLSearchParams("time=0.8"))).toBe(false);
  });
});

describe("boot context", () => {
  it("round-trips route and save presence", () => {
    setBootContext({ route: "title", hasSave: true });
    expect(getBootContext()).toEqual({ route: "title", hasSave: true });
    setBootContext({ route: "play", hasSave: false });
    expect(getBootContext().route).toBe("play");
  });
});
