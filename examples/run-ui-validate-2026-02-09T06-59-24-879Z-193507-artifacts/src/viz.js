/* src/viz.js
   Canvas/SVG visualization for golden rectangle tiling and spiral.
   Public API:
     - computePhi()
     - computeGoldenTiles(bounds, opts)
     - computeGoldenSpiralArcs(tiles, opts)
     - renderGoldenTilingCanvas(canvas, opts)
     - renderGoldenTilingSVG(svgEl, opts)
*/

export function computePhi() {
  return (1 + Math.sqrt(5)) / 2;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getDpr() {
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}

/**
 * Compute a golden-rectangle square tiling by repeatedly removing the largest square.
 * Coordinates are in an abstract "model space".
 *
 * bounds: { x, y, w, h }  (typically x=0,y=0)
 * opts:
 *  - maxDepth (default 12)
 *  - minSize (default 6) : stop if next square side < minSize
 *  - preferLandscape (default true): if true and h>w, swap (rotate logic) by treating as portrait steps.
 *
 * Returns:
 *  {
 *    bounds,
 *    tiles: [{x,y,s,dir}], // dir is the placement direction for the next remainder step
 *    remainder: {x,y,w,h}  // last remainder rectangle
 *  }
 */
export function computeGoldenTiles(bounds, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : 12;
  const minSize = Number.isFinite(opts.minSize) ? opts.minSize : 6;

  let x = bounds.x || 0;
  let y = bounds.y || 0;
  let w = bounds.w;
  let h = bounds.h;

  if (!(w > 0) || !(h > 0)) {
    return { bounds: { x, y, w: Math.max(0, w), h: Math.max(0, h) }, tiles: [], remainder: { x, y, w, h } };
  }

  const tiles = [];
  let depth = 0;

  while (depth < maxDepth) {
    if (w <= 0 || h <= 0) break;

    // Stop when the next square would be too small
    const sNext = Math.min(w, h);
    if (sNext < minSize) break;

    if (w >= h) {
      // Landscape: square on the left, remainder to the right
      const s = h;
      tiles.push({ x, y, s, dir: "E" });
      x = x + s;
      w = w - s;
    } else {
      // Portrait: square on the top, remainder below
      const s = w;
      tiles.push({ x, y, s, dir: "S" });
      y = y + s;
      h = h - s;
    }

    depth++;
  }

  return {
    bounds: { x: bounds.x || 0, y: bounds.y || 0, w: bounds.w, h: bounds.h },
    tiles,
    remainder: { x, y, w, h }
  };
}

/**
 * For each square in a golden tiling, compute a quarter-circle arc that forms the classic spiral.
 * The arc is inside the square, with radius = square side.
 *
 * Returns arcs:
 *  [{ cx, cy, r, a0, a1, x0, y0, x1, y1 }]
 *
 * Notes:
 * - The arc orientation alternates in a consistent cycle based on the step direction.
 * - We infer the cycle from the sequence of "dir" emitted by computeGoldenTiles.
 */
export function computeGoldenSpiralArcs(tiles, opts = {}) {
  const inset = Number.isFinite(opts.inset) ? opts.inset : 0; // optional shrink for stroke visibility
  const arcs = [];

  // We use a simple 4-state cycle for arc corners.
  // State corresponds to which corner is the arc center:
  // 0: bottom-left, 1: bottom-right, 2: top-right, 3: top-left
  // This matches the common golden-rectangle spiral when starting with a landscape rectangle,
  // removing a left square first.
  let state = 0;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const r = Math.max(0, t.s - inset);
    const x = t.x + inset / 2;
    const y = t.y + inset / 2;
    const s = r;

    let cx, cy, a0, a1;

    // Angles in radians, Canvas uses clockwise-positive when y increases downward; SVG uses standard math.
    // We'll store a0/a1 in radians in screen coordinates (y down), and generate accordingly in each renderer.
    switch (state) {
      case 0: // bottom-left: from 270° to 360°
        cx = x;
        cy = y + s;
        a0 = 1.5 * Math.PI;
        a1 = 2.0 * Math.PI;
        break;
      case 1: // bottom-right: from 180° to 270°
        cx = x + s;
        cy = y + s;
        a0 = Math.PI;
        a1 = 1.5 * Math.PI;
        break;
      case 2: // top-right: from 90° to 180°
        cx = x + s;
        cy = y;
        a0 = 0.5 * Math.PI;
        a1 = Math.PI;
        break;
      case 3: // top-left: from 0° to 90°
        cx = x;
        cy = y;
        a0 = 0;
        a1 = 0.5 * Math.PI;
        break;
      default:
        cx = x;
        cy = y + s;
        a0 = 1.5 * Math.PI;
        a1 = 2.0 * Math.PI;
    }

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    arcs.push({ cx, cy, r, a0, a1, x0, y0, x1, y1 });

    state = (state + 1) % 4;
  }

  return arcs;
}

/**
 * Fit a model-space rectangle into a viewport.
 * Returns { scale, tx, ty } where screen = model*scale + (tx,ty).
 */
