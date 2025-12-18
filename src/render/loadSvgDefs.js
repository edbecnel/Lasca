// src/render/loadSvgDefs.js

/**
 * Loads one or more external SVG files and merges their <defs> children into a target container.
 *
 * Why we do this:
 * - Your runtime <use href="#W_S"> etc continue to work unchanged.
 * - Masks/gradients/symbols live in external files for easier management/replacement.
 * - Avoids cross-file <use href="file.svg#symbol"> compatibility issues across browsers.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Ensures svgRoot has a <defs> element and returns it.
 * @param {SVGSVGElement} svgRoot
 * @returns {SVGDefsElement}
 */
function ensureDefs(svgRoot){
  let defs = svgRoot.querySelector("defs");
  if (!defs){
    defs = document.createElementNS(SVG_NS, "defs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }
  return defs;
}

/**
 * Loads defs into a specific container element (often a <g> inside <defs>).
 *
 * @param {Element} targetEl - Where imported defs children will be appended.
 * @param {(string|URL)[]} urls - SVG files containing a <defs> section.
 */
export async function loadSvgDefsInto(targetEl, urls){
  if (!targetEl) throw new Error("loadSvgDefsInto: targetEl is required");
  if (!Array.isArray(urls) || urls.length === 0) return;

  for (const url of urls){
    const res = await fetch(url);
    if (!res.ok){
      throw new Error(`loadSvgDefsInto: failed to fetch ${String(url)} (${res.status})`);
    }

    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");

    // Prefer <defs> children; fallback to root children if no <defs>.
    const extDefs = doc.querySelector("defs");
    const nodes = extDefs ? Array.from(extDefs.children) : Array.from(doc.documentElement.children);

    for (const node of nodes){
      targetEl.appendChild(document.importNode(node, true));
    }
  }
}

/**
 * Backwards-compatible helper: loads defs into svgRoot's <defs>.
 *
 * @param {SVGSVGElement} svgRoot
 * @param {(string|URL)[]} urls
 */
export async function loadSvgDefs(svgRoot, urls){
  if (!svgRoot) throw new Error("loadSvgDefs: svgRoot is required");
  const defs = ensureDefs(svgRoot);
  await loadSvgDefsInto(defs, urls);
}
