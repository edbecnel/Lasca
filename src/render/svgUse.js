// src/render/svgUse.js

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Creates an SVG <use> element.
 */
export function makeUse(href, x, y, size){
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS(XLINK_NS, "xlink:href", href);

  use.setAttribute("width", String(size));
  use.setAttribute("height", String(size));
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));
  return use;
}
