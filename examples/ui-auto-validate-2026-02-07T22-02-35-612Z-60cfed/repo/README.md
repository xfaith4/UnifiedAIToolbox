```md
# Golden Ratio (φ) Explorer

An offline desktop app for exploring the golden ratio **φ** (phi, ≈ **1.6180339887…**) through interactive calculation and classic geometric visuals.

## What it does

- **φ Calculator**
  - Enter a base length **A**
  - See **A·φ** and **A/φ**
  - Precision control (3 / 6 / 10 / 15 decimals)
  - Identity check: **1/φ = φ − 1** (shown numerically)

- **Golden rectangle split visualization**
  - Repeatedly splits a golden rectangle into a square + remainder rectangle
  - Adjustable step count, orientation, turning direction
  - Optional labels/outlines and theme controls

- **Fibonacci (≈ φ) spiral visualization**
  - Generates Fibonacci-sized squares and draws the classic spiral arcs
  - Adjustable square count, direction, arc mode (quarter arcs vs smooth)

- **Quick references**
  - Continued fraction form
  - Common identities
  - Approximations/decimal expansion
  - Copy-to-clipboard for reference sections

## Offline / privacy

Designed to run fully offline. No analytics and no network access is required for normal use.

---

## Getting started (choose one runtime)

This repository contains **two possible app runtimes**:

1. **Python + PySide6** (runs with `python -m app`) — scripts are already defined in `pyproject.toml` and `package.json`.
2. **Electron + React/TypeScript** (see `src/main` and `src/renderer`) — packaging config exists via `electron-builder.json`.

Use whichever path matches your project setup.

---

## Option A: Run with Python (PySide6)

### Requirements
- **Python 3.11+**

### Setup & run
```bash
python -m venv .venv

# macOS/Linux
source .venv/bin/activate
# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -e ".[dev]"
python -m app
```

### Useful dev commands
```bash
pytest -q
ruff check .
ruff format .
mypy .
```

You can also run the same commands through npm (if you have Node installed) because this repo includes a helper `package.json`:

```bash
npm run run
npm run test
npm run lint
npm run format
npm run typecheck
```

---

## Option B: Run with Electron (React + TypeScript)

### Requirements
- **Node.js** (LTS recommended)
- A package manager (`npm` is fine)

### Install & run (typical)
Because Electron setups vary slightly between templates, use the scripts in this repo (if present) or the conventional flow:

```bash
npm install
npm run dev
```

If your environment uses Vite, the main process looks for:
- `VITE_DEV_SERVER_URL` **or**
- `ELECTRON_RENDERER_URL`

to load the renderer in development.

If you don’t have dev scripts wired up yet, you can still build the renderer and then run Electron pointing at the built `index.html` (see build section below).

---

## Building distributables

### Build (Python → PyInstaller)

> Build on each target OS (Windows/macOS/Linux) to produce native artifacts.

```bash
pip install -e ".[dev]"

# One-file executable
pyinstaller --noconfirm --clean --name GoldenRatioExplorer --windowed --onefile app/__main__.py

# Or folder-based build
pyinstaller --noconfirm --clean --name GoldenRatioExplorer --windowed app/__main__.py
```

Helper scripts exist as well:
```bash
npm run build       # onefile
npm run build:dir   # one-folder
```

Artifacts appear in `dist/` (PyInstaller output directory).

---

### Build (Electron → electron-builder)

This repo includes `electron-builder.json` configured to output to `release/` and bundle `dist/` as extra resources.

Typical flow:

```bash
npm install
npm run build      # build renderer/main (script name depends on your setup)
npm run dist       # run electron-builder (script name depends on your setup)
```

Notes:
- The Electron main process expects a packaged renderer at:
  `dist/renderer/index.html`
- `electron-builder.json` produces platform-specific artifacts:
  - macOS: `dmg`, `zip`
  - Windows: `nsis`
  - Linux: `AppImage`, `deb`, `tar.gz`

If your scripts are not yet defined, you can invoke electron-builder directly (once installed):
```bash
npx electron-builder --config electron-builder.json
```

---

## Project structure (high level)

- `src/main/` — Electron main process (IPC endpoints like `phi:calc`)
- `src/renderer/` — React UI (calculator + visuals + references)
- `app/` — Python entry point for the PySide6 version (`python -m app`)
- `assets/` — icons and packaging resources
- `electron-builder.json` — Electron packaging config
- `pyproject.toml` — Python dependencies + dev tooling

---

## Troubleshooting

### “Nothing shows up” (Electron)
- In dev, ensure `VITE_DEV_SERVER_URL` or `ELECTRON_RENDERER_URL` is set by your dev server script.
- In production, ensure the built file exists at `dist/renderer/index.html`.

### Python import / module errors
- Confirm venv is active.
- Reinstall editable dependencies:
  ```bash
  pip install -e ".[dev]"
  ```

### Lint/typecheck failures
- Format first:
  ```bash
  ruff format .
  ```
- Then lint:
  ```bash
  ruff check .
  ```

---

## License

MIT. See `LICENSE` (or the license header in `pyproject.toml` / `package.json`).
```