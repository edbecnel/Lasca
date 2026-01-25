import { loadSvgDefsInto } from "../render/loadSvgDefs";
import { DEFAULT_THEME_ID, THEMES, getThemeById } from "./themes";
import { createThemeDropdown } from "../ui/components/themeDropdown";

const LS_KEY = "lasca.theme";
const LINK_ID = "lascaThemeCss";

export const THEME_CHANGE_EVENT = "lasca:themechange" as const;

function ensureDefsStructure(svgRoot: SVGSVGElement) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  let defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
    defs.setAttribute("id", "lascaDefs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  let themeDefs = svgRoot.querySelector("#lascaThemeDefs") as SVGGElement | null;
  if (!themeDefs) {
    themeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
    themeDefs.setAttribute("id", "lascaThemeDefs");
    defs.appendChild(themeDefs);
  }

  let runtimeDefs = svgRoot.querySelector("#lascaRuntimeDefs") as SVGGElement | null;
  if (!runtimeDefs) {
    runtimeDefs = document.createElementNS(SVG_NS, "g") as SVGGElement;
    runtimeDefs.setAttribute("id", "lascaRuntimeDefs");
    defs.appendChild(runtimeDefs);
  }

  return { defs, themeDefs, runtimeDefs } as const;
}

function ensureThemeCssLink(): HTMLLinkElement {
  let link = document.getElementById(LINK_ID);
  if (link && link.tagName.toLowerCase() !== "link") {
    link.remove();
    link = null;
  }
  if (!link) {
    const l = document.createElement("link");
    l.id = LINK_ID;
    l.rel = "stylesheet";
    document.head.appendChild(l);
    link = l;
  }
  return link as HTMLLinkElement;
}

function readSavedThemeId(): string | null {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  return raw;
}

function saveThemeId(id: string) {
  localStorage.setItem(LS_KEY, id);
}

export function createThemeManager(svgRoot: SVGSVGElement) {
  if (!svgRoot) throw new Error("createThemeManager: svgRoot is required");

  const { themeDefs } = ensureDefsStructure(svgRoot);

  let currentId: string | null = null;
  let currentCssHref: string | null = null;

  async function applyThemeCss(cssUrl: string | URL | null | undefined) {
    if (!cssUrl) return;
    const href = String(cssUrl);
    if (href === currentCssHref) return;
    const link = ensureThemeCssLink();
    await new Promise<void>((resolve) => {
      const onDone = () => {
        link.removeEventListener("load", onDone);
        link.removeEventListener("error", onDone);
        resolve();
      };
      link.addEventListener("load", onDone);
      link.addEventListener("error", onDone);
      link.href = href;
    });
    currentCssHref = href;
  }

  async function setTheme(id: string) {
    const theme = getThemeById(id) ?? getThemeById(DEFAULT_THEME_ID);
    if (!theme) throw new Error("No themes available.");
    if (currentId === theme.id) return theme;

    const prevVis = svgRoot.style.visibility;
    svgRoot.style.visibility = "hidden";

    themeDefs.replaceChildren();
    await loadSvgDefsInto(themeDefs, [theme.piecesDefs, theme.boardDefs]);
    await applyThemeCss(theme.css);

    // Luminous theme relies on outer glow; ensure nothing in the board template
    // (notably node outline strokes) visually sits above the piece glyphs.
    if (theme.id === "luminous") {
      const pieces = svgRoot.querySelector("#pieces") as SVGGElement | null;
      const nodes = svgRoot.querySelector("#nodes") as SVGGElement | null;
      if (pieces && nodes && nodes.parentElement) {
        nodes.parentElement.insertBefore(pieces, nodes.nextSibling);
      }
    }

    svgRoot.setAttribute("data-theme-id", theme.id);

    // Notify listeners (e.g. controller) so they can re-render any <use href="#..."></use>
    // that may be theme-dependent (Wooden variants).
    svgRoot.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { themeId: theme.id } }));

    currentId = theme.id;
    saveThemeId(currentId);
    svgRoot.style.visibility = prevVis || "visible";
    return theme;
  }

  async function bindThemeDropdown(dropdownRootEl: HTMLElement | null | undefined) {
    if (!dropdownRootEl) return;
    const items = THEMES.map((t) => ({ id: t.id, label: t.label }));
    const saved = readSavedThemeId();
    const initial = saved && getThemeById(saved) ? saved : DEFAULT_THEME_ID;
    await setTheme(initial);
    const dropdown = createThemeDropdown({
      rootEl: dropdownRootEl,
      items,
      initialId: initial,
      onSelect: async (id) => { await setTheme(id); },
    });
    await dropdown.setSelected(initial);
  }

  async function bindThemeSelect(selectEl: HTMLSelectElement | null | undefined) {
    if (!selectEl) return;
    selectEl.textContent = "";
    for (const t of THEMES) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      selectEl.appendChild(opt);
    }
    const saved = readSavedThemeId();
    const initial = saved && getThemeById(saved) ? saved : DEFAULT_THEME_ID;
    selectEl.value = initial;
    await setTheme(initial);
    selectEl.addEventListener("change", async () => {
      await setTheme(selectEl.value);
    });
  }

  return {
    setTheme,
    bindThemeDropdown,
    bindThemeSelect,
    getCurrentThemeId: () => currentId,
  } as const;
}
