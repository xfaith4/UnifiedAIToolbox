```markdown
# Golden Ratio (φ) Explorer — Tech Stack & Packaging Plan

## 1) Requirements Recap (what drives the stack)
- **Offline-first:** app must run fully without internet access (no CDN assets, no remote APIs).
- **Cross-platform desktop:** Windows, macOS, Linux.
- **Simple 2D visuals:** golden rectangle subdivision + Fibonacci tiling/spiral (QPainter-class drawing is sufficient).
- **Small scope:** minimal persistence (optional local settings), no backend.

---

## 2) Selected Tech Stack (recommended)

### Language / Runtime
- **Python 3.11+**
  - Widely available on all target OSes.
  - Strong numerical support (built-in `math` is enough here).
  - Fast iteration for a small educational visualization tool.

### UI Toolkit
- **Qt 6 via PySide6**
  - Mature, native-looking widgets across platforms.
  - Excellent 2D rendering primitives (`QPainter`, antialiasing, transforms).
  - Designer tools optional; manual layouts fine.
  - Licensing: **PySide6 (LGPL)** is generally simpler for distribution than PyQt.

### Rendering Approach
- **Custom `QWidget` canvases rendered with `QPainter`**
  - Golden rectangle split: rectangles + labels + outlines.
  - Fibonacci spiral: square tiling + quarter-circle arcs.
  - Use `QPainter.setRenderHint(QPainter.Antialiasing, True)`.

This matches the architecture in `docs/ARCHITECTURE.md` and keeps the app fully offline with no web runtime.

---

## 3) Dependencies (minimal set)

### Required
- `PySide6` (Qt bindings)
- Python stdlib: `math`, `dataclasses`, `typing`

### Optional (nice-to-have)
- `platformdirs` (clean per-OS settings path)
- `pytest` (tests)
- `ruff` / `black` (lint/format)
- `mypy` (typing)

**No numpy required** for this scope.

---

## 4) Offline Constraints (explicit)
To ensure the app is truly offline:

1. **No network calls**
   - Do not fetch fonts, images, or reference content at runtime.
   - Do not embed webviews that load remote content.

2. **Bundle all assets**
   - Any icons, fonts (if used), and reference text must ship inside the app bundle.
   - Prefer Qt resources (`.qrc`) or package data included by the packager.

3. **Local-only persistence**
   - If saving settings, write to OS-appropriate local paths (no cloud sync).
   - Suggested: Qt `QSettings` or `platformdirs` + a small JSON file.

---

## 5) Packaging Approach (selected)
### Primary Packager: **PyInstaller**
PyInstaller is the recommended packaging tool for this project because:
- Works on **Windows/macOS/Linux**.
- Produces a **single-folder** or **single-file** distribution.
- Handles bundling Qt libraries reasonably well.
- Large ecosystem and common for PySide6 apps.

#### Output Targets
- **Windows:** `.exe` (one-folder or one-file) + optional installer (later).
- **macOS:** `.app` bundle.
- **Linux:** one-folder distribution; optionally wrap as AppImage later.

#### Key Rule: Build on each OS
PyInstaller is **not cross-compiling** in typical usage:
- Build Windows artifact on Windows
- Build macOS artifact on macOS
- Build Linux artifact on Linux

---

## 6) Cross-Platform Plan (build + release)
### Supported OS versions (suggested baseline)
- Windows 10/11 (x64)
- macOS 12+ (Intel + Apple Silicon if feasible; otherwise one first)
- Ubuntu LTS-like baseline (x64)

### CI Strategy (recommended)
Use GitHub Actions (or similar) with a **3-OS matrix**:
- `windows-latest`
- `macos-latest`
- `ubuntu-latest`

Each job:
1. Set up Python 3.11+
2. Install deps (pinned)
3. Run tests/lint (optional but recommended)
4. Run PyInstaller build
5. Upload artifacts

### Code signing / notarization (macOS)
- For personal/internal distribution: may skip initially.
- For public distribution: macOS Gatekeeper will require signing + notarization. Plan as a later milestone.

---

## 7) Packaging Details (PyInstaller notes)

### Recommended mode
- Start with **one-folder** builds for reliability and faster iteration.
- Consider one-file later if desired; one-file has slower startup and can be trickier with Qt.

### PyInstaller spec considerations for PySide6
- Ensure Qt plugins are included (platform plugins like `cocoa`, `windows`, `xcb`).
- Include any non-Python assets (icons, `.qrc` compiled resources, reference markdown/text).

### Version pinning
Pin versions to avoid “works on my machine” Qt bundling issues:
- Python: 3.11.x
- PySide6: a fixed minor version across OS builds (e.g., `~=6.6` or `~=6.7`), chosen after initial validation.
- PyInstaller: pinned (e.g., `~=6.3+`), validated with selected PySide6.

---

## 8) Alternatives Considered (and why not primary)

### Nuitka
- Pros: can produce fast binaries; sometimes smaller/faster startup.
- Cons: more complex builds; Qt integration can be more involved than PyInstaller for small projects.
- Status: viable later if PyInstaller results are unsatisfactory.

### Briefcase (BeeWare)
- Pros: “native app” packaging story.
- Cons: more opinionated structure; can be heavier for a simple Qt-based Python app; Qt is not its primary happy path.
- Status: not recommended for initial delivery.

### Electron/Tauri (web stack)
- Pros: good cross-platform packaging and distribution.
- Cons: heavier runtime, larger bundles; web canvas/SVG stack would require a different architecture.
- Status: not aligned with “small offline educational app” goals.

---

## 9) Final Decision Summary
- **Build:** Python 3.11 + **PySide6** (Qt 6)
- **Rendering:** `QPainter` on custom widgets (no webview)
- **Offline:** all content bundled; no network usage
- **Packaging:** **PyInstaller**, built separately on Windows/macOS/Linux
- **Cross-platform releases:** CI matrix producing per-OS artifacts; signing/notarization as a later enhancement
```