import json
import sys
from pathlib import Path

import pytest

# Make src importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import MCPRegistry, MCPServer  # noqa: E402
from src.utils.mcp_registry import (  # noqa: E402
    load_registry,
    resolve_servers,
    upsert_server,
)


def _write_registry(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_loads_registry_from_disk(tmp_path: Path) -> None:
    registry_path = tmp_path / "servers.json"
    _write_registry(
        registry_path,
        {
            "servers": [
                {
                    "id": "demo",
                    "name": "Demo Server",
                    "url": "http://localhost:9000/mcp",
                    "transport": "sse",
                    "tags": ["default"],
                    "capabilities": ["search"],
                    "status": "available",
                    "auth": {"type": "none"},
                }
            ]
        },
    )

    registry = load_registry(registry_path, allow_missing=False)
    assert isinstance(registry, MCPRegistry)
    assert registry.servers[0].id == "demo"
    assert registry.servers[0].capabilities == ["search"]


def test_filters_by_tags_and_capabilities(tmp_path: Path) -> None:
    registry_path = tmp_path / "servers.json"
    _write_registry(
        registry_path,
        {
            "servers": [
                {
                    "id": "search-prod",
                    "name": "Search",
                    "url": "http://localhost:9100/mcp",
                    "transport": "sse",
                    "tags": ["prod", "default"],
                    "capabilities": ["search", "index"],
                    "auth": {"type": "none"},
                },
                {
                    "id": "sandbox-browser",
                    "name": "Sandbox Browser",
                    "url": "http://localhost:9200/mcp",
                    "transport": "sse",
                    "tags": ["sandbox"],
                    "capabilities": ["browser-automation"],
                    "auth": {"type": "none"},
                },
            ]
        },
    )

    servers = resolve_servers(
        path=registry_path, tags=["prod"], capabilities=["search"]
    )
    assert len(servers) == 1
    assert servers[0].id == "search-prod"


def test_upsert_persists_changes(tmp_path: Path) -> None:
    registry_path = tmp_path / "servers.json"

    first = MCPServer(
        id="fs",
        name="FS",
        url="http://localhost:9300/mcp",
        transport="sse",
        tags=["default"],
        capabilities=["filesystem"],
        auth={"type": "none"},  # type: ignore[arg-type]
    )

    updated = MCPServer(
        id="fs",
        name="FS",
        url="http://localhost:9300/mcp",
        transport="sse",
        tags=["default", "local"],
        capabilities=["filesystem", "search"],
        description="updated",
        auth={"type": "none"},  # type: ignore[arg-type]
    )

    after_first = upsert_server(first, path=registry_path)
    assert after_first.get("fs") is not None

    after_update = upsert_server(updated, path=registry_path)
    loaded = load_registry(registry_path)

    assert len(after_update.servers) == 1
    assert loaded.get("fs").description == "updated"
    assert "local" in loaded.get("fs").tags
