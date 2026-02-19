/**
 * Get the center coordinates of a node circle on the board.
 */
export function getNodeCenter(svg: SVGSVGElement, nodeId: string): { x: number; y: number } | null {
  const circle = svg.querySelector(`#${nodeId}`) as SVGCircleElement | null;
  if (!circle) return null;
  
  const cx = parseFloat(circle.getAttribute("cx") || "0");
  const cy = parseFloat(circle.getAttribute("cy") || "0");
  
  return { x: cx, y: cy };
}

/**
 * Animate a stack moving from one node to another using a ghost clone in the overlay layer.
 * Returns a promise that resolves when the animation completes.
 * 
 * @param svg - The main SVG element
 * @param overlayLayer - The overlay layer where the clone will be animated
 * @param fromNodeId - Starting node ID
 * @param toNodeId - Destination node ID
 * @param movingGroupEl - The rendered g.stack element to animate
 * @param durationMs - Animation duration in milliseconds
 */
export function animateStack(
  svg: SVGSVGElement,
  overlayLayer: SVGGElement,
  fromNodeId: string,
  toNodeId: string,
  movingGroupEl: SVGGElement,
  durationMs: number = 300,
  extraEls: SVGElement[] = [],
  opts: { easing?: string; keepCloneAfter?: boolean } = {}
): Promise<void> {
  return new Promise((resolve) => {
    const fromPos = getNodeCenter(svg, fromNodeId);
    const toPos = getNodeCenter(svg, toNodeId);
    
    if (!fromPos || !toPos) {
      // Can't animate without positions, resolve immediately
      resolve();
      return;
    }
    
    // Clone the moving group (+ any extra elements that should move with it)
    const clones: SVGElement[] = [];

    const cloneMain = movingGroupEl.cloneNode(true) as SVGGElement;
    cloneMain.setAttribute("data-animating", "true");
    clones.push(cloneMain);

    for (const el of extraEls) {
      try {
        const c = el.cloneNode(true) as SVGElement;
        c.setAttribute("data-animating", "true");
        clones.push(c);
      } catch {
        // ignore
      }
    }
    
    // Don't set transform on clone - it already has correctly positioned children
    // The children have absolute x,y coordinates, so we'll animate using transform
    
    // Hide originals during animation
    const originals: SVGElement[] = [movingGroupEl, ...extraEls];
    const originalVisibility = originals.map((el) => el.style.visibility);
    for (const el of originals) {
      try {
        el.style.visibility = "hidden";
      } catch {
        // ignore
      }
    }
    
    // Append clones to overlay layer
    for (const c of clones) {
      overlayLayer.appendChild(c);
    }
    
    // Calculate translation distance
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    
    const cleanupAndResolve = () => {
      // Remove clones if still present (unless caller wants the clone to remain
      // visible at the destination until a subsequent authoritative render).
      if (!opts.keepCloneAfter) {
        for (const c of clones) {
          try {
            c.remove();
          } catch {
            // ignore
          }
        }
      }

      // Restore original visibility (originals may have been removed by a re-render)
      for (let i = 0; i < originals.length; i++) {
        try {
          originals[i].style.visibility = originalVisibility[i] ?? "";
        } catch {
          // ignore
        }
      }

      resolve();
    };

    const easing = (opts.easing ?? "ease-in-out").toLowerCase();

    const easeT = (t: number): number => {
      // t in [0,1]
      if (easing === "linear") return t;
      // ease-in-out (quad)
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    const baseTransforms = clones.map((c) => c.getAttribute("transform") ?? "");
    const applyTransform = (tx: number, ty: number) => {
      for (let i = 0; i < clones.length; i++) {
        const base = baseTransforms[i];
        const translate = `translate(${tx} ${ty})`;
        const next = base ? `${base} ${translate}` : translate;
        try {
          clones[i].setAttribute("transform", next);
        } catch {
          // ignore
        }
      }
    };

    const ms = Math.max(0, Math.trunc(durationMs));
    if (ms === 0) {
      applyTransform(dx, dy);
      cleanupAndResolve();
      return;
    }

    let raf: number | null = null;
    const start = performance.now();

    const step = () => {
      const now = performance.now();
      const raw = (now - start) / ms;
      const t = Math.max(0, Math.min(1, raw));
      const e = easeT(t);
      applyTransform(dx * e, dy * e);

      if (t >= 1) {
        if (raf !== null) cancelAnimationFrame(raf);
        cleanupAndResolve();
        return;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);

    // Absolute safety: resolve even if rAF never fires (background tab, etc.).
    window.setTimeout(() => {
      if (raf !== null) {
        try {
          cancelAnimationFrame(raf);
        } catch {
          // ignore
        }
        raf = null;
      }
      cleanupAndResolve();
    }, ms + 150);
  });
}
