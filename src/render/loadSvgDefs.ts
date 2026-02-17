const SVG_NS = "http://www.w3.org/2000/svg";

const XLINK_NS = "http://www.w3.org/1999/xlink";

function getImageHref(img: SVGImageElement): string | null {
  // Prefer modern `href`, but keep xlink for older SVGs/browsers.
  return img.getAttribute("href") ?? img.getAttributeNS(XLINK_NS, "href") ?? img.getAttribute("xlink:href");
}

function setImageHref(img: SVGImageElement, href: string): void {
  img.setAttribute("href", href);
  // Also set xlink:href for maximum compatibility.
  img.setAttributeNS(XLINK_NS, "xlink:href", href);
}

async function urlExists(url: string): Promise<boolean> {
  try {
    // HEAD is cheaper when supported; fall back to GET for static servers that disallow HEAD.
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 403) return false;

    const get = await fetch(url, { method: "GET", cache: "no-store" });
    return get.ok;
  } catch {
    return false;
  }
}

async function fixupImagesInFragment(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("image")) as SVGImageElement[];
  if (images.length === 0) return;

  const base = document.baseURI;
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  await Promise.all(
    images.map(async (img) => {
      const rawHref = getImageHref(img);
      if (!rawHref) return;

      // Don't touch data URLs, blobs, etc.
      if (/^(data:|blob:|https?:)/i.test(rawHref)) return;

      const u = new URL(rawHref, base);
      // In dev, overwriting PNGs can look like "no change" due to caching.
      // Bust cache so iterative art tweaks show up immediately.
      if (isDev) u.searchParams.set("t", String(Date.now()));

      const resolved = u.toString();
      setImageHref(img, resolved);

      const ok = await urlExists(resolved);
      if (!ok) {
        // Avoid the browser's broken-image placeholder; allow fallback vector behind it to show.
        img.remove();
        return;
      }

      // The raster3d theme embeds fallback discs/glyphs behind the <image>.
      // Once we know the image exists, hide those fallback shapes so they don't
      // show through transparent pixels.
      const parent = img.parentElement;
      if (parent) {
        const fallbackUses = Array.from(parent.querySelectorAll("use")) as SVGUseElement[];
        for (const u of fallbackUses) {
          const href = u.getAttribute("href") ?? u.getAttributeNS(XLINK_NS, "href") ?? "";
          if (href.startsWith("#fallback")) {
            u.setAttribute("display", "none");
          }
        }
      }
    }),
  );
}

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
      const imported = document.importNode(node, true);
      // If the theme defs include raster <image> references, make them resolve to the page base
      // and remove missing ones to avoid broken-image placeholders.
      await fixupImagesInFragment(imported as unknown as ParentNode);
      targetEl.appendChild(imported);
    }
  }
}

export async function loadSvgDefs(svgRoot: SVGSVGElement, urls: Array<string | URL>): Promise<void> {
  if (!svgRoot) throw new Error("loadSvgDefs: svgRoot is required");
  const defs = ensureDefs(svgRoot);
  await loadSvgDefsInto(defs, urls);
}
