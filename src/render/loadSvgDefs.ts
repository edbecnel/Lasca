const SVG_NS = "http://www.w3.org/2000/svg";

function ensureDefs(svgRoot: SVGSVGElement): SVGDefsElement {
  let defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }
  return defs;
}

export async function loadSvgDefsInto(targetEl: Element, urls: Array<string | URL>): Promise<void> {
  if (!targetEl) throw new Error("loadSvgDefsInto: targetEl is required");
  if (!Array.isArray(urls) || urls.length === 0) return;

  for (const url of urls) {
    const href = String(url);
    // These SVGs are fetched at runtime (not imported as modules), so HMR/caching can
    // otherwise make iterative theme tweaks appear to have "no effect".
    const fetchUrl = (import.meta as any)?.env?.DEV
      ? `${href}${href.includes("?") ? "&" : "?"}t=${Date.now()}`
      : href;

    const res = await fetch(fetchUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`loadSvgDefsInto: failed to fetch ${String(url)} (${res.status})`);
    }

    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const extDefs = doc.querySelector("defs");
    const nodes = extDefs ? Array.from(extDefs.children) : Array.from(doc.documentElement.children);
    for (const node of nodes) {
      targetEl.appendChild(document.importNode(node, true));
    }
  }
}

export async function loadSvgDefs(svgRoot: SVGSVGElement, urls: Array<string | URL>): Promise<void> {
  if (!svgRoot) throw new Error("loadSvgDefs: svgRoot is required");
  const defs = ensureDefs(svgRoot);
  await loadSvgDefsInto(defs, urls);
}
