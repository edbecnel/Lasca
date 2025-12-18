// src/ui/components/themeDropdown.js

/**
 * Minimal custom dropdown (button + menu) so we can fully style the popup list.
 *
 * Styling is controlled by CSS variables in lasca.html:
 *   --themeMenuBg, --themeMenuBorder, --themeMenuText,
 *   --themeMenuHoverBg, --themeMenuSelectedBg
 */

export function createThemeDropdown(opts){
  const {
    rootEl,
    items,
    initialId,
    onSelect,
  } = opts ?? {};

  if (!rootEl) throw new Error("createThemeDropdown: rootEl is required");
  if (!Array.isArray(items) || items.length === 0) throw new Error("createThemeDropdown: items is required");

  const btn = rootEl.querySelector("#themeDropdownBtn");
  const menu = rootEl.querySelector("#themeDropdownMenu");

  if (!btn || !menu) throw new Error("createThemeDropdown: missing #themeDropdownBtn / #themeDropdownMenu");

  let open = false;
  let selectedId = initialId ?? items[0].id;

  function setExpanded(v){
    open = v;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open){
      menu.hidden = false;
      // focus menu for Escape handling
      menu.focus({ preventScroll: true });
    } else {
      menu.hidden = true;
    }
  }

  function renderButton(){
    const item = items.find(i => i.id === selectedId) ?? items[0];
    btn.textContent = item ? `${item.label} ▾` : "Theme ▾";
  }

  function renderMenu(){
    menu.textContent = "";
    for (const item of items){
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "themeOption";
      opt.setAttribute("role", "option");
      opt.setAttribute("data-id", item.id);
      opt.setAttribute("aria-selected", item.id === selectedId ? "true" : "false");
      opt.textContent = item.label;

      opt.addEventListener("click", async () => {
        await select(item.id);
        setExpanded(false);
        btn.focus({ preventScroll: true });
      });

      menu.appendChild(opt);
    }
  }

  async function select(id){
    selectedId = id;
    renderButton();
    renderMenu();
    if (typeof onSelect === "function"){
      await onSelect(id);
    }
  }

  function onDocPointerDown(e){
    if (!open) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (!rootEl.contains(t)){
      setExpanded(false);
    }
  }

  function onBtnClick(){
    setExpanded(!open);
  }

  function onKeyDown(e){
    if (!open) return;

    if (e.key === "Escape"){
      e.preventDefault();
      setExpanded(false);
      btn.focus({ preventScroll: true });
    }
  }

  // Wire up
  btn.addEventListener("click", onBtnClick);
  document.addEventListener("pointerdown", onDocPointerDown);
  menu.addEventListener("keydown", onKeyDown);

  // initial render
  btn.setAttribute("aria-haspopup", "listbox");
  menu.setAttribute("role", "listbox");
  menu.tabIndex = -1;

  renderButton();
  renderMenu();
  setExpanded(false);

  return {
    setSelected: async (id) => select(id),
    getSelected: () => selectedId,
    open: () => setExpanded(true),
    close: () => setExpanded(false),
    destroy: () => {
      btn.removeEventListener("click", onBtnClick);
      document.removeEventListener("pointerdown", onDocPointerDown);
      menu.removeEventListener("keydown", onKeyDown);
    },
  };
}
