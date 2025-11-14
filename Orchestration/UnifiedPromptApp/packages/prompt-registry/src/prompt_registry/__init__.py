"""
Prompt Registry core helpers.

This module exposes lightweight utilities to make the canonical YAML prompts from
`packages/prompt-registry/prompts` easy to load, validate, and transform into the
simplified JSON payload used by the Prompt Hub UI and Prompt API.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
PROMPT_ROOT = PACKAGE_ROOT / "prompts"
SCHEMA_ROOT = PACKAGE_ROOT / "schemas"


@dataclass
class PromptSpec:
    """Strongly typed representation of the canonical prompt definition."""

    id: str
    version: str
    path: Path
    raw: Dict[str, Any]

    def to_ui_payload(self) -> Dict[str, Any]:
        """Return the simplified JSON contract consumed by the Prompt Hub UI."""

        blocks = self.raw.get("blocks", {})
        variables = self.raw.get("variables", {}) or {}
        telemetry = self.raw.get("telemetry", {})
        integrations = (self.raw.get("integrations") or {}).get("ui", {})

        def format_block(block: Any) -> List[str] | str:
            if block is None:
                return ""
            if isinstance(block, str):
                return block
            if isinstance(block, list):
                return block
            return json.dumps(block, ensure_ascii=False)

        return {
            "id": self.id,
            "title": integrations.get("title") or self.raw.get("title", self.id.split(".")[-1].replace("_", " ").title()),
            "category": integrations.get("category") or self.raw.get("category"),
            "context": integrations.get("context") or self.raw.get("context"),
            "prompt": {
                "system": format_block(blocks.get("system")),
                "instructions": format_block(blocks.get("instructions")),
                "constraints": format_block(blocks.get("constraints")),
                "style": format_block(blocks.get("style")),
                "examples": blocks.get("examples", []),
            },
            "variables": [
                {
                    "name": name,
                    **({k: v for k, v in (definition or {}).items()}),
                }
                for name, definition in variables.items()
            ],
            "tags": telemetry.get("tags") or [],
            "models": self.raw.get("models") or {},
            "outputs": self.raw.get("outputs") or {},
            "version": self.version,
        }


def iter_prompt_files(root: Path = PROMPT_ROOT) -> Iterable[Path]:
    """Yield every YAML prompt file under the given root."""

    for path in sorted(root.rglob("*.yaml")):
        if path.name.endswith(".prompt.yaml") or ".prompt." in path.name or path.name.endswith(".policy.yaml"):
            yield path


def load_prompt(path: Path) -> PromptSpec:
    """Load a canonical prompt YAML file into a PromptSpec."""

    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)

    prompt_id = data.get("id") or path.stem
    version = str(data.get("version", "0.0.0"))
    return PromptSpec(id=prompt_id, version=version, path=path, raw=data)


def find_prompt_by_id(prompt_id: str, root: Path = PROMPT_ROOT) -> Optional[PromptSpec]:
    """Search for a prompt file by its semantic ID."""

    for path in iter_prompt_files(root):
        spec = load_prompt(path)
        if spec.id == prompt_id:
            return spec
    return None


def list_prompts() -> List[PromptSpec]:
    """Return all prompt specs in the registry."""

    return [load_prompt(path) for path in iter_prompt_files()]


__all__ = [
    "PromptSpec",
    "PROMPT_ROOT",
    "SCHEMA_ROOT",
    "find_prompt_by_id",
    "iter_prompt_files",
    "list_prompts",
    "load_prompt",
]
