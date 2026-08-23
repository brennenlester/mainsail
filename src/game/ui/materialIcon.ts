import {
  getIngredientIconSrc,
  getIngredientName,
} from "../inventory/materials";

export function appendMaterialVisual(
  el: HTMLElement,
  ingredientId: string,
  options: { showName: boolean },
): void {
  const name = getIngredientName(ingredientId);
  el.title = name;
  el.setAttribute("aria-label", name);
  el.classList.add("ingredient-visual");

  const label = document.createElement("span");
  label.className = "material-icon-name";
  label.textContent = name;
  if (!options.showName) {
    label.classList.add("visually-hidden");
  }
  el.appendChild(label);

  const src = getIngredientIconSrc(ingredientId);
  if (src) {
    const img = document.createElement("img");
    img.className = "material-icon";
    img.src = src;
    img.alt = "";
    img.draggable = false;
    img.setAttribute("aria-hidden", "true");
    img.addEventListener("error", () => {
      img.remove();
      label.classList.remove("visually-hidden");
    });
    el.appendChild(img);
  } else {
    label.classList.remove("visually-hidden");
  }
}
