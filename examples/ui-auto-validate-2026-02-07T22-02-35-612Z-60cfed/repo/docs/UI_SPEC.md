```markdown
# UI Wireframe Spec & Component Responsibilities — Golden Ratio (φ) Explorer

This document specifies the **desktop UI wireframes**, **user interactions**, and **component responsibilities** for the offline Golden Ratio (φ) Explorer app.

Target stack: **Python 3.11 + PySide6 (Qt 6)** with custom `QWidget` canvases drawn via `QPainter`.

---

## 1. UX goals & principles

### 1.1 Primary UX goal
Let users choose a **base length A** and immediately *see* golden-proportion relationships via:
- numeric calculations (A·φ, A/φ)
- exact φ-based golden-rectangle subdivision
- Fibonacci-square tiling + quarter-arc “Fibonacci spiral”
- quick reference formulas

### 1.2 Principles
- **Immediate feedback:** changes to A/steps/squares update outputs and visuals instantly.
- **Offline-first:** no webviews, no network calls, all reference content bundled.
- **Single source of truth:** `AppState` drives all UI and rendering.
- **Deterministic geometry:** visuals produced from pure geometry functions; render is a pure view.

---

## 2. Information architecture & navigation

### 2.1 Main navigation
Use a `QTabWidget` with 4 tabs:

1. **Calculator**
2. **Golden Rectangle**
3. **Spiral**
4. **References**

### 2.2 Shared controls (recommended)
A persistent “Base length A” control appears in a top toolbar so all tabs stay in sync.

Optional shared display control:
- **Decimals** (3/6/10/15) affecting *display formatting only*.

---

## 3. Global layout wireframe (Main Window)

### 3.1 Window anatomy
```
+--------------------------------------------------------------+
| Golden Ratio (φ) Explorer                                    |
+--------------------------------------------------------------+
| Toolbar:  A [ QDoubleSpinBox ]  Units [label]  Decimals [▼]  |
+--------------------------------------------------------------+
| Tabs: [ Calculator ] [ Golden Rectangle ] [ Spiral ] [ Ref ] |
+--------------------------------------------------------------+
| Tab Content Area (varies)                                    |
|                                                              |
+--------------------------------------------------------------+
| Status bar (optional): hints, hover info, copy confirmations |
+--------------------------------------------------------------+
```

### 3.2 Toolbar controls
- **A input**: `QDoubleSpinBox`
  - constraints: `A > 0`
  - defaults: `A = 100.0`
  - min: `1e-6` (or 0.000001), max: `1e9` (practical upper bound)
  - step: 1.0 (or adaptive; allow typing)
- **Decimals**: `QComboBox` values: `3, 6, 10, 15`
  - default: `6`
- Units label: informational only (e.g., “units”); app treats lengths as dimensionless.

### 3.3 State synchronization rule
- Changing **A** updates:
  - Calculator outputs
  - Golden rectangle geometry scale/labels
  - Spiral scale (via its baseLength mapping; see §6.3)
- Changing **Decimals** updates *display formatting* in all numeric labels, not geometry.

---

## 4. Tab 1 — Calculator

### 4.1 Purpose
Compute golden-ratio multiples/divisions of A and reinforce identities.

### 4.2 Wireframe
```
+--------------------------------------------------------------+
| Calculator                                                    |
|                                                              |
| A (base length)  [ read-only mirror of toolbar A ]            |
|                                                              |
| Results:                                                      |
|  - A·φ        [ value ]  [Copy]                               |
|  - A/φ        [ value ]  [Copy]                               |
|                                                              |
| Identity check (optional, educational):                       |
|  - A/φ = A·(φ − 1)  [ value ]                                 |
|  - A·φ = A + A/φ    [ value ]                                 |
|                                                              |
| Mini reference:                                               |
|  φ = (1 + √5)/2  ≈ 1.6180339887…                              |
|  1/φ = φ − 1      ≈ 0.6180339887…                             |
+--------------------------------------------------------------+
```

### 4.3 Interactions
- All outputs update on any change to `AppState.base_length_A` or `display_decimals`.
- Copy buttons place the **full-precision formatted display value** onto clipboard.
- If A is invalid (should be prevented by spinbox), show “—” in outputs.

### 4.4 Component responsibilities
- **CalculatorPanel (UI)**
  - renders labels/outputs
  - formats numbers according to `display_decimals`
  - emits copy actions
- **phi_math (core)**
  - provides `PHI`, `INV_PHI` and helper formulas (pure)
- No custom rendering canvas required.

---

## 5. Tab 2 — Golden Rectangle (exact φ subdivision)

### 5.1 Purpose
Show a golden rectangle (ratio φ:1) and its iterative splitting into squares + smaller golden rectangles.

### 5.2 Wireframe
```
+--------------------------------------------------------------+
| Golden Rectangle                                              |
| Controls (left/above)                Canvas (right/below)     |
|  Steps [ 0..12 ]                      +-------------------+   |
|  Orientation [ Wide | Tall ]          |                   |   |
|  Turn [ CW | CCW ]                    |   Drawing area    |   |
|  [ ] Show labels                      | (outer rect,      |   |
|  [ ] Show outlines                    | squares, labels)  |   |
|  Stroke [1..6]                        |                   |   |
|  Theme  [ Light | Dark | HighContrast]|                   |   |
|  [ Fit to view ]  [ Reset defaults ]  +-------------------+   |
+--------------------------------------------------------------+
```

### 5.3 Controls & defaults
- **Steps**: `QSpinBox` 0–12 (default 7)
- **Orientation**: `Wide` (default) / `Tall`
- **Turn direction**: `CW` (default) / `CCW`
- **Show labels**: default ON
- **Show outlines**: default ON
- **Stroke width**: default 2
- **Theme**: default Light
- **Fit to view**: centers and scales geometry to canvas (see §7)

### 5.4 Visual requirements
- Draw **outer** golden rectangle border.
- Draw each removed square with:
  - alternating fill colors (theme-dependent)
  - optional index label (`i`) or side label (`A/φ^k`)
- Draw remainder rectangle outline (optional) after all steps.
- Labels:
  - should not clutter excessively; if labels overlap, prefer:
    - show fewer labels (e.g., only first 4)
    - or show on hover (optional enhancement)
- Hover tooltip (optional):
  - show step, side length, exponent k, and edge used.

### 5.5 Geometry source
Use the exact φ subdivision geometry generator:
- Inputs: `A`, `steps`, `orientation`, `turn`, `origin`
- Outputs: `outer`, `squares[]`, `remainder`, `bounds`

### 5.6 Component responsibilities
- **GoldenRectanglePanel (UI container)**
  - owns controls
  - binds control values to `AppState` fields:
    - `rect_steps`, `rect_orientation`, `rect_turn`, `rect_show_labels`, etc.
  - triggers canvas update
- **GoldenRectangleView (canvas widget)**
  - receives current `AppState` (or a view-model slice)
  - calls core geometry generator to compute shapes
  - computes fit-to-view transform
  - draws via renderer helpers
- **core/goldenRectangle (geometry)**
  - pure geometry; no Qt dependencies
- **render/draw_golden_rectangle (render)**
  - QPainter-specific drawing of outer/squares/labels using a provided transform & theme

---

## 6. Tab 3 — Spiral (Fibonacci tiling + quarter arcs)

### 6.1 Purpose
Demonstrate the Fibonacci approximation to φ via squares and a spiral-like arc path.

### 6.2 Wireframe
```
+--------------------------------------------------------------+
| Spiral                                                        |
| Controls (left/above)                Canvas (right/below)     |
|  Squares [ 1..14 ]                    +-------------------+   |
|  Direction [ Clockwise | Counter ]    |                   |   |
|  [x] Show squares                     |  Fibonacci tiling |   |
|  [x] Show arcs                        |  + quarter arcs   |   |
|  Base mapping:                        |                   |   |
|    Anchor index [ 1..10 ]             |                   |   |
|    (F_anchor maps to A)               |                   |   |
|  Stroke [1..6]                        |                   |   |
|  [ Fit to view ]  [ Reset defaults ]  +-------------------+   |
+--------------------------------------------------------------+
```

### 6.3 Controls & defaults
- **Squares count**: `QSpinBox` 1–14 (default 10)
- **Direction**: Clockwise (default) / Counterclockwise
- **Show squares**: ON
- **Show arcs**: ON
- **Anchor index**: `QSpinBox` 1–10 (default 6)
  - Meaning: `F_anchor` square size maps to base length `A`
  - Example (default): `F6 = 8` so scale = `A/8`
- **Stroke width**: default 2
- Fit-to-view, Reset defaults

### 6.4 Visual requirements
- If show squares:
  - draw each square outline; optionally alternating light fills
  - optionally label with `F_n` or side size (optional)
- If show arcs:
  - draw one quarter-circle arc per square, with consistent stroke
- Overall layout must be auto-fit and centered with padding.

### 6.5 Geometry source
Use Fibonacci spiral generator (approximation):
- Inputs: `count`, `clockwise`, `baseLength=A`, `baseIndex=anchorIndex`, `offset` (optional)
- Outputs: `squares[]`, `arcs[]`, `bounds`, `scale`

### 6.6 Component responsibilities
- **SpiralPanel (UI container)**
  - owns controls
  - writes into `AppState`:
    - `spiral_squares`, `spiral_clockwise`, `spiral_show_squares`, `spiral_show_arcs`, `spiral_anchor_index`, etc.
- **SpiralView (canvas widget)**
  - computes geometry from core generator
  - performs fit-to-view transform
  - draws squares/arcs based on toggles
- **core/fibonacciSpiral (geometry)**
  - pure geometry; no Qt dependencies
- **render/draw_fibonacci_spiral (render)**
  - QPainter routines for squares/arcs/labels

---

## 7. Tab 4 — References

### 7.1 Purpose
Provide offline quick-reference: definition, continued fraction, identities, Fibonacci relation, derivations.

### 7.2 Wireframe
```
+--------------------------------------------------------------+
| References                                                    |
| Left: Section list        | Right: Content viewer            |
|  - Definition             |  Heading                         |
|  - Key constants          |  paragraph text                  |
|  - Continued fraction     |  math blocks (monospace)         |
|  - Core identities        |  bullets                         |
|  - Derivations            |                                  |
|  - Fibonacci & φ          |                                  |
|  - Handy relations        |                                  |
+--------------------------------------------------------------+
```

### 7.3 Implementation detail
- Left: `QListWidget` or `QTreeWidget` (flat list is enough)
- Right: `QScrollArea` containing a `QWidget` with `QVBoxLayout` of:
  - heading labels
  - paragraph labels (word wrap)
  - bullet list labels
  - math blocks in monospace (e.g., `QPlainTextEdit` read-only or QLabel with fixed font)

### 7.4 Component responsibilities
- **ReferencesPanel**
  - loads reference sections from bundled static content module
  - renders selected section blocks
  - provides in-page search optional (nice-to-have, not required)
- **content/references (static)**
  - ships all text locally
  - no runtime fetching

---

## 8. Canvas behavior (Golden Rectangle View & Spiral View)

### 8.1 Fit-to-view transform (required)
Both canvases implement consistent fitting:
1. Compute geometry bounds `(x, y, w, h)`
2. Define viewport = widget rect minus padding (e.g., 16px)
3. Scale uniformly:
   - `s = min(viewport.w / bounds.w, viewport.h / bounds.h)`
4. Translate to center:
   - Move bounds center to viewport center
5. Apply transform to `QPainter`:
   - `painter.translate(...)`, `painter.scale(s, s)`, plus geometry-origin translation

### 8.2 Padding and resizing
- On widget resize: redraw; fit-to-view recalculated automatically.
- Fit-to-view button: re-center (useful if later adding pan/zoom).

### 8.3 Rendering hints
- Enable antialiasing:
  - `QPainter.Antialiasing` for arcs/diagonals
  - consider `TextAntialiasing` for labels

### 8.4 Visual theming (minimal)
Define a small theme object used by renderers:
- background color
- outline color
- square fill palette (2–4 alternating)
- arc stroke color
- label color

High-contrast theme should meet basic readability.

---

## 9. AppState (UI-driven state contract)

This is the state the UI reads/writes. Field names are illustrative; keep consistent with your actual model.

```ts
AppState {
  base_length_A: number
  display_decimals: 3|6|10|15

  // Golden rectangle
  rect_steps: number          // 0..12
  rect_orientation: "WIDE"|"TALL"
  rect_turn: "CW"|"CCW"
  rect_show_labels: boolean
  rect_show_outlines: boolean
  rect_stroke_width: number   // 1..6
  rect_theme: "LIGHT"|"DARK"|"HIGH_CONTRAST"

  // Spiral
  spiral_squares: number      // 1..14
  spiral_clockwise: boolean
  spiral_show_squares: boolean
  spiral_show_arcs: boolean
  spiral_anchor_index: number // 1..10
  spiral_stroke_width: number // 1..6
}
```

Rules:
- State changes trigger view recompute + repaint.
- Geometry computation is **pure** and derived from state at render time (or cached per update).

---

## 10. Validation, error states, and edge cases

### 10.1 Base length A
- Must be `> 0`.
- UI prevents invalid values via `QDoubleSpinBox` constraints.
- If somehow invalid, canvases render an empty state with an instructional message:
  - “Set A > 0 to display geometry.”

### 10.2 Steps / squares
- `steps = 0`:
  - golden rectangle shows only outer rectangle, no squares
- `count = 1`:
  - spiral shows single square with a single quarter arc (still valid)
- Very large A:
  - fit-to-view keeps it visible (geometry scaled down)

### 10.3 Label crowding
If labels overlap or become too small at high step counts:
- auto-hide detailed labels when computed font size would drop below a threshold (e.g., < 8px)
- or show only first N labels (implementation choice)

---

## 11. Keyboard & accessibility expectations (basic)

- Tab order:
  - toolbar A → decimals → tab bar → tab controls → canvas
- Keyboard shortcuts (optional but helpful):
  - `Ctrl+1..4`: switch tabs
  - `Ctrl+L`: focus A input
  - `Ctrl+C` when an output label is focused triggers copy (optional)
- Ensure sufficient contrast for text/lines, especially in dark/high-contrast themes.

---

## 12. Component inventory (implementation-level)

### 12.1 UI modules
- `MainWindow`
  - owns toolbar, tabs, and `AppState` store
  - connects signals to update state
- `CalculatorPanel`
- `GoldenRectanglePanel`
- `GoldenRectangleView` (QWidget canvas)
- `SpiralPanel`
- `SpiralView` (QWidget canvas)
- `ReferencesPanel`

### 12.2 Core modules (no Qt)
- `constants`: `PHI`, `INV_PHI`
- `phi_math`: helper computations
- `goldenRectangleSplit`: exact φ subdivision geometry
- `generateFibonacciSpiral`: Fibonacci tiling + arc geometry
- `references`: static reference sections

### 12.3 Render modules (Qt/QPainter)
- `draw_common`: fit-to-view helper, theme palette, text helpers
- `draw_golden_rectangle`: draw outer/squares/labels
- `draw_fibonacci_spiral`: draw squares/arcs/labels

---

## 13. Acceptance criteria (UI)

- User can change **A** and immediately see:
  - updated calculator values
  - updated golden rectangle subdivision sizes
  - updated spiral scale
- Golden rectangle tab:
  - steps/orientation/turn toggles visibly change the subdivision layout
- Spiral tab:
  - count/direction/toggles change visuals deterministically
- References tab:
  - all content visible offline with readable formatting and scrolling

---
```