```markdown
# Changelog

## MVP (Unreleased)

### Added
- Offline desktop **Golden Ratio (φ) Explorer** with tabbed UI:
  - **Calculator**: compute `A·φ` and `A/φ` (=`A·(1/φ)`).
  - **Golden Rectangle**: classic golden-rectangle subdivision visualization (remove largest square each step).
  - **Fibonacci Spiral**: Fibonacci square tiling with quarter-circle arcs (φ approximation).
  - **References**: quick reference text (continued fraction + core identities).
- Centralized φ math utilities:
  - Constants `PHI`, `INV_PHI`, formatting helpers, continued fraction terms, Fibonacci ratio approximation, and identity/reference text generation.

### Changed
- UI polish and controls:
  - Precision selection (decimals) and line width controls.
  - Shared status messaging and safer redraw behavior (debounced resize).
  - Consistent “A is the short side” convention and consistent units messaging.

### Fixed
- Input validation and edge cases:
  - Defensive handling for invalid/non-finite inputs and `A <= 0` (no crashes; shows guidance).
- Golden rectangle rendering:
  - Correct subdivision logic by orientation, accurate labels, stable scaling and **locked aspect** so squares render correctly.
- Spiral rendering:
  - Correct square tiling (no gaps/overlaps) and correct arc quadrants using patch-based arcs.
  - Improved performance via geometry caching and patch collections.

### Quality
- Automated tests:
  - Unit tests for φ identities, helpers, continued fraction, Fibonacci ratio convergence, and deterministic reference formatting.
  - Headless smoke tests for visualization modules (import + render without a GUI backend).
```