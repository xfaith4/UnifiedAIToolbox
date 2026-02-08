## Quality Review (docs/QA_CHECKLIST.md focus)

### 1) Math correctness

**PhiCalculator.tsx**
- ✅ Correct formulas displayed/used:
  - `A·φ`, `A/φ`, and identity check `A·(φ−1) = A/φ` are mathematically correct since `φ−1 = 1/φ`.
- ✅ Uses shared core constants (`PHI`, `INV_PHI`, `PHI_MINUS_1`) and `phiCalc(A)` with validation.
- ⚠️ Input edge case: `onChange={(e) => onChangeA(e.currentTarget.valueAsNumber)}`  
  - When the input is cleared, `valueAsNumber` becomes `NaN`. This propagates up and will cause `phiCalc(A)` to throw (caught and shown as "—"), which is acceptable, but it can also “poison” global A for other panels (rectangle/spiral) if shared.
  - Recommendation: sanitize at the boundary, e.g. if `Number.isFinite(next)` then update; else keep previous or set a safe default.

**GoldenRectangleView.tsx**
- ✅ Uses `goldenRectangleSplit` from core; clamps steps to `[0,12]`, A to `>= 1e-6`. Good defensive handling.
- ✅ Tooltip/labels are derived from `goldenSideLabel(shortExponent)` which aligns with tests (`A`, `A/φ`, `A/φ^2`, …).
- ⚠️ Truncated code includes: `if (sq.side < minSideForText) return null` (missing semicolon).  
  - Not a correctness issue in TS/JS, but ensure the actual file compiles (the snippet is truncated; verify no syntax issues around this area).

**FibonacciSpiralView.tsx**
- ✅ Uses `fibonacciSpiral(...)` from core; clamps square count `[1,14]`, baseA fallback to `1` if invalid.
- ✅ Arc drawing logic accounts for wrap-around when end angle < start angle.
- ⚠️ Potential conceptual mismatch risk: The canvas arc angle comments mention “positive is clockwise” due to y-down. This is easy to get subtly wrong, but the wrap handling plus visual check likely makes it fine. Ensure geometry’s `centerCorner` mapping matches the intended quarter-arc orientation.
- ⚠️ Verify naming alignment: tests reference `generateFibonacciSpiral` in `src/core/fibonacciSpiral`, while component imports `fibonacciSpiral` from `../../core/fibonacciSpiral`. That’s fine if both exist, but it’s a common integration failure mode (export mismatch). Worth confirming the module exports.

### 2) UI clarity & UX

**PhiCalculator**
- ✅ Clear grouping: input/decimals, results, identity check, quick reference.
- ✅ “Copy” affordance on each output is good.
- ⚠️ Step size fixed at `step={1}` may be limiting if users want small lengths. Consider `step="any"` or a smaller default step (or allow arrow increments).
- ⚠️ No explicit validation messaging when A is invalid (shows “—”). That’s acceptable, but a small helper text (“Enter a positive number”) would improve clarity.

**GoldenRectangleView**
- ✅ `aria-label` on SVG provided.
- ✅ Theme support includes high contrast palette.
- ⚠️ If labels are turned on, clutter management via `maxLabels` is good; additionally, consider an on-canvas legend or explanation of label meaning (`A/φ^k`) for first-time users.

**FibonacciSpiralView**
- ✅ Canvas approach is appropriate; labels show `F(n)=value`.
- ⚠️ Accessibility: canvas content isn’t inherently accessible. Consider adding an offscreen textual summary (e.g., list of square sizes / Fibonacci numbers) when `showLabels` is enabled, or at least `aria-label` on the `<canvas>`.

**QuickReferences**
- ✅ Good structure (sections list + content). Copy section as plain text is a useful offline feature.
- ⚠️ Layout fixed `gridTemplateColumns: "260px 1fr"` may not fit very narrow windows. Consider responsive behavior (stack on small widths).

### 3) Offline behavior (no network dependency)

