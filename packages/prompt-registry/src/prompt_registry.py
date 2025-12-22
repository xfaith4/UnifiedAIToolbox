"""
Core registry implementation for prompt specifications.

This module provides the main functionality for loading and managing prompts
from YAML files in the repository's prompts directory.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import yaml


@dataclass
class PromptSpec:
    """
    Represents a prompt specification loaded from a YAML file.
    
    Attributes:
        id: Unique identifier for the prompt (e.g., 'analytics.divisions.performance.summary')
        version: Semantic version of the prompt
        raw: The raw parsed YAML/dict data
        payload: UI-friendly payload representation
        path: Path to the source YAML file
    """
    id: str
    version: str
    raw: Dict[str, Any]
    payload: Dict[str, Any]
    path: Optional[Path] = None

    def to_ui_payload(self) -> Dict[str, Any]:
        """Return a UI-friendly representation of the prompt."""
        return self.payload


# Default prompts directory - relative to the packages directory
# Will be resolved at runtime based on the module location
def _get_prompts_dirs() -> List[Path]:
    """
    Get list of directories containing prompt YAML files.
    Searches multiple potential locations.
    """
    dirs: List[Path] = []
    
    # Get the package location and walk up to find repo root
    here = Path(__file__).resolve().parent
    
    # Look for prompts in various locations
    for parent in [here] + list(here.parents):
        # Common prompt locations
        candidates = [
            parent / "prompts",
            parent / "data" / "prompts",
            parent / "Orchestration" / "AI-Orchestration" / "prompts",
            parent / "Orchestration" / "UnifiedPromptApp" / "services" / "prompt-api" / "data",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_dir():
                dirs.append(candidate)
    
    return list(set(dirs))  # Remove duplicates


def _load_yaml_prompts(directory: Path) -> List[PromptSpec]:
    """
    Load all prompt YAML files from a directory.
    
    Args:
        directory: Directory containing prompt YAML files
        
    Returns:
        List of PromptSpec objects
    """
    prompts: List[PromptSpec] = []
    
    # Look for both .yaml and .yml files
    for pattern in ["*.yaml", "*.yml", "*.prompt.yaml", "*.prompt.yml"]:
        for yaml_file in directory.rglob(pattern):
            try:
                data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
                if not isinstance(data, dict):
                    continue
                
                prompt_id = data.get("id", yaml_file.stem)
                version = str(data.get("version", "0.0.0"))
                
                # Build the payload for UI consumption
                payload = {
                    "id": prompt_id,
                    "version": version,
                    "title": data.get("title", prompt_id),
                    "description": data.get("description", ""),
                    "category": data.get("category", ""),
                    "owner": data.get("owner", ""),
                    "prompt": data.get("blocks", {}),
                    "variables": data.get("variables", {}),
                    "tags": data.get("tags", []),
                    "template": data.get("template", ""),
                    "role": data.get("role", "system"),
                    "style": data.get("style", ""),
                    "integrations": data.get("integrations", {}),
                    "telemetry": data.get("telemetry", {}),
                }
                
                prompts.append(PromptSpec(
                    id=prompt_id,
                    version=version,
                    raw=data,
                    payload=payload,
                    path=yaml_file,
                ))
            except Exception as exc:
                # Log but continue - don't let one bad file break everything
                print(f"[prompt-registry] Warning: Failed to load {yaml_file}: {exc}")
                continue
    
    return prompts


def _load_json_prompts(json_file: Path) -> List[PromptSpec]:
    """
    Load prompts from a JSON file (e.g., prompt-library.json).
    
    Args:
        json_file: Path to the JSON file
        
    Returns:
        List of PromptSpec objects
    """
    prompts: List[PromptSpec] = []
    
    try:
        data = json.loads(json_file.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return prompts
            
        for item in data:
            if not isinstance(item, dict):
                continue
                
            prompt_id = item.get("id", "")
            if not prompt_id:
                continue
                
            version = str(item.get("version", "0.0.0"))
            raw = item.get("prompt") or item.get("blocks") or item
            
            prompts.append(PromptSpec(
                id=prompt_id,
                version=version,
                raw=raw,
                payload=item,
                path=json_file,
            ))
    except Exception as exc:
        print(f"[prompt-registry] Warning: Failed to load {json_file}: {exc}")
    
    return prompts


# Cache for loaded prompts
_prompts_cache: Optional[List[PromptSpec]] = None
_cache_dirs: Optional[List[Path]] = None


def _clear_cache() -> None:
    """Clear the prompts cache (useful for testing)."""
    global _prompts_cache, _cache_dirs
    _prompts_cache = None
    _cache_dirs = None


def list_prompts(force_reload: bool = False) -> List[PromptSpec]:
    """
    List all available prompts from the registry.
    
    Args:
        force_reload: If True, reload from disk even if cached
        
    Returns:
        List of all PromptSpec objects found in the prompts directories
    """
    global _prompts_cache, _cache_dirs
    
    dirs = _get_prompts_dirs()
    
    # Return cached if available and directories haven't changed
    if not force_reload and _prompts_cache is not None and _cache_dirs == dirs:
        return _prompts_cache
    
    all_prompts: Dict[str, PromptSpec] = {}  # Use dict to dedupe by ID
    
    for directory in dirs:
        # Load YAML prompts
        for prompt in _load_yaml_prompts(directory):
            # Later prompts override earlier ones with same ID
            all_prompts[prompt.id] = prompt
        
        # Also check for JSON prompt libraries
        for json_file in [
            directory / "prompt-library.json",
            directory / "prompts.json",
        ]:
            if json_file.exists():
                for prompt in _load_json_prompts(json_file):
                    all_prompts[prompt.id] = prompt
    
    _prompts_cache = list(all_prompts.values())
    _cache_dirs = dirs
    
    return _prompts_cache


def find_prompt_by_id(prompt_id: str) -> Optional[PromptSpec]:
    """
    Find a specific prompt by its ID.
    
    Args:
        prompt_id: The unique identifier of the prompt
        
    Returns:
        PromptSpec if found, None otherwise
    """
    for prompt in list_prompts():
        if prompt.id == prompt_id:
            return prompt
    return None


def load_prompt(path: Union[str, Path]) -> PromptSpec:
    """
    Load a single prompt from a YAML file.
    
    Args:
        path: Path to the YAML file
        
    Returns:
        PromptSpec for the loaded prompt
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        yaml.YAMLError: If the file is not valid YAML
    """
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Prompt file not found: {p}")
    
    data = yaml.safe_load(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Invalid prompt file format: {p}")
    
    prompt_id = data.get("id", p.stem)
    version = str(data.get("version", "0.0.0"))
    
    payload = {
        "id": prompt_id,
        "version": version,
        "title": data.get("title", prompt_id),
        "description": data.get("description", ""),
        "category": data.get("category", ""),
        "owner": data.get("owner", ""),
        "prompt": data.get("blocks", {}),
        "variables": data.get("variables", {}),
        "tags": data.get("tags", []),
        "template": data.get("template", ""),
        "role": data.get("role", "system"),
        "style": data.get("style", ""),
        "integrations": data.get("integrations", {}),
        "telemetry": data.get("telemetry", {}),
    }
    
    return PromptSpec(
        id=prompt_id,
        version=version,
        raw=data,
        payload=payload,
        path=p,
    )
