// src/theme/themeManager.js

import { loadSvgDefsInto } from "../render/loadSvgDefs.js";
import { DEFAULT_THEME_ID, THEMES, getThemeById } from "./themes.js";
import { createThemeDropdown } from "../ui/components/themeDropdown.js";

const LS_KEY = "lasca.theme";
const LINK_ID = "lascaThemeCss";

/**
 * Ensures that the board SVG has:
 * <defs id="lascaDefs">
 *   <g id="lascaThemeDefs"></g>
 *   <g id="lascaRuntimeDefs"></g>
 * </defs>
 */
function ensureDefsStructure(svgRoot){
  const SVG_NS = "http://www.w3.org/2000/svg";

  let defs = svgRoot.querySelector("defs");
  if (!defs){
    defs = document.createElementNS(SVG_NS, "defs");
    defs.setAttribute("id", "lascaDefs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  let themeDefs = svgRoot.querySelector("#lascaThemeDefs");
  if (!themeDefs){
    themeDefs = document.createElementNS(SVG_NS, "g");
    themeDefs.setAttribute("id", "lascaThemeDefs");
    defs.appendChild(themeDefs);
  }

  let runtimeDefs = svgRoot.querySelector("#lascaRuntimeDefs");
  if (!runtimeDefs){
    runtimeDefs = document.createElementNS(SVG_NS, "g");
    runtimeDefs.setAttribute("id", "lascaRuntimeDefs");
    defs.appendChild(runtimeDefs);
  }

  return { defs, themeDefs, runtimeDefs };
}

function ensureThemeCssLink(){
  let link = document.getElementById(LINK_ID);
  if (link && link.tagName.toLowerCase() !== "link"){
    link.remove();
    link = null;
  }
  if (!link){
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  return link;
}

function readSavedThemeId(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  return raw;
}

function saveThemeId(id){
  localStorage.setItem(LS_KEY, id);
}

export function createThemeManager(svgRoot){
  if (!svgRoot) throw new Error("createThemeManager: svgRoot is required");

  const { themeDefs } = ensureDefsStructure(svgRoot);

  let currentId = null;
  let currentCssHref = null;

  async function applyThemeCss(cssUrl){
    if (!cssUrl) return;

    const href = String(cssUrl);
    if (href === currentCssHref) return;

    const link = ensureThemeCssLink();

    // Don't hard-fail on CSS load issues; the game should still run.
    await new Promise((resolve) => {
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

  async function setTheme(id){
    const theme = getThemeById(id) ?? getThemeById(DEFAULT_THEME_ID);
    if (!theme) throw new Error("No themes available.");
    if (currentId === theme.id) return theme;

    // Hide board during swap to avoid mask/gradient flicker.
    const prevVis = svgRoot.style.visibility;
    svgRoot.style.visibility = "hidden";

    // Replace ONLY theme defs (runtime defs remain)
    themeDefs.replaceChildren();

    await loadSvgDefsInto(themeDefs, [theme.piecesDefs, theme.boardDefs]);
    await applyThemeCss(theme.css);

    currentId = theme.id;
    saveThemeId(currentId);

    svgRoot.style.visibility = prevVis || "visible";
    return theme;
  }

  function populateThemeSelect(selectEl){
    if (!selectEl) return;

    selectEl.textContent = "";
    for (const t of THEMES){
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      selectEl.appendChild(opt);
    }
  }


  async function bindThemeDropdown(dropdownRootEl){
    if (!dropdownRootEl) return;

    const items = THEMES.map(t => ({ id: t.id, label: t.label }));
    const saved = readSavedThemeId();
    const initial = (saved && getThemeById(saved)) ? saved : DEFAULT_THEME_ID;

    // Apply initial theme first (ensures defs exist before any renders that depend on them)
    await setTheme(initial);

    const dropdown = createThemeDropdown({
      rootEl: dropdownRootEl,
      items,
      initialId: initial,
      onSelect: async (id) => {
        await setTheme(id);
      },
    });

    // Make sure the button label is synced with the theme we applied.
    await dropdown.setSelected(initial);
  }

  // Back-compat: if someone still uses a native <select>, keep this around.
  async function bindThemeSelect(selectEl){
    if (!selectEl) return;

    selectEl.textContent = "";
    for (const t of THEMES){
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      selectEl.appendChild(opt);
    }

    const saved = readSavedThemeId();
    const initial = (saved && getThemeById(saved)) ? saved : DEFAULT_THEME_ID;
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
  };
}
