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
  durationMs: number = 300
): Promise<void> {
  return new Promise((resolve) => {
    const fromPos = getNodeCenter(svg, fromNodeId);
    const toPos = getNodeCenter(svg, toNodeId);
    
    if (!fromPos || !toPos) {
      // Can't animate without positions, resolve immediately
      resolve();
      return;
    }
    
    // Clone the moving group
    const clone = movingGroupEl.cloneNode(true) as SVGGElement;
    clone.setAttribute("data-animating", "true");
    
    // Don't set transform on clone - it already has correctly positioned children
    // The children have absolute x,y coordinates, so we'll animate using transform
    
    // Hide the original during animation
    const originalVisibility = movingGroupEl.style.visibility;
    movingGroupEl.style.visibility = "hidden";
    
    // Append clone to overlay layer
    overlayLayer.appendChild(clone);
    
    // Calculate translation distance
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    
    // Animate using Web Animations API
    // Start at 0,0 (current position) and move by dx,dy
    const animation = clone.animate(
      [
        { transform: `translate(0px, 0px)` },
        { transform: `translate(${dx}px, ${dy}px)` }
      ],
      {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "forwards"
      }
    );
    
    animation.onfinish = () => {
      // Remove clone
      clone.remove();
      
      // Restore original visibility
      movingGroupEl.style.visibility = originalVisibility;
      
      resolve();
    };
  });
}
