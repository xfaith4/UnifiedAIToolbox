"""
MCP server registry helpers.

Provides a simple, file-backed registry for MCP server definitions so
orchestration agents can consistently discover and reuse MCP resources.
"""
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from ..config import settings
from ..models import MCPRegistry, MCPServer
from .files import read_json_file, write_json_file


def _normalize_path(path: Optional[Path] = None) -> Path:
    """Resolve registry path, defaulting to configured location."""
    registry_path = Path(path or settings.mcp_registry_path).expanduser().resolve()
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    return registry_path


def _registry_from_data(data: dict) -> MCPRegistry:
    """Parse registry payload into a model with forward compatibility."""
    if hasattr(MCPRegistry, "model_validate"):
        return MCPRegistry.model_validate(data)  # type: ignore[attr-defined]
    return MCPRegistry.parse_obj(data)


def _registry_to_dict(registry: MCPRegistry) -> dict:
    """Serialize a registry to a plain dictionary."""
    if hasattr(registry, "model_dump"):
        # Use mode='json' to properly serialize Pydantic types like AnyUrl
        return registry.model_dump(mode='json')  # type: ignore[attr-defined]
    # Fallback for Pydantic v1
    return registry.dict()  # type: ignore[attr-defined]


def load_registry(path: Optional[Path] = None, allow_missing: bool = True) -> MCPRegistry:
    """
    Load the MCP registry from disk.

    Args:
        path: Optional override path to the registry file.
        allow_missing: When True, return an empty registry if the file does not exist.
    """
    registry_path = _normalize_path(path)
    if not registry_path.exists():
        if allow_missing:
            return MCPRegistry(metadata={"source": str(registry_path)}, servers=[])
        raise FileNotFoundError(f"MCP registry not found at {registry_path}")

    data = read_json_file(registry_path)
    registry = _registry_from_data(data)
    registry.metadata.setdefault("source", str(registry_path))
    return registry


def save_registry(registry: MCPRegistry, path: Optional[Path] = None) -> Path:
    """Persist an MCP registry to disk."""
    registry_path = _normalize_path(path)
    write_json_file(_registry_to_dict(registry), registry_path)
    return registry_path


def resolve_servers(
    path: Optional[Path] = None,
    tags: Optional[Sequence[str]] = None,
    capabilities: Optional[Sequence[str]] = None,
) -> List[MCPServer]:
    """
    Load registry and filter servers by tags/capabilities.
    """
    registry = load_registry(path=path)
    return registry.filter(
        tags=list(tags) if tags else None,
        capabilities=list(capabilities) if capabilities else None,
    )


def upsert_server(server: MCPServer, path: Optional[Path] = None) -> MCPRegistry:
    """
    Add or replace a server in the registry and persist changes.
    """
    registry = load_registry(path=path, allow_missing=True)
    updated: List[MCPServer] = []
    replaced = False
    for existing in registry.servers:
        if existing.id == server.id:
            updated.append(server)
            replaced = True
        else:
            updated.append(existing)
    if not replaced:
        updated.append(server)

    registry.servers = updated
    save_registry(registry, path=path)
    return registry
