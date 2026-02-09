// src/main.js
// Application controller: event wiring, state management, rendering pipeline
// ES module

import {
  PHI,
  cfPhiValue,
  cfPhiConvergentPQ,
  bigIntDivToDecimal,
  fibRatioTable,
  absoluteError,
  relativeError
} from "./phiMath.js";

import { renderGoldenTilingCanvas, renderGoldenTilingSVG } from "./viz.js";

/* -------------------------------------------
   Small utilities
------------------------------------------- */

function clamp(n, a, b) {
  n = Number(n);
  if (!Number.isFinite(n)) n = a;
  return Math.max(a, Math.min(b, n));
}

function int(n, fallback = 0) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n, digits = 6) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(2, digits)
  });
}

function fmtFixed(n, digits = 8) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtSci(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  // keep small errors readable
  return n === 0 ? "0" : n.toExponential(digits);
}

function setText(el, text) {
  if (!el) return;
  el.textContent = String(text);
}

function setAriaValueText(input, text) {
  if (!input) return;
  try {
    input.setAttribute("aria-valuetext", String(text));
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------
   DOM query helpers (supports slightly different markup)
------------------------------------------- */

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function findFirst(selectors) {
  for (const s of selectors) {
    const el = qs(s);
    if (el) return el;
  }
  return null;
}

function getUI() {
  // Visualization
  const canvas = findFirst(["#tilingCanvas", "#vizCanvas", "canvas[data-viz='tiling']", "canvas"]);
  const svg = findFirst(["#tilingSvg", "svg[data-viz='tiling']"]);

  // Controls (support multiple ids/names to be resilient)
  const depth = findFirst(["#depth", "#tileDepth", "input[name='depth']", "input[data-control='depth']"]);
  const ratioMode = findFirst(["#ratioMode", "#mode", "select[name='mode']", "select[data-control='mode']"]);
  const ratio = findFirst(["#ratio", "#rectRatio", "input[name='ratio']", "input[data-control='ratio']"]);
  const showSpiral = findFirst(["#showSpiral", "#spiral", "input[name='showSpiral']", "input[data-control='showSpiral']"]);
  const showLabels = findFirst(["#showLabels", "#labels", "input[name='showLabels']", "input[data-control='showLabels']"]);

  // Readouts
  const phiReadout = findFirst(["#phiValue", "[data-readout='phi']", ".phiValue"]);
  const ratioReadout = findFirst(["#ratioValue", "[data-readout='ratio']", ".ratioValue"]);
  const absErrReadout = findFirst(["#absError", "[data-readout='absError']", ".absError"]);
  const relErrReadout = findFirst(["#relError", "[data-readout='relError']", ".relError"]);

  // Continued fraction / Fibonacci section inputs (optional)
  const cfK = findFirst(["#cfDepth", "#cfK", "input[name='cfDepth']", "input[data-control='cfDepth']"]);
  const fibN = findFirst(["#fibN", "#fibDepth", "input[name='fibN']", "input[data-control='fibN']"]);

  // Tables/containers (optional)
  const cfOut = findFirst(["#cfOut", "[data-out='cf']", ".cfOut"]);
  const fibOut = findFirst(["#fibOut", "[data-out='fib']", ".fibOut"]);
  const fibTable = findFirst(["#fibTable", "table[data-table='fib']", ".fibTable"]);

  // Buttons (optional)
  const resetBtn = findFirst(["#reset", "button[data-action='reset']"]);
  const randomBtn = findFirst(["#randomize", "button[data-action='randomize']"]);
  const exportBtn = findFirst(["#exportPng", "button[data-action='exportPng']"]);

  // Theme toggles (optional)
  const themeSel = findFirst(["#theme", "select[name='theme']", "select[data-control='theme']"]);
  const contrastChk = findFirst(["#highContrast", "input[name='highContrast']", "input[data-control='highContrast']"]);

  return {
    canvas,
    svg,
    controls: { depth, ratioMode, ratio, showSpiral, showLabels, cfK, fibN, themeSel, contrastChk },
    readouts: { phiReadout, ratioReadout, absErrReadout, relErrReadout },
    outputs: { cfOut, fibOut, fibTable },
    actions: { resetBtn, randomBtn, exportBtn }
  };
}

/* -------------------------------------------
   App state
------------------------------------------- */

const DEFAULTS = {
  // Visualization
  depth: 10,
  ratioMode: "phi", // "phi" | "custom"
  ratio: PHI,
  showSpiral: true,
  showLabels: false,

  // Math panels
  cfDepth: 8,
  fibN: 12,

  // Appearance (optional)
  theme: "auto", // "auto" | "dark" | "light"
  highContrast: false
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem("phiExplorerState");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function persistState(state) {
  try {
    localStorage.setItem("phiExplorerState", JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function normalizeState(partial) {
  const s = { ...DEFAULTS, ...(partial || {}) };

  s.depth = clamp(int(s.depth, DEFAULTS.depth), 1, 40);
  s.cfDepth = clamp(int(s.cfDepth, DEFAULTS.cfDepth), 1, 60);
  s.fibN = clamp(int(s.fibN, DEFAULTS.fibN), 1, 60);

  s.ratioMode = s.ratioMode === "custom" ? "custom" : "phi";

  // Ratio: if custom allow a reasonable range; if phi enforce φ
  if (s.ratioMode === "phi") {
    s.ratio = PHI;
  } else {
    s.ratio = clamp(Number(s.ratio), 0.2, 5.0);
  }

  s.showSpiral = !!s.showSpiral;
  s.showLabels = !!s.showLabels;

  s.theme = (s.theme === "dark" || s.theme === "light") ? s.theme : "auto";
  s.highContrast = !!s.highContrast;

  return s;
}

/* -------------------------------------------
   Rendering
------------------------------------------- */

function applyTheme(state, ui) {
  // Optional: the host may not include theme controls; still apply persisted prefs.
  if (state.theme === "light") document.documentElement.dataset.theme = "light";
  else if (state.theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;

  if (state.highContrast) document.documentElement.dataset.contrast = "high";
  else delete document.documentElement.dataset.contrast;

  // Reflect controls if present
  if (ui?.controls?.themeSel) ui.controls.themeSel.value = state.theme;
  if (ui?.controls?.contrastChk) ui.controls.contrastChk.checked = state.highContrast;
}

function renderReadouts(state, ui) {
  const ratio = state.ratio;
  const absErr = absoluteError(ratio, PHI);
  const relErr = relativeError(ratio, PHI);

  setText(ui.readouts.phiReadout, fmtFixed(PHI, 12));
  setText(ui.readouts.ratioReadout, fmtFixed(ratio, 12));
  setText(ui.readouts.absErrReadout, fmtSci(absErr, 4));
  setText(ui.readouts.relErrReadout, fmtSci(relErr, 4));

  // aria-valuetext for sliders if present
  setAriaValueText(ui.controls.ratio, `Ratio ${fmtFixed(ratio, 6)}; error ${fmtSci(absErr, 3)}`);
  setAriaValueText(ui.controls.depth, `Depth ${state.depth}`);
}

function renderMathPanels(state, ui) {
  // Continued fraction
  if (ui.controls.cfK || ui.outputs.cfOut) {
    const k = state.cfDepth;
    const val = cfPhiValue(k);
    const { p, q } = cfPhiConvergentPQ(k);

    const dec = bigIntDivToDecimal(p, q, 24);
    const absErr = absoluteError(val, PHI);

    if (ui.outputs.cfOut) {
      // Minimal markup: plain text, safe for any container
      ui.outputs.cfOut.textContent =
        `Depth k=${k}\n` +
        `Convergent p/q = ${p.toString()}/${q.toString()}\n` +
        `Decimal ≈ ${dec}\n` +
        `Value (Number) ≈ ${fmtFixed(val, 12)}\n` +
        `|error| ≈ ${fmtSci(absErr, 4)}`;
    }
  }

  // Fibonacci ratios (table)
  if (ui.controls.fibN || ui.outputs.fibTable || ui.outputs.fibOut) {
    const nMax = state.fibN;
    const rows = fibRatioTable(nMax, PHI);

    if (ui.outputs.fibOut) {
      const last = rows[rows.length - 1];
      ui.outputs.fibOut.textContent =
        `n=1..${nMax}\n` +
        `Last ratio F(n+1)/F(n) at n=${last.n}: ${fmtFixed(last.ratio, 12)}\n` +
        `|error| ≈ ${fmtSci(last.absErr, 4)} (rel ${fmtSci(last.relErr, 4)})`;
    }

    if (ui.outputs.fibTable && ui.outputs.fibTable.tagName === "TABLE") {
      const table = ui.outputs.fibTable;
      const tbody = table.tBodies[0] || table.appendChild(document.createElement("tbody"));
      // Clear
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

      // Build compact rows (limit DOM)
      const maxRows = Math.min(rows.length, 25);
      const start = rows.length > maxRows ? rows.length - maxRows : 0;

      for (let i = start; i < rows.length; i++) {
        const r = rows[i];
        const tr = document.createElement("tr");

        const tdN = document.createElement("td");
        const tdF = document.createElement("td");
        const tdNext = document.createElement("td");
        const tdRatio = document.createElement("td");
        const tdErr = document.createElement("td");

        tdN.textContent = String(r.n);
        tdF.textContent = String(r.f);
        tdNext.textContent = String(r.next);
        tdRatio.textContent = fmtFixed(r.ratio, 10);
        tdErr.textContent = fmtSci(r.absErr, 3);

        tr.append(tdN, tdF, tdNext, tdRatio, tdErr);
        tbody.appendChild(tr);
      }
    }
  }
}

function renderViz(state, ui) {
  const opts = {
    ratio: state.ratio,
    depth: state.depth,
    showSpiral: state.showSpiral,
    showLabels: state.showLabels,
    padding: 16,
    minSquarePx: 10
  };

  if (ui.canvas) renderGoldenTilingCanvas(ui.canvas, opts);
  if (ui.svg) renderGoldenTilingSVG(ui.svg, opts);
}

function syncControlsFromState(state, ui) {
  const c = ui.controls;

  if (c.depth) c.depth.value = String(state.depth);
  if (c.ratioMode) c.ratioMode.value = state.ratioMode;
  if (c.ratio) {
    c.ratio.value = String(state.ratioMode === "phi" ? PHI : state.ratio);
    c.ratio.disabled = state.ratioMode !== "custom";
  }
  if (c.showSpiral) c.showSpiral.checked = state.showSpiral;
  if (c.showLabels) c.showLabels.checked = state.showLabels;

  if (c.cfK) c.cfK.value = String(state.cfDepth);
  if (c.fibN) c.fibN.value = String(state.fibN);
}

/* -------------------------------------------
   Render scheduler
------------------------------------------- */

function createScheduler(renderFn) {
  let raf = 0;
  let pending = false;

  function schedule() {
    if (pending) return;
    pending = true;
    raf = requestAnimationFrame(() => {
      pending = false;
      renderFn();
    });
  }

  function cancel() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pending = false;
  }

  return { schedule, cancel };
}

/* -------------------------------------------
   Event wiring
------------------------------------------- */

function wire(ui, getState, setState, scheduleRender) {
  const c = ui.controls;
  const a = ui.actions;

  function onInput(el, handler) {
    if (!el) return;
    el.addEventListener("input", handler, { passive: true });
    el.addEventListener("change", handler, { passive: true });
  }

  onInput(c.depth, () => setState({ depth: int(c.depth.value, DEFAULTS.depth) }));
  onInput(c.ratioMode, () => setState({ ratioMode: c.ratioMode.value }));
  onInput(c.ratio, () => setState({ ratio: Number(c.ratio.value), ratioMode: "custom" }));
  onInput(c.showSpiral, () => setState({ showSpiral: !!c.showSpiral.checked }));
  onInput(c.showLabels, () => setState({ showLabels: !!c.showLabels.checked }));

  onInput(c.cfK, () => setState({ cfDepth: int(c.cfK.value, DEFAULTS.cfDepth) }));
  onInput(c.fibN, () => setState({ fibN: int(c.fibN.value, DEFAULTS.fibN) }));

  onInput(c.themeSel, () => setState({ theme: c.themeSel.value }));
  onInput(c.contrastChk, () => setState({ highContrast: !!c.contrastChk.checked }));

  if (a.resetBtn) {
    a.resetBtn.addEventListener("click", () => setState({ ...DEFAULTS }), { passive: true });
  }

  if (a.randomBtn) {
    a.randomBtn.addEventListener("click", () => {
      // random ratio around φ to show error readout
      const jitter = (Math.random() - 0.5) * 0.6; // ±0.3
      setState({
        ratioMode: "custom",
        ratio: clamp(PHI + jitter, 0.2, 5.0),
        depth: clamp(DEFAULTS.depth + int((Math.random() - 0.5) * 12, 0), 1, 40)
      });
    }, { passive: true });
  }

  if (a.exportBtn) {
    a.exportBtn.addEventListener("click", () => {
      if (!ui.canvas) return;
      try {
        const url = ui.canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = url;
        link.download = "phi-explorer.png";
        link.click();
      } catch {
        /* ignore */
      }
    }, { passive: true });
  }

  // Keyboard shortcuts (non-invasive)
  window.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const typing = tag === "input" || tag === "select" || tag === "textarea";
    if (typing) return;

    const s = getState();
    if (e.key === "r" || e.key === "R") {
      setState({ ...DEFAULTS });
    } else if (e.key === "ArrowUp") {
      setState({ depth: s.depth + 1 });
    } else if (e.key === "ArrowDown") {
      setState({ depth: s.depth - 1 });
    } else if (e.key === "s" || e.key === "S") {
      setState({ showSpiral: !s.showSpiral });
    }
  }, { passive: true });

  // Resize handling for crisp canvas redraw
  const resizeTarget = ui.canvas || ui.svg;
  if (resizeTarget && "ResizeObserver" in window) {
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(resizeTarget);
  } else {
    window.addEventListener("resize", () => scheduleRender(), { passive: true });
  }
}

/* -------------------------------------------
   Boot
------------------------------------------- */

function main() {
  const ui = getUI();

  let state = normalizeState(loadPersisted() || DEFAULTS);

  const scheduler = createScheduler(() => {
    // Apply theme first (affects computed colors if CSS variables are used in viz)
    applyTheme(state, ui);
    syncControlsFromState(state, ui);
    renderReadouts(state, ui);
    renderMathPanels(state, ui);
    renderViz(state, ui);
    persistState(state);
  });

  function getState() {
    return state;
  }

  function setState(patch) {
    state = normalizeState({ ...state, ...(patch || {}) });
    scheduler.schedule();
  }

  wire(ui, getState, setState, scheduler.schedule);

  // Initial render
  scheduler.schedule();

  // Expose for debugging (non-essential)
  window.__phiExplorer = { getState, setState, PHI };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}