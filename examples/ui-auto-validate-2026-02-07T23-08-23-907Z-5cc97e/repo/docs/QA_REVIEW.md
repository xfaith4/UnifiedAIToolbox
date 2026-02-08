```markdown
# QA Review — Golden Ratio (φ) Explorer
Critic review focusing on **UX**, **math correctness**, and **performance/stability**. Includes actionable fixes and QA test ideas.

---

## 1) UX Review

### 1.1 Input validation & feedback consistency
**Finding**
- `_parse_positive_float()` enforces **A > 0**. This is reasonable for lengths/geometry, but README and math tests imply the calculator can handle negatives (tests for `compute_phi_relations(-3.0)`).
- Current calculator UI (via `update_calculator`) uses `_get_a()` so it also enforces A>0, which may conflict with expectations: calculator is arithmetic; geometry is length-based.

**Impact**
- Users trying negative values (or 0) for calculator get blocked, even though the math would work and tests suggest it should.
- Confusing mismatch between “calculator” and “visualization” requirements.

**Fix (recommended)**
- Split parsing into two functions:
  - `parse_float_any(sign ok, finite required)` for Calculator.
  - `parse_positive_float()` for visualizations.
- UI copy: label A as “Base length A (>0)” on visualization tabs, but “Value A (any real)” on calculator if you allow negatives.

**QA**
- Enter `A=-2`:
  - Calculator should compute negative outputs (if allowed).
  - Geometry tabs should show “A must be > 0”.
- Enter `A=0`, `A=nan`, `A=inf`: ensure clear error messages and no crashes.

---

### 1.2 “Apply” model vs auto-update; reduce surprise
**Finding**
- `on_apply_a()` triggers all updates; also redraw occurs on tab change and on widget resize (via `<Configure>`).
- If there are also variable traces inside `PhiExplorerUI` (not shown), you may be redrawing more often than expected.

**Impact**
- Users may experience lag or flicker when typing (if auto-updating).
- “Apply” button becomes redundant if auto-update exists, or conversely users may not realize “Apply” is needed.

**Fix**
- Choose a single model:
  - **Explicit Apply**: no redraw while typing; update on Apply + tab switch.
  - **Auto-update with debounce**: update 200–300ms after user stops typing; still keep Apply as “Force update” optional.
- Add short status line: “Press Apply to refresh” if using explicit model.

**QA**
- Type quickly in A field; ensure app remains responsive and doesn’t redraw on every keystroke (unless intentionally debounced).

---

### 1.3 Decimal precision control: guardrails and clarity
**Finding**
- `_fmt()` clamps decimals to 0–18. Good.
- `decimals_var` is cast with `int(self.ui.decimals_var.get())`. If the widget contains non-integer text, it will throw and potentially crash unless guarded elsewhere.

**Impact**
- Potential crash from user entering invalid decimals value.

**Fix**
- Wrap decimals parse with try/except:
  - fallback to a default (e.g., 6) and show message “Decimals must be an integer (0–18)”.
- Prefer a `ttk.Spinbox`/`Combobox` with fixed numeric options.

**QA**
- Set decimals to `abc`, `-1`, `100`, `3.5`; ensure no crash and behavior matches spec.

---

### 1.4 Geometry tab controls: missing user control over “steps”
**Finding**
- `draw_golden_rectangle_splits(... steps=8 ...)` is hardcoded in the excerpt.

**Impact**
- README promises iteration control (n). Hardcoding breaks feature expectation and reduces exploratory value.

**Fix**
- Add UI control `steps_var` (Spinbox) for golden rectangle steps with clamp (e.g., 1–20).
- Apply similar control for spiral `n_terms` (if not already present).

**QA**
- Change steps 1→12 and confirm redraw updates and subdivision count changes.

---

### 1.5 Accessibility & readability
**Finding**
- Visualizations can get dense; line widths and guide toggles exist, good.
- Potential issue: color choices/contrast not mentioned; likely defaults.

**Fix**
- Provide a “High contrast” style preset or ensure default colors pass basic contrast.
- Increase font sizes slightly for reference text area; ensure it’s selectable/copyable.

**QA**
- Test on Windows/macOS/Linux with different DPI scaling; ensure labels don’t clip.

---

## 2) Math Correctness Review

### 2.1 φ constants & identities
**Finding**
- Tests assert `PHI=(1+sqrt5)/2`, `INV_PHI=1/PHI`, and identities with tight tolerances. Good.
- `reference_formulas_text(decimals=10)` is tested for specific lines.

**Risk**
- If UI uses a different formatter or substitutes minus/hyphen characters inconsistently (e.g., `−` vs `-`), text assertions can become brittle across modules.

**Fix**
- Standardize typography: either ASCII everywhere in generated text (safer for tests), or ensure tests match exact intended Unicode.
- Keep a single source of truth for reference text (`phi_math.reference_formulas_text`) and use it in `references.quick_reference_text` to avoid drift.

**QA**
- Snapshot test reference text output for a couple decimal settings (e.g., 6 and 10).

---

### 2.2 Golden rectangle subdivision correctness (orientation/steps)
**Finding**
- Smoke test checks positive widths/heights and that at least one square exists.
- But no test ensures the remaining rectangle maintains golden ratio each step, or that total area matches.

**Risk**
- Visual might be “close enough” but mathematically wrong (e.g., wrong side chosen for square removal, accumulated floating drift, wrong orientation switching).

**Fix**
- Add deterministic correctness checks in unit tests:
  - For each step, ensure each “remaining rectangle” ratio is ~φ (within tolerance).
  - Ensure each removed square side equals the rectangle’s short side.
  - Sum of square areas + final rectangle area equals initial rectangle area (within tolerance).

**QA**
- Unit test `golden_rectangle_subdivision(1.0, steps=8)`:
  - Validate monotonic decrease of rectangle sizes.
  - Validate ratio `w/h` or `h/w` equals φ depending on orientation.

---

### 2.3 Fibonacci spiral: clarify approximation vs golden spiral
**Finding**
- README correctly states Fibonacci spiral is an approximation to golden spiral.
- Smoke test validates patches exist; not validating arc placement direction consistency.

**Risk**
- Common implementation bug: arcs drawn in wrong quadrant or squares laid out incorrectly, producing a “spiral” but not the classic one.

**Fix**
- Add geometric invariants:
  - Each square should be adjacent to previous with correct offset.
  - Arc bounding boxes should match square bounds.
- Add a simple “known layout” test for n_terms=3 or 4 with exact expected square positions (small integers reduce error).

**QA**
- Visual QA: compare spiral for n=8 vs reference image (manual checklist).

---

### 2.4 Calculator: show ratio checks
**Finding**
- README mentions optional ratio checks, but code excerpt only sets mul/div fields and phi constant display.

**Fix**
- Add computed ratios:
  - `(A·φ)/A` (when A != 0) should print φ.
  - `(A)/(A/φ)` should print φ.
- If A can be negative in calculator, ratios still work; if A=0, show em dash.

**QA**
- For A=2, show ratio ≈ 1.618... with chosen decimals.

---

## 3) Performance & Stability Review

### 3.1 Excess redraw from `<Configure>` events
**Finding**
- Both canvases bind `<Configure>` to `_safe_draw(draw_idle)`. Resize events can fire rapidly; `draw_idle` helps, but Tk can still spam events.

**Impact**
- CPU spikes during window resizing; occasional flicker.

**Fix**
- Debounce redraw on `<Configure>` using `after_cancel` / `after`:
  - schedule a draw 50–100ms later; cancel previous schedule.
- Alternatively, only redraw on significant size changes or on tab visibility.

**QA**
- Resize window continuously for 5 seconds; ensure CPU remains reasonable and app stays responsive.

---

### 3.2 Matplotlib object churn on updates
**Finding**
- Update methods likely clear axes and redraw all artists each time (common pattern). This is fine for small n, but could become heavy if steps/n_terms are large or if updates happen frequently.

**Fix**
- Clamp maximum iterations in UI:
  - Golden rectangle steps max 20 (or 30).
  - Spiral terms max 15–20.
- Consider caching computed geometry (rect list / square list) separate from drawing, so changing style (linewidth/guides) doesn’t recompute Fibonacci/rectangles.

**QA**
- Stress test: set steps=30, n_terms=25; confirm no freeze longer than ~0.5–1s on typical machine.

---

### 3.3 Backend selection & headless import safety
**Finding**
- `os.environ.setdefault("MPLBACKEND", "TkAgg")` in `__main__.py` is fine for running the app.
- Tests force Agg before importing viz modules; good.
- Risk if any non-`__main__` modules import pyplot at import time (not shown).

**Fix**
- Ensure viz modules use `matplotlib.patches` etc. and accept an `Axes` object; avoid `pyplot` global state.
- Keep backend forcing only in entrypoints (`__main__`), not in library modules.

**QA**
- Run `pytest` in a headless environment (CI) to confirm no Tk display required.

---

## 4) Actionable Fix List (Implementation Notes)

### Must-fix (correctness / UX promise)
1. **Expose iteration controls**:
   - Add `steps_var` for golden rectangle and `n_terms_var` for spiral; remove hardcoded `steps=8`.
2. **Harden decimals parsing**:
   - Guard `int(...)` conversion; clamp 0–18 with user feedback.
3. **Align calculator input policy**:
   - Allow any finite float for calculator OR update README/UI to clearly state A must be > 0 everywhere.

### Should-fix (quality)
4. Debounce `<Configure>` redraw events using `after`.
5. Add ratio checks in calculator (optional but promised by README).
6. Add more unit tests for viz geometry invariants (positions/ratios/area conservation).

### Nice-to-have
7. Add “Reset defaults” button (A=1, decimals=6, steps=8, n_terms=10).
8. Add export: “Save plot as PNG” (offline-friendly, no network).
9. Provide “True golden spiral” (log spiral) overlay option to compare with Fibonacci spiral.

---

## 5) QA Test Checklist (Manual)

### Calculator
- [ ] A=1, decimals=6: outputs match expected.
- [ ] A=-2: either accepted (and computed) or rejected with clear, intentional message.
- [ ] A=0 / blank / “abc”: no crash; clear error.
- [ ] Decimals invalid: no crash; fallback works.

### Golden Rectangle
- [ ] Steps slider/spinbox changes subdivision depth.
- [ ] Aspect ratio stays correct when resizing window.
- [ ] Guides toggle works; linewidth changes apply.

### Spiral
- [ ] Increasing n_terms adds squares/arcs; spiral direction consistent.
- [ ] High n_terms remains responsive.

### References
- [ ] Text scrolls, selectable; formulas match calculator precision choice (if intended).
- [ ] Unicode characters render on Windows and Linux (φ, √, subscripts) or fallback to ASCII.

---

## 6) Suggested Additional Automated Tests
- `test_decimals_input_handling()` if decimals is user-editable (simulate invalid string).
- `test_golden_rectangle_ratios_hold()` validating remaining rectangle ratios ~ φ.
- `test_spiral_square_positions_small_n()` asserting known coordinates for first 4 squares (deterministic).
- `test_no_pyplot_import_side_effects()` ensure viz modules import without selecting GUI backend.
```