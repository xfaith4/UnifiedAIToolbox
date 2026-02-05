# MCP Registry Ingestion

Purpose: Describe how MCP server catalogs are refreshed from upstream registries.

## Overview
Registry ingestion fetches MCP server definitions from upstream sources and merges them into the local catalog:
- Automatic discovery
- Cached fallback when upstream is unavailable
- Incremental upserts (no full wipes)

## Configuration
```bash
BRIDGE_MCP_REGISTRY_PATH=./data/mcp/servers.json
BRIDGE_MCP_REGISTRY_URL=https://registry.modelcontextprotocol.io/v1/servers
BRIDGE_MCP_REGISTRY_CACHE_PATH=./data/mcp/registry_cache.json
BRIDGE_MCP_REFRESH_INTERVAL_HOURS=24
BRIDGE_MCP_FETCH_TIMEOUT=30
BRIDGE_MCP_ENABLE_GITHUB_SOURCE=false
```

## Manual refresh
```bash
cd apps/orchestration-bridge
python bridge.py refresh-registry
```

## Normalization
Ingestion normalizes upstream fields into the local `MCPServer` schema, handling:
- `url` vs `endpoint`
- `auth` vs `authentication`
- missing IDs (generated from name)

## Caching strategy
- Refresh runs only when cache is stale (interval-based).
- Errors from upstream do not wipe the local catalog.

## Related docs
- [MCP governance](governance.md)
- [MCP library](library.md)
