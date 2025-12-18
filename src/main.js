window.addEventListener("DOMContentLoaded", () => {
          const svg = document.getElementById("laskaBoard");
          const piecesLayer = document.getElementById("pieces");

          const zoomTitle = document.getElementById("zoomTitle");
          const zoomHint = document.getElementById("zoomHint");
          const zoomSvg = document.getElementById("zoomSvg");

          // ===== Mini preview spine configuration (SET THIS IN ONE PLACE) =====
          // Maximum mini pieces shown in the small spine (when stack is taller, we show bottom half + top half with a crack).
          const MINI_SPINE_MAX_SHOWN = 6;
          const MINI_SPINE_KEEP_BOTTOM = Math.floor(MINI_SPINE_MAX_SHOWN / 2);
          const MINI_SPINE_KEEP_TOP =
            MINI_SPINE_MAX_SHOWN - MINI_SPINE_KEEP_BOTTOM;
          // Standard initial setup:
          // Top 3 rows (r0, r1, r2) = 11 nodes -> Black Soldiers
          // Bottom 3 rows (r4, r5, r6) = 11 nodes -> White Soldiers
          const blackIds = [
            "r0c0",
            "r0c2",
            "r0c4",
            "r0c6",
            "r1c1",
            "r1c3",
            "r1c5",
            "r2c0",
            "r2c2",
            "r2c4",
            "r2c6",
          ];
          const whiteIds = [
            "r4c0",
            "r4c2",
            "r4c4",
            "r4c6",
            "r5c1",
            "r5c3",
            "r5c5",
            "r6c0",
            "r6c2",
            "r6c4",
            "r6c6",
          ];

          function pieceToHref(p) {
            if (p.owner === "W" && p.rank === "S") return "#W_S";
            if (p.owner === "W" && p.rank === "O") return "#W_O"; // green officer
            if (p.owner === "B" && p.rank === "S") return "#B_S";
            return "#B_O"; // black officer = red
          }

          function hrefToBandColor(href) {
            if (href === "#W_S") return "#f8f8f8";
            if (href === "#B_S") return "#111111";
            if (href === "#W_O") return "#1fb34a";
            return "#e12a2a";
          }

          function makeUse(href, x, y, size) {
            const use = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "use"
            );
            use.setAttribute("href", href);
            use.setAttributeNS(
              "http://www.w3.org/1999/xlink",
              "xlink:href",
              href
            ); // fallback
            use.setAttribute("width", size);
            use.setAttribute("height", size);
            use.setAttribute("x", x);
            use.setAttribute("y", y);
            return use;
          }

          function drawMiniStackSpine(g, cx, cy, stack, opts = {}) {
            const {
              pieceSize = 86,
              maxShown = MINI_SPINE_MAX_SHOWN, // show at most N mini pieces
              keepTop = MINI_SPINE_KEEP_TOP, // when >maxShown, show top half
              keepBottom = MINI_SPINE_KEEP_BOTTOM, // when >maxShown, show bottom half
              miniSize = 18, // size of each mini piece
              miniGap = 3, // gap between minis
              spineGap = 10, // gap from main piece edge to spine
              spinePad = 6, // padding inside pill
              crackGap = 12, // extra gap where the "crack" is drawn
            } = opts;

            const n = stack.length;
            if (n <= 1) return;

            // Decide which pieces to show in the mini-spine.
            // Always preserve bottom->top order in the rendered spine.
            let shown = [];
            let hasCrack = false;

            if (n <= maxShown) {
              shown = stack.slice(); // bottom..top
            } else {
              hasCrack = true;
              const bottom = stack.slice(0, keepBottom); // bottom 4
              const top = stack.slice(n - keepTop); // top 4
              shown = bottom.concat(top); // bottom..top (with omitted middle)
            }

            const countShown = shown.length; // equals n when n<=maxShown, else equals maxShown

            const stackH =
              countShown * miniSize +
              (countShown - 1) * miniGap +
              (hasCrack ? crackGap : 0);
            const spineW = miniSize + spinePad * 2;
            const spineH = stackH + spinePad * 2;

            // Place spine centered vertically next to main piece
            const x = cx + pieceSize / 2 + spineGap;
            const y = cy - spineH / 2;

            // Background pill
            const bg = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect"
            );
            bg.setAttribute("x", x.toString());
            bg.setAttribute("y", y.toString());
            bg.setAttribute("width", spineW.toString());
            bg.setAttribute("height", spineH.toString());
            bg.setAttribute("rx", "10");
            bg.setAttribute("fill", "rgba(0,0,0,0.28)");
            bg.setAttribute("stroke", "rgba(255,255,255,0.35)");
            bg.setAttribute("stroke-width", "1.4");
            // prevent background from eating hover
            bg.setAttribute("pointer-events", "none");
            g.appendChild(bg);

            // Clip minis to the pill
            const clipId = `clip_${Math.random().toString(16).slice(2)}`;
            const clipPath = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "clipPath"
            );
            clipPath.setAttribute("id", clipId);
            const clipRect = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect"
            );
            clipRect.setAttribute("x", (x + 1).toString());
            clipRect.setAttribute("y", (y + 1).toString());
            clipRect.setAttribute("width", (spineW - 2).toString());
            clipRect.setAttribute("height", (spineH - 2).toString());
            clipRect.setAttribute("rx", "9");
            clipPath.appendChild(clipRect);
            svg.querySelector("defs").appendChild(clipPath);

            const minis = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g"
            );
            minis.setAttribute("clip-path", `url(#${clipId})`);
            minis.setAttribute("pointer-events", "none");

            // Draw minis: bottom at bottom, top at top.
            // We'll compute baseline from bottom of the interior.
            const innerTop = y + spinePad;
            const innerLeft = x + spinePad;
            const innerBottom = y + spineH - spinePad;

            // We insert crack gap between the 4th and 5th mini when hasCrack.
            // shown is [bottom4..., top4...]
            // crack position is between index 3 and 4 (0-based).
            const crackAfterIndex = keepBottom - 1; // between bottom-half and top-half minis

            for (let i = 0; i < countShown; i++) {
              const p = shown[i];
              const href = pieceToHref(p);

              // vertical position: i=0 bottommost
              let yOffset = i * (miniSize + miniGap);

              if (hasCrack && i > crackAfterIndex) {
                yOffset += crackGap;
              }

              const miniY = innerBottom - miniSize - yOffset;
              const miniX = innerLeft;

              const use = makeUse(
                href,
                miniX.toString(),
                miniY.toString(),
                miniSize.toString()
              );
              use.setAttribute("opacity", "0.98");
              minis.appendChild(use);
            }

            g.appendChild(minis);

            // Draw the "crack" between 4th and 5th pieces (only when n > maxShown).
            if (hasCrack) {
              // y position halfway in the crack gap area
              const crackTopY =
                innerBottom -
                miniSize -
                crackAfterIndex * (miniSize + miniGap) -
                miniGap;
              const crackMidY = crackTopY - crackGap / 2;

              const crack = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path"
              );
              const left = x + 3;
              const right = x + spineW - 3;

              // zigzag lightning line
              const midX = (left + right) / 2;
              const d = [
                `M ${left} ${crackMidY - 5}`,
                `L ${midX - 6} ${crackMidY + 2}`,
                `L ${midX} ${crackMidY - 3}`,
                `L ${midX + 6} ${crackMidY + 4}`,
                `L ${right} ${crackMidY - 1}`,
              ].join(" ");

              crack.setAttribute("d", d);
              crack.setAttribute("fill", "none");
              crack.setAttribute("stroke", "rgba(255,255,255,0.75)");
              crack.setAttribute("stroke-width", "2.2");
              crack.setAttribute("stroke-linecap", "round");
              crack.setAttribute("stroke-linejoin", "round");
              crack.setAttribute("pointer-events", "none");

              // faint shadow behind crack to read on bright minis
              const crackShadow = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path"
              );
              crackShadow.setAttribute("d", d);
              crackShadow.setAttribute("fill", "none");
              crackShadow.setAttribute("stroke", "rgba(0,0,0,0.45)");
              crackShadow.setAttribute("stroke-width", "4.0");
              crackShadow.setAttribute("stroke-linecap", "round");
              crackShadow.setAttribute("stroke-linejoin", "round");
              crackShadow.setAttribute("pointer-events", "none");

              g.appendChild(crackShadow);
              g.appendChild(crack);
            }

            // Count bubble (always shows real height)
            const bubbleCx = x + spineW / 2;
            const bubbleCy = y - 12;

            const bubble = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle"
            );
            bubble.setAttribute("cx", bubbleCx.toString());
            bubble.setAttribute("cy", bubbleCy.toString());
            bubble.setAttribute("r", "10");
            bubble.setAttribute("fill", "rgba(0,0,0,0.78)");
            bubble.setAttribute("stroke", "rgba(255,255,255,0.65)");
            bubble.setAttribute("stroke-width", "1.4");
            bubble.setAttribute("pointer-events", "none");

            const t = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );
            t.setAttribute("x", bubbleCx.toString());
            t.setAttribute("y", (bubbleCy + 0.5).toString());
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("dominant-baseline", "middle");
            t.setAttribute("fill", "#fff");
            t.setAttribute("font-size", "12");
            t.setAttribute(
              "font-family",
              "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            );
            t.textContent = String(n);
            t.setAttribute("pointer-events", "none");

            g.appendChild(bubble);
            g.appendChild(t);
          }

          // Right-side zoom: show the FULL spine (1 band per piece).
          function showZoom(nodeId, stack) {
            const n = stack.length;

            zoomTitle.textContent = `Stack @ ${nodeId} (×${n})`;
            if (n > MINI_SPINE_MAX_SHOWN) {
              zoomHint.textContent = `Full column order (bottom → top). Brackets mark pieces omitted in the mini preview spine.`;
            } else {
              zoomHint.textContent = `Full column order (bottom → top).`;
            }

            // Clear zoom svg
            while (zoomSvg.firstChild) zoomSvg.removeChild(zoomSvg.firstChild);

            // Layout
            const miniSize = 22;
            const gap = 4;
            const padTop = 26;
            const padBottom = 24;
            const W = 120;

            const columnH = n * miniSize + (n - 1) * gap;
            const H = padTop + columnH + padBottom;

            zoomSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
            zoomSvg.setAttribute("height", H); // allow scroll in the panel when needed

            const columnX = W / 2 - miniSize / 2;
            const columnY = padTop;

            // Background column (subtle)
            const bg = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect"
            );
            bg.setAttribute("x", (columnX - 8).toString());
            bg.setAttribute("y", (columnY - 10).toString());
            bg.setAttribute("width", (miniSize + 16).toString());
            bg.setAttribute("height", (columnH + 20).toString());
            bg.setAttribute("rx", "12");
            bg.setAttribute("fill", "rgba(0,0,0,0.28)");
            bg.setAttribute("stroke", "rgba(255,255,255,0.18)");
            bg.setAttribute("stroke-width", "1.4");
            zoomSvg.appendChild(bg);

            // Labels
            const topLbl = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );
            topLbl.setAttribute("x", (W / 2).toString());
            topLbl.setAttribute("y", (columnY - 12).toString());
            topLbl.setAttribute("text-anchor", "middle");
            topLbl.setAttribute("fill", "rgba(255,255,255,0.85)");
            topLbl.setAttribute("font-size", "12");
            topLbl.setAttribute(
              "font-family",
              "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            );
            topLbl.textContent = "TOP";
            zoomSvg.appendChild(topLbl);

            const botLbl = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );
            botLbl.setAttribute("x", (W / 2).toString());
            botLbl.setAttribute("y", (columnY + columnH + 18).toString());
            botLbl.setAttribute("text-anchor", "middle");
            botLbl.setAttribute("fill", "rgba(255,255,255,0.85)");
            botLbl.setAttribute("font-size", "12");
            botLbl.setAttribute(
              "font-family",
              "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            );
            botLbl.textContent = "BOTTOM";
            zoomSvg.appendChild(botLbl);

            // Pieces: draw bottom at bottom
            for (let i = 0; i < n; i++) {
              const p = stack[i]; // bottom..top
              const href = pieceToHref(p);

              const y = columnY + (n - 1 - i) * (miniSize + gap);
              const use = makeUse(
                href,
                columnX.toString(),
                y.toString(),
                miniSize.toString()
              );
              use.setAttribute("opacity", "0.98");
              zoomSvg.appendChild(use);
            }

            // Brackets around the *missing* middle group (when mini preview shows a crack)
            // Mini preview rule: if n > MINI_SPINE_MAX_SHOWN, it shows bottom half and top half.
            if (n > MINI_SPINE_MAX_SHOWN) {
              const keepBottom = MINI_SPINE_KEEP_BOTTOM;
              const keepTop = MINI_SPINE_KEEP_TOP;

              const missingStart = keepBottom; // index of first missing piece
              const missingEnd = n - keepTop - 1; // index of last missing piece

              if (missingEnd >= missingStart) {
                // Compute bracket bounds in zoom coordinates.
                const yTop = columnY + (n - 1 - missingEnd) * (miniSize + gap);
                const yBottom =
                  columnY +
                  (n - 1 - missingStart) * (miniSize + gap) +
                  miniSize;

                const leftX = columnX - 18;
                const rightX = columnX + miniSize + 18;
                const tick = 10;

                // Left bracket: [
                const left = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                left.setAttribute(
                  "d",
                  `M ${leftX + tick} ${yTop} ` +
                    `L ${leftX} ${yTop} ` +
                    `L ${leftX} ${yBottom} ` +
                    `L ${leftX + tick} ${yBottom}`
                );
                left.setAttribute("fill", "none");
                left.setAttribute("stroke", "rgba(255,255,255,0.90)");
                left.setAttribute("stroke-width", "2.2");
                left.setAttribute("stroke-linecap", "round");
                left.setAttribute("stroke-linejoin", "round");
                zoomSvg.appendChild(left);

                // Right bracket: ]
                const right = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "path"
                );
                right.setAttribute(
                  "d",
                  `M ${rightX - tick} ${yTop} ` +
                    `L ${rightX} ${yTop} ` +
                    `L ${rightX} ${yBottom} ` +
                    `L ${rightX - tick} ${yBottom}`
                );
                right.setAttribute("fill", "none");
                right.setAttribute("stroke", "rgba(255,255,255,0.90)");
                right.setAttribute("stroke-width", "2.2");
                right.setAttribute("stroke-linecap", "round");
                right.setAttribute("stroke-linejoin", "round");
                zoomSvg.appendChild(right);
              }
            }
          }

          let hideTimer = null;
          function hideZoomSoon() {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              zoomTitle.textContent = "Lasca Stack Inspector";
              zoomHint.textContent =
                "Hover a stacked piece to see the full column order (bottom → top). If a crack appears on the mini spine, brackets mark the omitted middle here.";
              while (zoomSvg.firstChild)
                zoomSvg.removeChild(zoomSvg.firstChild);
              zoomSvg.setAttribute("viewBox", "0 0 120 200");
              zoomSvg.removeAttribute("height");
            }, 80);
          }

          function cancelHide() {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = null;
          }

          function renderStackAtNode(nodeId, stack, opts = {}) {
            const { pieceSize = 86 } = opts;

            const node = document.getElementById(nodeId);
            if (!node || !stack.length) return;

            const cx = parseFloat(node.getAttribute("cx"));
            const cy = parseFloat(node.getAttribute("cy"));

            const g = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g"
            );
            g.setAttribute("data-node", nodeId);
            g.setAttribute("class", "stack");

            const top = stack[stack.length - 1];
            const half = pieceSize / 2;

            // Top piece only (clean)
            const topUse = makeUse(
              pieceToHref(top),
              (cx - half).toString(),
              (cy - half).toString(),
              pieceSize.toString()
            );
            g.appendChild(topUse);

            // Mini-spine summary when stack > 1
            drawMiniStackSpine(g, cx, cy, stack, { pieceSize, miniSize: 18 });

            // Hover: show full stack spine in right panel
            if (stack.length > 1) {
              g.style.cursor = "pointer";
              g.addEventListener("pointerenter", () => {
                cancelHide();
                showZoom(nodeId, stack);
              });
              g.addEventListener("pointerleave", () => {
                hideZoomSoon();
              });
            }

            piecesLayer.appendChild(g);
          }

          // ---- Build initial position ----
          piecesLayer.textContent = "";

          for (const id of blackIds)
            renderStackAtNode(id, [{ owner: "B", rank: "S" }]);
          for (const id of whiteIds)
            renderStackAtNode(id, [{ owner: "W", rank: "S" }]);

          // Demo stack in the center:
          renderStackAtNode("r3c3", [
            { owner: "B", rank: "O" },
            { owner: "W", rank: "O" },
            { owner: "B", rank: "O" },
            { owner: "W", rank: "S" },
            { owner: "B", rank: "O" },
            { owner: "W", rank: "O" },
            { owner: "B", rank: "O" },
            { owner: "W", rank: "S" },
            { owner: "B", rank: "S" },
            { owner: "W", rank: "S" },
          ]);
        });
