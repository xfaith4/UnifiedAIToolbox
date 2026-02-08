```markdown
# Golden Ratio (φ) Explorer

A small, fully offline desktop app for exploring the Golden Ratio **φ** (phi ≈ 1.6180339887…) via:
- A φ calculator (given **A**, compute **A·φ** and **A/φ**)
- A **golden rectangle** subdivision (recursive square removal) visualization
- A **Fibonacci (φ-approximating) spiral** visualization
- A built-in quick reference (continued fraction, identities, key values)

Built with **Python + Tkinter + Matplotlib**. No internet required.

---

## Features (What you can do)

### 1) φ Calculator
Enter a base length **A** and view:
- **φ** = (1 + √5) / 2  
- **B = A·φ**
- **C = A/φ**
- Optional ratio checks (e.g., B/A ≈ φ)

Includes basic input validation (non-numeric values show an error).

### 2) Golden Rectangle Split Visualization
Draws a golden rectangle (side ratio φ) and recursively subdivides it by:
- removing the largest possible square,
- leaving a smaller golden rectangle,
- repeating for **n** iterations.

The plot uses equal aspect ratio to keep geometry undistorted.

### 3) Fibonacci Spiral Visualization (Approximation to φ)
Builds adjacent squares with side lengths proportional to Fibonacci numbers (scaled by **A**) and draws quarter-circle arcs inside each square to form the classic spiral-like curve.

Also reinforces the relationship:
- **F(n+1) / F(n) → φ** as n increases.

### 4) Quick Reference
A scrollable panel containing:
- φ definition and decimal expansion
- continued fraction form: **[1; 1, 1, 1, …]**
- key identities (e.g., φ² = φ + 1, 1/φ = φ − 1)
- Fibonacci connection

---

## Requirements

- **Python 3.10+** (Python 3.11 recommended)
- **Tkinter** (usually included with standard Python installs)
- **Matplotlib** (the only non-stdlib dependency)

No network access is used or required.

---

## Install

### 1) Get the code
Clone or download this repository, then open a terminal in the project folder.

### 2) (Recommended) Create a virtual environment

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows (PowerShell)**
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3) Install dependencies
```bash
pip install matplotlib
```

If you have multiple Python versions installed, prefer:
```bash
python -m pip install matplotlib
```

---

## Run

From the project root (where `app.py` is located):

```bash
python app.py
```

On some systems you may need:
```bash
python3 app.py
```

The application opens as a single window with multiple tabs.

---

## How to Use (Tabs)

### Calculator
1. Enter a numeric value for **A** (e.g., `1`, `2.5`, `100`).
2. Click **Compute** (or the app may update automatically, depending on implementation).
3. Read:
   - **A·φ** (golden expansion)
   - **A/φ** (golden contraction)

### Golden Rectangle Split
1. Set base length **A** and iteration count **n** (typical range 1–12).
2. The plot redraws a golden rectangle and its recursive square-removal subdivisions.

Tips:
- Higher **n** shows more steps but can get visually dense.
- Geometry is drawn with equal scaling to avoid distortion.

### Fibonacci Spiral
1. Choose number of squares **n** (e.g., 6–12 is a good visual range).
2. The plot draws Fibonacci-sized squares and quarter-circle arcs forming a spiral trend.

Notes:
- This is the classic Fibonacci spiral construction (an approximation to a true logarithmic golden spiral).

### Quick Reference
Scroll to view:
- φ formula and decimal
- continued fraction representation
- common identities and Fibonacci limit relationship

---

## Offline / Privacy

This app is designed to be **fully offline**:
- No HTTP requests
- No telemetry or analytics
- No auto-updaters
- All math and rendering are done locally

---

## Troubleshooting

### “ModuleNotFoundError: No module named 'matplotlib'”
Install Matplotlib into the environment you are running:
```bash
python -m pip install matplotlib
```

### Tkinter not found (Linux)
Some distros split Tkinter into a separate package. Example (Debian/Ubuntu):
```bash
sudo apt-get install python3-tk
```

### Plot looks stretched
The geometry tabs should use equal aspect ratio. If it still looks off, try resizing the window; the plots will reflow.

---

## Project Notes (Developer-facing, brief)
- GUI: Tkinter (`ttk.Notebook` tabs)
- Plots: Matplotlib embedded via `FigureCanvasTkAgg`
- φ is computed as: `phi = (1 + sqrt(5)) / 2`
- Fibonacci numbers are generated iteratively (no recursion)

---

## License
See repository license (if provided).
```