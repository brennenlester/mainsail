import { describe, expect, it, vi } from "vitest";
import { formatLoadError, warnOnLoadError } from "./loadError";

describe("load error warning", () => {
  it("names the failed key and url", () => {
    const line = formatLoadError({ key: "creature-x", url: "assets/creatures/x.png" });
    expect(line).toContain('"creature-x"');
    expect(line).toContain("assets/creatures/x.png");
  });

  it("falls back to src and tolerates missing fields", () => {
    expect(formatLoadError({ key: "k", src: "a/b.png" })).toContain("a/b.png");
    expect(formatLoadError(undefined)).toContain("<unknown key>");
  });

  it("warns only in dev", () => {
    const warn = vi.fn();
    warnOnLoadError({ key: "k", url: "u" }, false, warn);
    expect(warn).not.toHaveBeenCalled();
    warnOnLoadError({ key: "k", url: "u" }, true, warn);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
