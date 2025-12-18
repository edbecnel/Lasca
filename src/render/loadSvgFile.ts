export async function loadSvgFileInto(containerEl: HTMLElement, url: string | URL): Promise<SVGSVGElement> {
  if (!containerEl) throw new Error("loadSvgFileInto: containerEl is required");

  const res = await fetch(url as string);
  if (!res.ok) {
    throw new Error(`loadSvgFileInto: failed to fetch ${String(url)} (${res.status})`);
  }

  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");

  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") {
    throw new Error(`loadSvgFileInto: ${String(url)} did not parse as an <svg> root`);
  }

  const imported = document.importNode(svg, true) as unknown as SVGSVGElement;
  containerEl.replaceChildren(imported);
  return imported;
}
