const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export function makeUse(href: string, x: number, y: number, size: number): SVGUseElement {
  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS(XLINK_NS, "xlink:href", href);

  use.setAttribute("width", String(size));
  use.setAttribute("height", String(size));
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));
  return use;
}
