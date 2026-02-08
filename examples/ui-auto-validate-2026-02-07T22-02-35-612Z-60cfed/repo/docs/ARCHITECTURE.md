```markdown
# Golden Ratio (φ) Explorer — Architecture, UI Flow, Math/Graphics Requirements

## 1) Scope & Goals

**Goal:** Build a small, offline desktop application that helps users *experience* the golden ratio φ (≈ 1.6180339887…) via:

- **φ calculator:** Given a base length **A**, compute:
  - **A·φ**
  - **A/φ**
- **Golden rectangle split visualization:** Show iterative splitting of a golden rectangle into a square + smaller golden rectangle.
- **Fibonacci (≈φ) spiral visualization:** Show the classic spiral built from quarter-circle arcs over Fibonacci squares (approximation to the golden spiral).
- **Quick references:** Continued fraction, identities, and key properties.

**Non-goals:** internet connectivity, heavy 3D graphics, complex persistence beyond lightweight local settings.

---

## 2) Technology & High-Level Architecture

### 2.1 Recommended Stack (offline, cross-platform)
- **Language:** Python 3.11+
- **Desktop UI:** **Qt** via **PySide6** (or PyQt6)
- **2D Rendering:** Qt `QPainter` on a custom `QWidget` (or `QGraphicsView` scene)
- **Packaging:** PyInstaller (Windows/macOS/Linux)

Rationale: Qt provides robust, offline, cross-platform GUI and high-quality 2D drawing with transforms, antialiasing, and text.

### 2.2 Architectural Style
A simple **MVVM/MVC hybrid**:
- **Model:** app state (base length A, visualization parameters, theme)
- **Math/Core:** pure functions (φ constants, fibonacci generation, subdivision geometry)
- **Views:** calculator panel, rectangle canvas, spiral canvas, references panel
- **Controller/ViewModel:** binds UI inputs to model updates and triggers re-render

**Key principle:** *Single source of truth state* → deterministic renders.

### 2.3 Module Layout
Proposed repository structure:

```
/app
  main.py
  ui/
    main_window.py
    calculator_panel.py
    references_panel.py
    rectangle_view.py
    spiral_view.py
  core/
    constants.py
    phi_math.py
    fibonacci.py
    geometry.py
  render/
    draw_common.py
    draw_golden_rectangle.py
    draw_fibonacci_spiral.py
/docs
  ARCHITECTURE.md
