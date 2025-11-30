"""
Lightweight shim for the in-repo `prompt_registry` package.

This module attempts to:
  1) locate and add `packages/prompt-registry/src` to sys.path (so the real package
     can be imported when running tests from the repo root or other working dirs), and
  2) if the real package is not present, provide minimal fallback implementations
     for the functions the prompt-api tests expect (find_prompt_by_id, load_prompt, PromptSpec).

This file is intentionally small and defensive so test collection does not fail
when optional dev packages are not installed in CI.
"""
from __future__ import annotations

import sys
from pathlib import Path
import importlib
from typing import Any, Dict, Optional


def _ensure_local_registry_on_path() -> bool:
    # Walk upward from this file and try to find packages/prompt-registry/src
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "prompt-registry" / "src"
        if candidate.exists():
            # Put the registry src directory first on sys.path so it shadows other installs.
            sys.path.insert(0, str(candidate))
            return True
    return False


# Try to make the in-repo package importable.
_found_real_pkg = _ensure_local_registry_on_path()

# Only try importing the real package if we found it on the path.
# Importing unconditionally would cause a self-referential import since this file
# is named prompt_registry.py.
_real_imported = False
if _found_real_pkg:
    try:
        # Prefer the real package if it's available.
        # Use importlib to avoid self-import issues.
        _real = importlib.import_module("prompt_registry")
        # Re-export the real package's public API surface used by tests.
        PromptSpec = getattr(_real, "PromptSpec", None)
        find_prompt_by_id = getattr(_real, "find_prompt_by_id", None)
        load_prompt = getattr(_real, "load_prompt", None)
        list_prompts = getattr(_real, "list_prompts", None)
        if PromptSpec is not None and find_prompt_by_id is not None:
            _real_imported = True
    except Exception:
        pass

if not _real_imported:
    # Minimal fallback implementations used only when the real package can't be imported.
    # These provide the small surface area the tests rely on: PromptSpec, find_prompt_by_id, load_prompt.
    from dataclasses import dataclass
    import yaml
    import json

    @dataclass
    class PromptSpec:
        id: str
        version: str
        raw: Dict[str, Any]
        payload: Dict[str, Any]
        path: Optional[Path] = None

        def to_ui_payload(self) -> Dict[str, Any]:
            return self.payload

    def find_prompt_by_id(prompt_id: str) -> Optional[PromptSpec]:
        """
        Best-effort: look for a synced prompt file under the prompt-api data directory
        (data/prompt-library.json) and return a PromptSpec if present.
        Otherwise return None so callers can fallback further.
        """
        try:
            # Attempt to find data/prompt-library.json relative to this service directory.
            svc_dir = Path(__file__).resolve().parent
            data_file = svc_dir / "data" / "prompt-library.json"
            if data_file.exists():
                items = json.loads(data_file.read_text(encoding="utf-8"))
                for item in items:
                    if item.get("id") == prompt_id:
                        raw = item.get("prompt") or item
                        return PromptSpec(
                            id=item.get("id"),
                            version=item.get("version", "0.0.0"),
                            raw=raw,
                            payload=item,
                            path=data_file,
                        )
        except Exception:
            # swallow errors - we are a fallback only
            pass
        return None

    def load_prompt(path: str | Path) -> PromptSpec:
        """
        Load a prompt YAML file (used by tests that create temporary prompt files).
        Returns a PromptSpec-like object.
        """
        p = Path(path)
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
        payload = {
            "id": data.get("id"),
            "version": data.get("version", "0.0.0"),
            "prompt": data.get("blocks") or {},
            "variables": data.get("variables", {}),
        }
        return PromptSpec(id=data.get("id"), version=data.get("version", "0.0.0"), raw=data, payload=payload, path=p)

    __all__ = ["PromptSpec", "find_prompt_by_id", "load_prompt"]
