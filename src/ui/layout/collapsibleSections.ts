export function initCollapsibleSections(root: ParentNode = document): void {
  // Wire up collapsible panel sections (right/left sidebar panels).
  // Mobile Safari can be finicky about click dispatch; pointer events are more reliable.

  const headers = Array.from(root.querySelectorAll<HTMLElement>("[data-toggle]"));

  const lastPointerToggleAt = new WeakMap<HTMLElement, number>();

  const toggleSection = (header: HTMLElement): void => {
    const sectionId = header.getAttribute("data-toggle");
    if (!sectionId) return;

    const section = root.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
    if (!section) return;

    section.classList.toggle("collapsed");

    const isCollapsed = section.classList.contains("collapsed");
    try {
      localStorage.setItem(`section-${sectionId}-collapsed`, isCollapsed.toString());
    } catch {
      // ignore
    }
  };

  for (const header of headers) {
    header.addEventListener("click", () => {
      const last = lastPointerToggleAt.get(header) ?? 0;
      // If we just toggled via pointerdown, ignore the subsequent click.
      if (Date.now() - last < 700) return;
      toggleSection(header);
    });

    header.addEventListener("pointerdown", (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {
        // ignore
      }
      lastPointerToggleAt.set(header, Date.now());
      toggleSection(header);
    });
  }

  // Restore collapsed states from localStorage.
  const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-section]"));
  for (const section of sections) {
    const sectionId = section.getAttribute("data-section");
    if (!sectionId) continue;
    try {
      const savedState = localStorage.getItem(`section-${sectionId}-collapsed`);
      if (savedState === "true") section.classList.add("collapsed");
    } catch {
      // ignore
    }
  }
}