- ✅ All shown features are local computations and local rendering (SVG/Canvas).
- ✅ Clipboard usage:
  - PhiCalculator: uses `navigator.clipboard.writeText` only, fail-silent.
  - QuickReferences: uses modern clipboard API with a fallback to `execCommand("copy")`.
- ⚠️ Offline / Electron nuance: `navigator.clipboard` may be blocked depending on context isolation/permissions. QuickReferences’ fallback is more robust; PhiCalculator lacks that fallback.
  - Recommendation: reuse the QuickReferences clipboard helper (or duplicate fallback) in PhiCalculator for consistent behavior.

### 4) Performance & responsiveness

**PhiCalculator**
- ✅ `useMemo` around `phiCalc(A)` is fine (though calculation is trivial).
- ✅ Rendering is lightweight.

**GoldenRectangleView (SVG)**
- ✅ Uses `ResizeObserver` to adapt to container size.
- ✅ Geometry computation memoized.
- ⚠️ `ResizeObserver` updates state on every resize event; OK, but ensure no layout thrash (it also calls `getBoundingClientRect()` once initially—fine).
- ✅ `vectorEffect="non-scaling-stroke"` keeps strokes visually consistent; good for readability.

**FibonacciSpiralView (Canvas)**
- ✅ DPR scaling implemented; redraw happens on dependency changes.
- ⚠️ DPR scaling uses `Math.floor(devicePixelRatio)` (caps fractional DPR). This reduces sharpness on common DPR=1.25/1.5/2.0 devices (2 is fine). Consider using the actual DPR (clamped to a max like 2) for better fidelity:
  - e.g. `const dpr = Math.min(2, window.devicePixelRatio || 1);`
- ⚠️ Effect dependencies: redraw runs when any prop changes. That’s expected. Ensure `geom` memoization is correct so it doesn’t recreate geometry unnecessarily (it depends on baseA, squares, direction).
- ✅ Stroke width adjustment by dividing by `scale` is good (keeps consistent screen thickness).

### 5) Testing coverage alignment

- ✅ Unit tests cover core math identities, clamp/assertions, golden rectangle invariants, and spiral generation invariants.
- ⚠️ There’s risk of “two sources of truth” for spiral generator naming (`fibonacciSpiral` vs `generateFibonacciSpiral`). Ensure exports are consistent and tests reflect the used function, otherwise CI failures or runtime import errors may occur.

---

## Issues & Recommendations (prioritized)

### High
1) **Sanitize numeric input to avoid propagating NaN across the app**
   - In PhiCalculator: guard `valueAsNumber` before calling `onChangeA`.
   - If A is shared globally, ensure other panels also clamp/fallback in UI layer (GoldenRectangleView and FibonacciSpiralView already do internally, which is good).

2) **Clipboard robustness consistency**
   - Add fallback copy method (textarea + execCommand) to PhiCalculator, similar to QuickReferences, to work in restrictive offline desktop contexts.

### Medium
3) **Canvas DPR scaling quality**
   - Use non-floored DPR (optionally clamped) for crisp arcs/text on high-DPI screens.

4) **Canvas accessibility**
   - Add `role="img"` and `aria-label` (and/or an offscreen description) to the `<canvas>` element.

5) **Responsive layout for QuickReferences**
   - Add breakpoint behavior: stack sidebar above content when container width is small.

### Low
6) **Input step UX**
   - Consider `step="any"` or smaller step to allow fine-grained exploration.

7) **GoldenRectangleView label clarity**
   - Optionally add a brief legend explaining `A/φ^k` and how steps correspond to successive squares.

---

## Overall assessment

- Math logic appears correct and is strongly supported by unit tests for the core.  
- UI is generally clear and educational; minor improvements would help with invalid input feedback and small-window layouts.  
- Offline behavior is good; clipboard handling should be made consistent (add fallback in PhiCalculator).  
- Performance is appropriate for an offline explorer; canvas DPR scaling could be improved for visual quality without major cost.