export interface ThemeItem { id: string; label: string }

interface DropdownOptions {
  rootEl: HTMLElement;
  items: ThemeItem[];
  initialId?: string;
  onSelect?: (id: string) => void | Promise<void>;
}

export function createThemeDropdown(opts: DropdownOptions) {
  const { rootEl, items, initialId, onSelect } = opts;
  if (!rootEl) throw new Error("createThemeDropdown: rootEl is required");
  if (!Array.isArray(items) || items.length === 0)
    throw new Error("createThemeDropdown: items is required");

  const btnEl = rootEl.querySelector<HTMLButtonElement>("#themeDropdownBtn");
  const menuEl = rootEl.querySelector<HTMLDivElement>("#themeDropdownMenu");
  if (!btnEl || !menuEl) throw new Error("createThemeDropdown: missing #themeDropdownBtn / #themeDropdownMenu");
  const btn = btnEl;
  const menu = menuEl;

  let open = false;
  let selectedId = initialId ?? items[0].id;

  function setExpanded(v: boolean) {
    open = v;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      menu.hidden = false;
      menu.focus({ preventScroll: true });
    } else {
      menu.hidden = true;
    }
  }

  function renderButton() {
    const item = items.find((i) => i.id === selectedId) ?? items[0];
    btn.textContent = item ? `${item.label} ▾` : "Theme ▾";
  }

  function renderMenu() {
    menu.textContent = "";
    for (const item of items) {
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

  async function select(id: string) {
    selectedId = id;
    renderButton();
    renderMenu();
    if (typeof onSelect === "function") {
      await onSelect(id);
    }
  }

  function onDocPointerDown(e: Event) {
    if (!open) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (!rootEl.contains(t)) {
      setExpanded(false);
    }
  }

  function onBtnClick() {
    setExpanded(!open);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setExpanded(false);
      btn.focus({ preventScroll: true });
    }
  }

  btn.addEventListener("click", onBtnClick);
  document.addEventListener("pointerdown", onDocPointerDown);
  menu.addEventListener("keydown", onKeyDown);

  btn.setAttribute("aria-haspopup", "listbox");
  menu.setAttribute("role", "listbox");
  menu.tabIndex = -1;

  renderButton();
  renderMenu();
  setExpanded(false);

  return {
    setSelected: async (id: string) => select(id),
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
