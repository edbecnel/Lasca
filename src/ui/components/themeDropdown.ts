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

  function viewportSize(): { width: number; height: number; offsetTop: number; offsetLeft: number } {
    // Prefer VisualViewport on mobile (accounts for browser UI / onscreen keyboard).
    const vv = window.visualViewport;
    if (vv) {
      return {
        width: vv.width,
        height: vv.height,
        offsetTop: vv.offsetTop,
        offsetLeft: vv.offsetLeft,
      };
    }
    return { width: window.innerWidth, height: window.innerHeight, offsetTop: 0, offsetLeft: 0 };
  }

  function positionMenuFixed() {
    if (menu.hidden) return;

    const rect = btn.getBoundingClientRect();
    const { width: vpW, height: vpH, offsetTop, offsetLeft } = viewportSize();
    const gap = 6;
    const minMenuHeight = 140;

    const spaceBelow = vpH - (rect.bottom - offsetTop) - gap;
    const spaceAbove = (rect.top - offsetTop) - gap;
    const openUp = spaceBelow < minMenuHeight && spaceAbove > spaceBelow;

    // Use fixed positioning so the menu isn't clipped by sidebar/section overflow.
    // Clamp horizontally to viewport.
    const desiredLeft = rect.left + offsetLeft;
    const maxLeft = Math.max(0, vpW - rect.width);
    const left = Math.max(0, Math.min(desiredLeft, maxLeft));

    menu.style.position = "fixed";
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
    menu.style.width = `${rect.width}px`;
    menu.style.zIndex = "10000";
    menu.style.overflowY = "auto";
    (menu.style as any).webkitOverflowScrolling = "touch";

    if (openUp) {
      const bottom = vpH - (rect.top - offsetTop) + offsetTop + gap;
      menu.style.top = "auto";
      menu.style.bottom = `${bottom}px`;
      menu.style.maxHeight = `${Math.max(120, spaceAbove)}px`;
    } else {
      const top = rect.bottom + offsetTop + gap;
      menu.style.bottom = "auto";
      menu.style.top = `${top}px`;
      menu.style.maxHeight = `${Math.max(120, spaceBelow)}px`;
    }
  }

  function clearMenuPositioning() {
    menu.style.position = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.top = "";
    menu.style.bottom = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    (menu.style as any).webkitOverflowScrolling = "";
    menu.style.zIndex = "";
  }

  function attachRepositionHandlers() {
    const onMove = () => positionMenuFixed();
    // Capture scroll events from any ancestor scroller.
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
    };
  }

  let detachReposition: (() => void) | null = null;

  function setExpanded(v: boolean) {
    open = v;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      menu.hidden = false;
      // Position after it becomes visible (so height/scrollbars compute correctly).
      requestAnimationFrame(() => positionMenuFixed());
      detachReposition?.();
      detachReposition = attachRepositionHandlers();
      menu.focus({ preventScroll: true });
    } else {
      menu.hidden = true;
      detachReposition?.();
      detachReposition = null;
      clearMenuPositioning();
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
      detachReposition?.();
    },
  };
}
