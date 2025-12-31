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
  extraEls: SVGElement[] = []
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
      // Remove clones if still present
      for (const c of clones) {
        try {
          c.remove();
        } catch {
          // ignore
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

    // Animate using Web Animations API
    // Start at 0,0 (current position) and move by dx,dy
    const anyClone = cloneMain as any;
    if (typeof anyClone.animate !== "function") {
      cleanupAndResolve();
      return;
    }

    const animation: Animation = anyClone.animate(
      [
        { transform: `translate(0px, 0px)` },
        { transform: `translate(${dx}px, ${dy}px)` },
      ],
      {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "forwards",
      }
    );

    // Keep extra clones in lockstep
    for (let i = 1; i < clones.length; i++) {
      try {
        (clones[i] as any).animate(
          [
            { transform: `translate(0px, 0px)` },
            { transform: `translate(${dx}px, ${dy}px)` },
          ],
          {
            duration: durationMs,
            easing: "ease-in-out",
            fill: "forwards",
          }
        );
      } catch {
        // ignore
      }
    }

    // Some browsers won't fire onfinish if the animation is cancelled (e.g., element removed).
    animation.onfinish = cleanupAndResolve;
    (animation as any).oncancel = cleanupAndResolve;

    // Absolute safety: resolve even if finish/cancel never fires.
    window.setTimeout(cleanupAndResolve, Math.max(0, durationMs) + 50);
  });
}