```

#### Responsibilities
- `core/constants.py`
  - `PHI` constant with high precision.
- `core/phi_math.py`
  - Derived values and identity helpers.
- `core/fibonacci.py`
  - Fibonacci sequence generation for spiral squares.
- `core/geometry.py`
  - Geometry primitives (Rect, Point), transforms (or rely on Qt), bounding-box computations.
- `render/draw_*`
  - Rendering routines that accept a `QPainter` and a computed geometry description.

---

## 3) UI Structure & Flow

### 3.1 Main Window Layout
**Top-level:** Title + tabbed interface (or left navigation):

1. **Calculator**
2. **Golden Rectangle**
3. **Spiral**
4. **References**

A persistent **Base Length (A)** control can optionally be global (toolbar) so all tabs reflect it.

### 3.2 Shared Inputs (State)
- **Base Length A**
  - Numeric input (`QDoubleSpinBox` or line edit with validator)
  - Units are arbitrary (px, cm, etc.); treat as dimensionless for math.
  - Constraints: `A > 0`. Provide reasonable min/max and allow manual typing.
- **Precision display**
  - Toggle decimals (e.g., 3 / 6 / 10 / 15) for shown numbers (not internal).

### 3.3 Tab 1 — Calculator Flow
**UI elements:**
- Input: `A`
- Outputs (read-only):
  - `A·φ`
  - `A/φ`
  - Optionally: `A·(φ-1)` and `A·(1/φ)` to show equivalence.
- Quick identity snippet:
  - `φ = (1 + √5)/2`
  - `1/φ = φ - 1`

**Interaction:**
- User edits **A** → outputs update instantly.
- Copy buttons next to outputs (optional).

### 3.4 Tab 2 — Golden Rectangle Visualization Flow
**Purpose:** Show a golden rectangle and iterative splits:
- Start with rectangle ratio **φ:1** (width:height or height:width depending on orientation).
- Repeatedly remove the largest square, leaving a smaller golden rectangle.

**Controls:**
- Steps / iterations: integer `n` (e.g., 1–12)
- Orientation: horizontal/vertical (initial rectangle wide vs tall)
- Labels toggle: show side lengths (A, A/φ, etc.)
- Color theme: alternating square colors, outline thickness.

**Interaction:**
- Changing **A** scales the initial rectangle.
- Changing **n** recomputes the subdivision list and redraws.
- Hover (optional): highlight a square/remaining rectangle and show its dimensions.

### 3.5 Tab 3 — Fibonacci Spiral Visualization Flow
**Purpose:** Draw Fibonacci tiling squares and quarter-circle arcs (approx golden spiral).

**Controls:**
- Number of squares `k` (e.g., 5–14)
- Direction (clockwise / counterclockwise)
- Show squares toggle
- Show arcs toggle
- Use Fibonacci scaling by base length:
  - Map `F_m` to a physical pixel size using `scale = A / F_base` (see §5).

**Interaction:**
- Update on parameter changes; pan/zoom optional but not required.
- Fit-to-view button: auto-scale and center.

### 3.6 Tab 4 — References Flow
Static, offline text with minimal formatting:
- Definition of φ
- Continued fraction `[1; 1, 1, 1, …]`
- Identities:
  - `φ^2 = φ + 1`
  - `φ - 1 = 1/φ`
  - `φ^n = F_n·φ + F_{n-1}` (optional)
- Fibonacci convergence:
  - `lim (F_{n+1}/F_n) = φ`

---

## 4) Data Model (State) & Update Mechanics

### 4.1 AppState (single source of truth)
Suggested fields:
- `base_length_A: float`
- `display_decimals: int`
- Golden rectangle:
  - `rect_steps: int`
  - `rect_orientation: enum {WIDE, TALL}`
  - `rect_show_labels: bool`
- Spiral:
  - `spiral_squares: int`
  - `spiral_clockwise: bool`
  - `spiral_show_squares: bool`
  - `spiral_show_arcs: bool`

### 4.2 Update Flow
1. User changes input → controller updates `AppState`.
2. Relevant view requests:
   - recompute geometry (pure functions)
   - repaint canvas (`update()`)

**No background threads required.** Computations are light.

---

## 5) Math Requirements

### 5.1 Constants & Precision
- Define:
  - `φ = (1 + sqrt(5)) / 2`
  - `invφ = 1/φ`
- Use `float` (IEEE-754 double) internally; it is sufficient for UI-scale geometry.
- Display rounding per `display_decimals`, but keep internal calculations unrounded.

### 5.2 Calculator Formulas
Given `A > 0`:
- `B1 = A * φ`
- `B2 = A / φ`
- Optional checks/educational equivalences:
  - `A/φ = A*(φ - 1)` since `1/φ = φ - 1`
  - `A*φ = A + A/φ` from `φ = 1 + 1/φ`

### 5.3 Continued Fraction / Identities (reference content)
- Continued fraction:
  - `φ = 1 + 1/(1 + 1/(1 + 1/(...)))`
- Identities:
  - `φ^2 = φ + 1`
  - `φ = 1 + 1/φ`
  - `1/φ = φ - 1`

### 5.4 Fibonacci Sequence (for spiral)
- `F_0 = 0, F_1 = 1, F_{n} = F_{n-1} + F_{n-2}`
- Use sequence starting at `1, 1, 2, 3, 5, 8, ...` for square sizes.

---

## 6) Graphics & Geometry Requirements

### 6.1 General Rendering Requirements
- Use antialiasing for arcs and diagonal text (`QPainter::Antialiasing`).
- Coordinate system:
  - Work in logical units then transform to fit widget bounds.
  - Support margin/padding around drawing.
- Fit-to-view:
  - Compute bounding box of geometry
  - Compute uniform scale factor to fit within canvas while preserving aspect ratio
  - Center geometry.

### 6.2 Golden Rectangle Split Visualization (Exact φ-based)
#### 6.2.1 Initial Rectangle
Let base length `A` represent the **short side** of the golden rectangle.
- If wide orientation:
  - Height = `A`
  - Width = `A * φ`
- If tall orientation:
  - Width = `A`
  - Height = `A * φ`

#### 6.2.2 Iterative Subdivision Algorithm
At each step:
1. Given current golden rectangle with sides `(long, short)` where `long = short * φ`.
2. Remove a square of side `short`.
3. The remaining rectangle has sides:
   - new short = `long - short = short*(φ - 1) = short*(1/φ)`
   - new long = `short`
4. Repeat for `n` iterations.

**Geometry output:**
- List of squares `S_i` (rectangles) plus final remainder rectangle `R_n`.
- Each square has:
  - position (x, y), size (side length), step index
- Alternating placement depends on orientation and step parity (rotates around).

**Rendering:**
- Draw outer rectangle border.
- Fill squares with alternating colors; optionally label side lengths:
  - `A`, `A/φ`, `A/φ^2`, … or numeric values.

### 6.3 Fibonacci Spiral Visualization (Approximation)
This uses Fibonacci squares (not exact φ scaling per step, but converges).

#### 6.3.1 Square Sizes
Generate `k` Fibonacci numbers: `F_1..F_k` (with `F_1=1, F_2=1`).
Define a pixel scaling factor:
- Choose a base Fibonacci index `b` (e.g., `b = k` or a fixed one like 8).
- Map `F_b` to `A`:
  - `scale = A / F_b`
  - square side for `F_i` is `side_i = F_i * scale`

This ensures the drawing responds to user base length A.

#### 6.3.2 Tiling Placement
Place squares in a rotating pattern to form the classic Fibonacci tiling:
- Start with two 1×1 squares adjacent.
- Each next square attaches to the current rectangle on the side that continues the rotation (right, up, left, down repeating).
- Track a current bounding rectangle; each addition expands it.

**Implementation detail:**
Maintain:
- list of placed square rects with (x, y, w, h)
- current direction index `d ∈ {0,1,2,3}` mapping to right/up/left/down (or reversed for counterclockwise)
- bounding rectangle updates each placement

#### 6.3.3 Spiral Arcs
For each square, draw a **quarter-circle arc** whose radius equals the square side length, positioned so that the arc connects corners consistent with the spiral direction.

Arc specification per square:
- bounding box: the square rect itself (or a rect of size 2r × 2r depending on convention)
- start angle and span angle: 90° segments; depend on direction and whether you’re using Qt’s angle system (16ths of a degree).

**Requirement:** The spiral should visually pass through squares smoothly and appear continuous as `k` increases.

#### 6.3.4 Rendering Options
- Toggle display of:
  - square outlines/fills
  - arcs only
- Use consistent stroke width that scales minimally with zoom (or keep constant in device pixels).

---

## 7) Error Handling & Validation

- Reject non-positive `A` (show inline validation; clamp or revert).
- Cap iterations/squares to prevent clutter and extreme scaling (e.g., max 20).
- Handle very small/large `A` by fit-to-view scaling; avoid overflow by using float and bounding checks.

---

## 8) Testing Requirements (Lightweight)

### 8.1 Unit Tests (core math)
- Verify:
  - `phi_math.phi()` matches `(1+sqrt(5))/2`
  - `phi^2 ≈ phi + 1`
  - `1/phi ≈ phi - 1`
- Golden rectangle subdivision:
  - Each remainder rectangle preserves ratio ≈ φ (within tolerance).
- Fibonacci:
  - sequence correctness
  - ratio `F_{n+1}/F_n` approaches φ.

### 8.2 Visual Smoke Tests
- Render with default parameters; ensure nothing draws off-canvas after fit-to-view.
- Check toggles and parameter changes trigger redraws without artifacts.

---

## 9) Performance & Offline Constraints

- Entire app must run **offline**; no network calls.
- Rendering should remain responsive:
  - golden rectangle steps ≤ ~12
  - spiral squares ≤ ~14 by default
- All computations are O(n) per redraw.

---

## 10) Implementation Notes / Decisions to Lock In

- **Base length meaning:**
  - Golden rectangle: short side = A (exact φ construction)
  - Fibonacci spiral: a chosen Fibonacci square maps to A via `scale`
- **Deterministic geometry:**
  - Keep geometry computation separate from drawing; store computed rect lists.
- **Aspect-fit transform:**
  - Always fit computed bounding box into widget with padding.

This document defines the architecture and the math/graphics behavior expected for a small, offline Golden Ratio (φ) Explorer desktop application.
```