export function fitTransform(modelBounds, viewportW, viewportH, padding = 16) {
  const w = Math.max(1e-9, modelBounds.w);
  const h = Math.max(1e-9, modelBounds.h);

  const innerW = Math.max(1, viewportW - 2 * padding);
  const innerH = Math.max(1, viewportH - 2 * padding);

  const s = Math.min(innerW / w, innerH / h);

  const tx = padding + (innerW - w * s) / 2 - (modelBounds.x || 0) * s;
  const ty = padding + (innerH - h * s) / 2 - (modelBounds.y || 0) * s;

  return { scale: s, tx, ty };
}

function applyTransformPt(pt, tr) {
  return { x: pt.x * tr.scale + tr.tx, y: pt.y * tr.scale + tr.ty };
}

function clearSvg(svgEl) {
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
}

function svgElNS(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function defaultTheme(overrides = {}) {
  return {
    bg: "transparent",
    stroke: "rgba(233,238,247,0.22)",
    strokeStrong: "rgba(233,238,247,0.40)",
    squareFillA: "rgba(125,211,252,0.08)",
    squareFillB: "rgba(167,139,250,0.07)",
    spiral: "rgba(125,211,252,0.90)",
    label: "rgba(233,238,247,0.80)",
    ...overrides
  };
}

/**
 * Render golden rectangle tiling + spiral to a Canvas element.
 *
 * opts:
 *  - width,height: if omitted uses canvas client rect
 *  - ratio: rectangle ratio W/H (default phi). If <1 it will be treated as portrait.
 *  - depth: number of squares (default 10)
 *  - padding: px (default 16)
 *  - minSquarePx: min square side in screen px (default 10)
 *  - showSpiral (default true)
 *  - showLabels (default false)
 *  - theme: overrides (see defaultTheme)
 */
export function renderGoldenTilingCanvas(canvas, opts = {}) {
  if (!canvas) return;

  const theme = defaultTheme(opts.theme);
  const dpr = getDpr();

  const cssW = Number.isFinite(opts.width) ? opts.width : Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const cssH = Number.isFinite(opts.height) ? opts.height : Math.max(1, Math.round(canvas.getBoundingClientRect().height));

  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  // Background
  if (theme.bg && theme.bg !== "transparent") {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cssW, cssH);
  } else {
    ctx.clearRect(0, 0, cssW, cssH);
  }

  const phi = computePhi();
  const ratio = Number.isFinite(opts.ratio) ? opts.ratio : phi;
  const depth = Number.isFinite(opts.depth) ? Math.max(1, Math.floor(opts.depth)) : 10;
  const padding = Number.isFinite(opts.padding) ? opts.padding : 16;
  const showSpiral = opts.showSpiral !== false;
  const showLabels = !!opts.showLabels;

  // Define model rectangle
  // Use height=1 model units; width=ratio; then scale to viewport.
  const modelH = 1;
  const modelW = Math.abs(ratio);
  const portrait = ratio > 0 && ratio < 1;

  // If portrait, swap to keep bounds correct; spiral still works as subdivision will handle.
  const bounds = portrait
    ? { x: 0, y: 0, w: modelH, h: modelW }
    : { x: 0, y: 0, w: modelW, h: modelH };

  // Determine minSize in model units based on minSquarePx
  const minSquarePx = Number.isFinite(opts.minSquarePx) ? opts.minSquarePx : 10;

  const tr = fitTransform(bounds, cssW, cssH, padding);
  const minSizeModel = minSquarePx / Math.max(1e-9, tr.scale);

  const tiling = computeGoldenTiles(bounds, { maxDepth: depth, minSize: minSizeModel });
  const tiles = tiling.tiles;

  // Outer rectangle
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = theme.strokeStrong;

  const p0 = applyTransformPt({ x: bounds.x, y: bounds.y }, tr);
  ctx.strokeRect(p0.x, p0.y, bounds.w * tr.scale, bounds.h * tr.scale);
  ctx.restore();

  // Squares
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.stroke;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const fill = i % 2 === 0 ? theme.squareFillA : theme.squareFillB;
    const p = applyTransformPt({ x: t.x, y: t.y }, tr);
    const s = t.s * tr.scale;

    if (fill && fill !== "transparent") {
      ctx.fillStyle = fill;
      ctx.fillRect(p.x, p.y, s, s);
    }
    ctx.strokeRect(p.x, p.y, s, s);

    if (showLabels && s >= 26) {
      ctx.fillStyle = theme.label;
      ctx.font = `600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.fillText(String(i + 1), p.x + 6, p.y + 14);
    }
  }
  ctx.restore();

  // Spiral arcs
  if (showSpiral && tiles.length) {
    const arcs = computeGoldenSpiralArcs(tiles, { inset: 0 });

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.spiral;

    for (const a of arcs) {
      const c = applyTransformPt({ x: a.cx, y: a.cy }, tr);
      const r = a.r * tr.scale;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, a.a0, a.a1, false);
      ctx.stroke();
    }

    ctx.restore();
  }

  return { bounds, tiles, transform: tr };
}

/**
 * Render golden rectangle tiling + spiral to an SVG element.
 *
 * opts:
 *  - width,height: if omitted uses svg client rect
 *  - ratio (default phi)
 *  - depth (default 10)
 *  - padding (default 16)
 *  - showSpiral (default true)
 *  - showLabels (default false)
 *  - theme: overrides
 */
export function renderGoldenTilingSVG(svgEl, opts = {}) {
  if (!svgEl) return;

  const theme = defaultTheme(opts.theme);

  const cssW = Number.isFinite(opts.width) ? opts.width : Math.max(1, Math.round(svgEl.getBoundingClientRect().width));
  const cssH = Number.isFinite(opts.height) ? opts.height : Math.max(1, Math.round(svgEl.getBoundingClientRect().height));

  const phi = computePhi();
  const ratio = Number.isFinite(opts.ratio) ? opts.ratio : phi;
  const depth = Number.isFinite(opts.depth) ? Math.max(1, Math.floor(opts.depth)) : 10;
  const padding = Number.isFinite(opts.padding) ? opts.padding : 16;
  const showSpiral = opts.showSpiral !== false;
  const showLabels = !!opts.showLabels;

  const modelH = 1;
  const modelW = Math.abs(ratio);
  const portrait = ratio > 0 && ratio < 1;

  const bounds = portrait
    ? { x: 0, y: 0, w: modelH, h: modelW }
    : { x: 0, y: 0, w: modelW, h: modelH };

  // For SVG we use viewBox in screen units directly; compute transform into viewBox coords.
  // We'll set viewBox as 0..cssW, 0..cssH to match CSS px.
  const tr = fitTransform(bounds, cssW, cssH, padding);

  clearSvg(svgEl);
  setAttrs(svgEl, {
    width: cssW,
    height: cssH,
    viewBox: `0 0 ${cssW} ${cssH}`,
    role: "img",
    "aria-label": "Golden rectangle tiling and spiral visualization",
    preserveAspectRatio: "xMidYMid meet"
  });

  if (theme.bg && theme.bg !== "transparent") {
    const bg = svgElNS("rect");
    setAttrs(bg, { x: 0, y: 0, width: cssW, height: cssH, fill: theme.bg });
    svgEl.appendChild(bg);
  }

  const g = svgElNS("g");
  svgEl.appendChild(g);

  // Outer rect
  const outer = svgElNS("rect");
  const p0 = applyTransformPt({ x: bounds.x, y: bounds.y }, tr);
  setAttrs(outer, {
    x: p0.x,
    y: p0.y,
    width: bounds.w * tr.scale,
    height: bounds.h * tr.scale,
    fill: "transparent",
    stroke: theme.strokeStrong,
    "stroke-width": 1.25
  });
  g.appendChild(outer);

  // Tiles
  const tiling = computeGoldenTiles(bounds, {
    maxDepth: depth,
    minSize: (Number.isFinite(opts.minSquarePx) ? opts.minSquarePx : 10) / Math.max(1e-9, tr.scale)
  });

  for (let i = 0; i < tiling.tiles.length; i++) {
    const t = tiling.tiles[i];
    const p = applyTransformPt({ x: t.x, y: t.y }, tr);
    const s = t.s * tr.scale;

    const r = svgElNS("rect");
    setAttrs(r, {
      x: p.x,
      y: p.y,
      width: s,
      height: s,
      fill: i % 2 === 0 ? theme.squareFillA : theme.squareFillB,
      stroke: theme.stroke,
      "stroke-width": 1
    });
    g.appendChild(r);

    if (showLabels && s >= 26) {
      const tx = svgElNS("text");
      tx.textContent = String(i + 1);
      setAttrs(tx, {
        x: p.x + 6,
        y: p.y + 14,
        fill: theme.label,
        "font-size": 12,
        "font-weight": 600,
        "font-family":
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      });
      g.appendChild(tx);
    }
  }

  // Spiral
  if (showSpiral && tiling.tiles.length) {
    const arcs = computeGoldenSpiralArcs(tiling.tiles, { inset: 0 });
    const path = svgElNS("path");

    // Build SVG arc path segments in screen coords.
    // SVG arc uses (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
    // Our arcs are quarter-circles; large-arc-flag = 0.
    // Need sweep-flag consistent with y-down coordinates; for a0->a1 as defined above, use sweep=1.
    let d = "";
    for (const a of arcs) {
      const pStart = applyTransformPt({ x: a.x0, y: a.y0 }, tr);
      const pEnd = applyTransformPt({ x: a.x1, y: a.y1 }, tr);
      const r = a.r * tr.scale;

      d += `M ${pStart.x.toFixed(3)} ${pStart.y.toFixed(3)} `;
      d += `A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 1 ${pEnd.x.toFixed(3)} ${pEnd.y.toFixed(3)} `;
    }

    setAttrs(path, {
      d: d.trim(),
      fill: "none",
      stroke: theme.spiral,
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    g.appendChild(path);
  }

  return { bounds, tiles: tiling.tiles, transform: tr };
}