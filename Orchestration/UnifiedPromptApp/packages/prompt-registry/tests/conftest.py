"""
Pytest configuration for the prompt registry package.

Ensures the `prompt_registry` package can be imported without requiring an
editable install by appending `src/` to PYTHONPATH at test collection time.
"""

from __future__ import annotations

import sys
from pathlib import Path

SRC_ROOT = Path(__file__).resolve().parents[1] / "src"
SRC_ROOT_STR = str(SRC_ROOT)

if SRC_ROOT_STR not in sys.path:
    sys.path.insert(0, SRC_ROOT_STR)
