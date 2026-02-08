```diff
diff --git a/src/phi_explorer/phi_math.py b/src/phi_explorer/phi_math.py
index 1c2d3ab..7b9d1f4 100644
--- a/src/phi_explorer/phi_math.py
+++ b/src/phi_explorer/phi_math.py
@@ -1,86 +1,163 @@
-import math
+"""
+Math utilities and reference text for the Golden Ratio (φ) Explorer.
+
+This module centralizes:
+- Constants (φ and 1/φ)
+- Simple calculator helpers
+- Reference/identity strings used by the UI
+"""
+
+from __future__ import annotations
+
+import math
+from typing import Optional
 
-PHI = (1 + math.sqrt(5)) / 2
-INV_PHI = 1 / PHI
+PHI: float = (1.0 + math.sqrt(5.0)) / 2.0
+INV_PHI: float = 1.0 / PHI  # equals φ − 1
 
+_DEFAULT_DECIMALS = 10
+
+
+def _clamp_decimals(decimals: Optional[int]) -> int:
+    """Return a safe integer decimals value for formatting."""
+    if decimals is None:
+        return _DEFAULT_DECIMALS
+    try:
+        d = int(decimals)
+    except (TypeError, ValueError):
+        return _DEFAULT_DECIMALS
+    return max(0, min(30, d))
+
+
+def fmt(x: float, decimals: Optional[int] = None) -> str:
+    """Format a float with a fixed number of decimals (deterministic)."""
+    d = _clamp_decimals(decimals)
+    return f"{x:.{d}f}"
+
 
 def phi() -> float:
-    return PHI
+    """Return φ = (1 + √5) / 2."""
+    return PHI
 
 
 def inv_phi() -> float:
-    return INV_PHI
+    """Return 1/φ (also equals φ − 1)."""
+    return INV_PHI
 
 
-def calc_values(a: float) -> tuple[float, float]:
-    return a * PHI, a * INV_PHI
+def calc_values(a: float) -> tuple[float, float]:
+    """
+    Given A, return (A·φ, A/φ).
+
+    Note: A/φ is computed as A·(1/φ) for numerical stability and clarity;
+    mathematically, A·INV_PHI == A/PHI.
+    """
+    return a * PHI, a * INV_PHI
 
 
-def reference_text(decimals: int = 10) -> str:
-    phi_s = f"{PHI:.{decimals}f}"
-    inv_s = f"{INV_PHI:.{decimals}f}"
-    return (
-        f"φ ≈ {phi_s}\n"
-        f"1/φ ≈ {inv_s}\n"
-        "Continued fraction: [1; 1, 1, 1]\n"
-        "Identities:\n"
-        "  φ² = φ + 1\n"
-        "  1/φ = 1 - φ\n"
-        "  φ = 1 + 1/φ\n"
-    )
+def reference_text(decimals: Optional[int] = None) -> str:
+    """
+    Return quick reference text (continued fraction + identities).
+
+    The UI can re-render this when the user changes precision.
+    """
+    d = _clamp_decimals(decimals)
+    phi_s = fmt(PHI, d)
+    inv_s = fmt(INV_PHI, d)
+
+    # Keep formatting stable for tests and consistent across platforms.
+    return "\n".join(
+        [
+            f"φ ≈ {phi_s}",
+            f"1/φ ≈ {inv_s}",
+            "",
+            "Continued fraction:",
+            "  φ = [1; 1, 1, 1, …]",
+            "",
+            "Key identities:",
+            "  φ = (1 + √5) / 2",
+            "  φ² = φ + 1",
+            "  1/φ = φ − 1",
+            "  φ = 1 + 1/φ",
+        ]
+    )
+
+
+def identity_lines(decimals: Optional[int] = None) -> list[str]:
+    """Return identities as individual lines (useful for UI list rendering)."""
+    d = _clamp_decimals(decimals)
+    return [
+        f"φ ≈ {fmt(PHI, d)}",
+        f"1/φ ≈ {fmt(INV_PHI, d)}",
+        "φ = (1 + √5) / 2",
+        "φ² = φ + 1",
+        "1/φ = φ − 1",
+        "φ = 1 + 1/φ",
+        "φ − 1 = 1/φ",
+    ]
```