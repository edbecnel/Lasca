const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function lightDarkTooltipFromHref(href: string): string | null {
  const id = href.startsWith("#") ? href.slice(1) : href;
  if (id.startsWith("W_")) return "Light";
  if (id.startsWith("B_")) return "Dark";
  return null;
}

export function makeUse(href: string, x: number, y: number, size: number): SVGUseElement {
  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS(XLINK_NS, "xlink:href", href);

  use.setAttribute("width", String(size));
  use.setAttribute("height", String(size));
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));

  const tooltip = lightDarkTooltipFromHref(href);
  if (tooltip) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = tooltip;
    use.appendChild(title);
  }
  return use;
}
