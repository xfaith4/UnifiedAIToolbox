README.txt

Phi Web App (φ Explorer) — Project Explanation & Run Instructions
===============================================================

Overview
--------
This is a small, static web application that illustrates the number φ (phi), also called the golden ratio:

  φ = (1 + √5) / 2 ≈ 1.618033988749...

The app focuses on two complementary perspectives:

1) Geometry / visualization
   - A golden-rectangle tiling (recursive subdivision) that visually encodes φ through repeated proportional scaling.
   - Optional spiral overlay (golden spiral approximation) to show how the tiling suggests a spiral curve.

2) Numerical convergence
   - Continued fraction convergents of φ, showing how repeated 1’s in the continued fraction produce increasingly accurate rational approximations.
   - Fibonacci ratios F(n+1)/F(n), demonstrating classic convergence toward φ.

Everything is designed to run as static files (no build step required).


Repository Layout
-----------------
phi-web-app/
  index.html
  README.txt
  assets/               (optional; may be empty)
  public/
    favicon.svg         (optional; if present, the page may reference it)


How to Run
----------
There is no installation step and no dependencies required.

Option A: Open directly (offline-friendly)
1) Open index.html in a modern browser (Chrome, Edge, Firefox, Safari).
2) Interact with the controls to change depth, toggle spiral/labels, and explore convergence panels.

Option B: Run a lightweight local server (recommended)
Running via a local server avoids some browser security restrictions and makes sizing/asset loading more consistent.

Using Python (commonly available)
1) Open a terminal in the phi-web-app folder.
2) Run:
   python -m http.server 5173
3) Open in your browser:
   http://localhost:5173

If your system maps python to Python 2, use:
   python3 -m http.server 5173

Optional alternative: Node (without adding project dependencies)
1) Open a terminal in the phi-web-app folder.
2) Run:
   npx serve .
3) Open the URL printed by the command.


What to Look For (Conceptual Guide)
-----------------------------------
Golden ratio as a constant:
- φ is the positive solution to x² = x + 1.
- It has the distinctive property that scaling and subdivision repeat the same proportion.

Geometry view:
- A golden rectangle can be subdivided into a square and a smaller golden rectangle.
- Repeating that subdivision generates a tiling whose rectangle aspect ratio stays close to φ.
- Drawing quarter-circle arcs in the successive squares produces a spiral-like curve.

Numerical view:
- Continued fraction:
    φ = 1 + 1/(1 + 1/(1 + 1/(...)))
  Truncating this yields rational approximations p/q (convergents) that get closer to φ as depth increases.
- Fibonacci ratios:
    1/1, 2/1, 3/2, 5/3, 8/5, ...
  The ratio F(n+1)/F(n) approaches φ as n grows.

Errors:
- Absolute error: |approx − φ|
- Relative error: |approx − φ| / |φ|


Controls (typical)
------------------
Depending on the exact page markup, you may see controls such as:
- Depth: recursion level for the tiling
- Ratio mode: lock to φ or allow a custom ratio for comparison
- Ratio: custom aspect ratio (when enabled)
- Show spiral: toggle spiral overlay
- Show labels: toggle measurement/annotation labels
- Continued fraction depth (k): number of terms used in the convergent
- Fibonacci count (n): how many Fibonacci ratio rows to show

The app may also persist your last-used settings in local storage so the next reload keeps your preferences.


Troubleshooting
---------------
- Blank page or missing drawing:
  Try running via the local server option (Option B) instead of opening the file directly.
- Very large depth feels slow:
  Reduce tiling depth; recursion increases draw operations.
- Canvas looks blurry:
  Zoom back to 100% or resize the window; some renderers re-rasterize on resize.

Publishing / Hosting
--------------------
This project is static. You can host the folder on any static site service (GitHub Pages, Netlify, etc.) by uploading the files as-is.

Maintenance Notes
-----------------
- Keeping everything self-contained (or using simple relative paths) makes the project easy to host.
- No package.json or build tooling is required.