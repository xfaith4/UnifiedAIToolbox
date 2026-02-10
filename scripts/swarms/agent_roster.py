#!/usr/bin/env python3
"""
Canonical agent roster loader for UnifiedAIToolbox.

This module keeps agent loading logic in one place so runtime call paths can
consume either:
- full canonical objects (from `agent-library.json`)
- thin prompt roster objects (name/role/prompt)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional


def _toolbox_root() -> Path:
    # scripts/swarms/agent_roster.py -> repo root is two parents up
    return Path(__file__).resolve().parents[2]


def default_canonical_path() -> Path:
    return _toolbox_root() / "Orchestration" / "agents" / "agent-library.json"


def _load_agents(path: Path) -> List[Dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict) and isinstance(raw.get("Agents"), list):
        # Backward compatibility for legacy generated exports.
        return [item for item in raw["Agents"] if isinstance(item, dict)]
    raise ValueError(f"Unsupported agent registry format: {path}")


def _to_thin_roster(agents: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    thin: List[Dict[str, str]] = []
    for item in agents:
        name = str(item.get("name", "")).strip()
        prompt = str(item.get("prompt", "")).strip()
        if not name or not prompt:
            continue
        role = str(item.get("role", "")).strip() or "system"
        thin.append({"name": name, "role": role, "prompt": prompt})
    thin.sort(key=lambda a: a["name"].lower())
    return thin


def get_agent_roster(
    mode: Literal["full", "thin"] = "thin",
    canonical_path: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    path = canonical_path.resolve() if canonical_path else default_canonical_path()
    agents = _load_agents(path)
    if mode == "full":
        return agents
    return _to_thin_roster(agents)
