// src/render/loadSvgFile.js

/**
 * Loads an external SVG file and injects it into the DOM as inline SVG.
 * This keeps IDs usable (document.getElementById), allows CSS styling,
 * and enables <use href="#..."> to work with injected <defs>.
 *
 * @param {HTMLElement} containerEl - The element that will receive the inline <svg>.
 * @param {string|URL} url - Path to the SVG file.
 * @returns {Promise<SVGSVGElement>} The injected SVG root element.
 */
export async function loadSvgFileInto(containerEl, url){
  if (!containerEl) throw new Error("loadSvgFileInto: containerEl is required");

  const res = await fetch(url);
  if (!res.ok){
    throw new Error(`loadSvgFileInto: failed to fetch ${String(url)} (${res.status})`);
  }

  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");

  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg"){
    throw new Error(`loadSvgFileInto: ${String(url)} did not parse as an <svg> root`);
  }

  // Import into current document so it becomes "real" DOM (CSS + events + IDs).
  const imported = document.importNode(svg, true);

  // Replace container contents
  containerEl.replaceChildren(imported);

  return imported;
}
