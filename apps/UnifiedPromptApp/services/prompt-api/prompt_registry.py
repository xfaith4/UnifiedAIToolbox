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
import importlib.util
from typing import Any, Dict, List, Optional, Union


def _find_registry_src() -> Optional[Path]:
    """Walk upward from this file to find packages/prompt-registry/src."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "prompt-registry" / "src"
        if candidate.exists():
            return candidate
    return None


def _load_real_registry(src_path: Path):
    """
    Load the real prompt_registry module directly from file to avoid
    self-import issues (since this shim file is named prompt_registry.py).
    """
    # Load the real prompt_registry.py from the package's src directory
    real_module_path = src_path / "prompt_registry.py"
    if not real_module_path.exists():
        return None

    # Use a unique module name to avoid collision with this shim
    module_name = "prompt_registry_real"

    spec = importlib.util.spec_from_file_location(
        module_name,
        real_module_path,
    )
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)

    # Register in sys.modules BEFORE exec_module - required for dataclass decorator
    sys.modules[module_name] = module
    
    try:
        spec.loader.exec_module(module)
        return module
    except Exception:
        # Clean up on failure
        sys.modules.pop(module_name, None)
        raise


# Try to find and load the real package.
_registry_src = _find_registry_src()
_real_imported = False
_real = None

if _registry_src is not None:
    try:
        _real = _load_real_registry(_registry_src)
        if _real is not None:
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
                        item_id = item.get("id", "")
                        return PromptSpec(
                            id=item_id,
                            version=item.get("version", "0.0.0"),
                            raw=raw,
                            payload=item,
                            path=data_file,
                        )
        except Exception:
            # swallow errors - we are a fallback only
            pass
        return None

    def load_prompt(path: Union[str, Path]) -> PromptSpec:
        """
        Load a prompt YAML file (used by tests that create temporary prompt files).
        Returns a PromptSpec-like object.
        """
        p = Path(path)
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
        prompt_id = data.get("id", "")
        prompt_version = data.get("version", "0.0.0")
        payload = {
            "id": prompt_id,
            "version": prompt_version,
            "prompt": data.get("blocks") or {},
            "variables": data.get("variables", {}),
        }
        return PromptSpec(id=prompt_id, version=prompt_version, raw=data, payload=payload, path=p)

    def list_prompts() -> List[PromptSpec]:
        """
        Fallback: return an empty list since we can't find the real registry.
        """
        return []

    __all__ = ["PromptSpec", "find_prompt_by_id", "load_prompt", "list_prompts"]
