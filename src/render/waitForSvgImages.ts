const XLINK_NS = "http://www.w3.org/1999/xlink";

function getImageHref(img: SVGImageElement): string | null {
  return img.getAttribute("href") ?? img.getAttributeNS(XLINK_NS, "href") ?? img.getAttribute("xlink:href");
}

function isPreloadableHref(href: string): boolean {
  // Ignore inline/data images.
  if (/^(data:|blob:)/i.test(href)) return false;
  return href.trim().length > 0;
}

function preloadOne(href: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const img = new Image();

      const done = () => resolve();

      img.onload = () => {
        // If available, wait for decode so it's actually ready to paint.
        const anyImg = img as any;
        if (typeof anyImg.decode === "function") {
          void anyImg.decode().then(done).catch(done);
        } else {
          done();
        }
      };
      img.onerror = done;

      img.src = href;
    } catch {
      resolve();
    }
  });
}

export async function waitForSvgImagesLoaded(
  svgRoot: ParentNode,
  opts: { selector?: string; timeoutMs?: number } = {},
): Promise<void> {
  const selector = opts.selector ?? "image";
  const timeoutMs = Math.max(0, Math.floor(opts.timeoutMs ?? 30_000));

  const imgs = Array.from(svgRoot.querySelectorAll(selector)) as SVGImageElement[];
  if (imgs.length === 0) return;

  const hrefs = new Set<string>();
  for (const img of imgs) {
    const href = getImageHref(img);
    if (!href) continue;
    if (!isPreloadableHref(href)) continue;
    hrefs.add(href);
  }

  if (hrefs.size === 0) return;

  const all = Promise.all(Array.from(hrefs, (h) => preloadOne(h)));
  if (!timeoutMs) {
    await all;
    return;
  }

  await Promise.race([
    all,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}
