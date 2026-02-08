```python
"""
phi_explorer package.

This module exposes package metadata (version) and a few commonly used
entrypoints/utilities at the top level for convenience.
"""

from __future__ import annotations

from importlib import metadata as _metadata

# Resolve the installed distribution version when available (normal installs).
# Fall back to the dev/default version for editable/uninstalled contexts.
try:
    __version__ = _metadata.version("golden-ratio-explorer")
except _metadata.PackageNotFoundError:  # pragma: no cover
    __version__ = "0.1.0"

# Convenience re-exports (kept lightweight; no UI side-effects on import).
from .app import main as main
from .core.phi_math import compute_phi_relations as compute_phi_relations
from .core.phi_math import phi as phi

__all__ = [
    "__version__",
    "main",
    "phi",
    "compute_phi_relations",
]
```