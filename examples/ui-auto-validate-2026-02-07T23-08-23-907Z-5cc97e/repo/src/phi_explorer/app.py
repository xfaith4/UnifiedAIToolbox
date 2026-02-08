```diff
diff --git a/src/phi_explorer/app.py b/src/phi_explorer/app.py
new file mode 100644
index 0000000..6c3a7f4
--- /dev/null
+++ b/src/phi_explorer/app.py
@@ -0,0 +1,40 @@
+# src/phi_explorer/app.py
+from __future__ import annotations
+
+"""
+Convenience runner for the Golden Ratio (φ) Explorer.
+
+- Supports a console script entrypoint (e.g. `phi-explorer`)
+- Keeps `python -m phi_explorer` working by delegating to the existing module
+  entrypoint implementation in `phi_explorer.__main__`.
+"""
+
+import runpy
+
+
+def main() -> None:
+    """
+    Launch the desktop UI.
+
+    We intentionally delegate to `phi_explorer.__main__` so there is a single
+    source of truth for environment setup (offline-friendly Matplotlib backend,
+    Tk defaults, etc.) and UI wiring.
+    """
+
+    # Equivalent to: python -m phi_explorer
+    runpy.run_module("phi_explorer.__main__", run_name="__main__")
+
+
+if __name__ == "__main__":
+    main()
diff --git a/pyproject.toml b/pyproject.toml
index 5e2a1e8..cf1bb9f 100644
--- a/pyproject.toml
+++ b/pyproject.toml
@@ -1,3 +1,13 @@
+[project.scripts]
+# Console entrypoint: after installation users can run:
+#   phi-explorer
+phi-explorer = "phi_explorer.app:main"
+
```

Notes:
- If your repository uses `setup.cfg` instead of `pyproject.toml`, the equivalent would be:
  - `console_scripts = phi-explorer = phi_explorer.app:main`
- No changes were needed to `src/phi_explorer/__main__.py`; the new runner simply reuses it.