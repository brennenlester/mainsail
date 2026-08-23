import { describe, expect, it } from "vitest";
import {
  getIngredientIconSrc,
  getMaterialIconSrc,
} from "../inventory/materials";
import { appendMaterialVisual } from "./materialIcon";

describe("appendMaterialVisual", () => {
  it("places the name above the icon on list rows", () => {
    const el = document.createElement("div");
    appendMaterialVisual(el, "wood", { showName: true });
    const label = el.querySelector(".material-icon-name");
    const img = el.querySelector("img.material-icon");
    expect(label?.compareDocumentPosition(img!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const imgEl = el.querySelector("img.material-icon");
    expect(imgEl).toBeInstanceOf(HTMLImageElement);
    expect(imgEl?.getAttribute("src")).toBe(getMaterialIconSrc("wood"));
    expect(imgEl?.getAttribute("aria-hidden")).toBe("true");
    expect((imgEl as HTMLImageElement).draggable).toBe(false);
    expect(label?.textContent).toBe("Wood");
    expect(label?.classList.contains("visually-hidden")).toBe(false);
    expect(el.classList.contains("ingredient-visual")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Wood");
    expect(el.title).toBe("Wood");
  });

  it("keeps a visually hidden name on cells when an icon exists", () => {
    const el = document.createElement("button");
    appendMaterialVisual(el, "pebble", { showName: false });
    expect(el.querySelector("img.material-icon")?.getAttribute("src")).toBe(
      getMaterialIconSrc("pebble"),
    );
    const label = el.querySelector(".material-icon-name");
    expect(label?.textContent).toBe("Pebble");
    expect(label?.classList.contains("visually-hidden")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Pebble");
  });

  it("reveals the label when img load errors (showName false)", () => {
    const el = document.createElement("button");
    appendMaterialVisual(el, "stone", { showName: false });
    const img = el.querySelector("img.material-icon");
    img?.dispatchEvent(new Event("error"));
    expect(el.querySelector("img.material-icon")).toBeNull();
    const label = el.querySelector(".material-icon-name");
    expect(label?.textContent).toBe("Stone");
    expect(label?.classList.contains("visually-hidden")).toBe(false);
  });

  it("resolves item icons for craft outputs", () => {
    const el = document.createElement("div");
    appendMaterialVisual(el, "brook-tonic", { showName: true });
    expect(el.querySelector("img.material-icon")?.getAttribute("src")).toBe(
      getIngredientIconSrc("brook-tonic"),
    );
    expect(el.querySelector(".material-icon-name")?.textContent).toBe(
      "Brook Tonic",
    );
  });

  it("shows the name for unknown catalog ids without icons", () => {
    const el = document.createElement("button");
    appendMaterialVisual(el, "not-in-catalog", { showName: false });
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".material-icon-name")?.textContent).toBe(
      "not-in-catalog",
    );
    expect(
      el.querySelector(".material-icon-name")?.classList.contains(
        "visually-hidden",
      ),
    ).toBe(false);
  });
});
