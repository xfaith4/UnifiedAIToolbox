# MCP Registry Ingestion

This document describes the MCP (Model Context Protocol) registry ingestion feature, which allows the Unified AI Toolbox to automatically discover and catalog MCP servers from external registries.

## Overview

The registry ingestion system fetches MCP server definitions from upstream sources (like the official MCP registry) and merges them into the local catalog. This enables:

- **Automatic Discovery**: Discover new MCP servers from trusted registries
- **Up-to-Date Catalog**: Keep your local server catalog synchronized with upstream sources
- **Graceful Failure**: Continue serving from cached data when upstream is unreachable
- **Incremental Updates**: Only update changed servers, avoiding full catalog wipes

## Configuration

Configure the registry ingestion system using environment variables or `.env` file:

### Required Settings

```bash
# Path to the local MCP server registry
BRIDGE_MCP_REGISTRY_PATH=/path/to/data/mcp/servers.json

# Default: {repo}/data/mcp/servers.json
```

### Optional Settings

```bash
# URL for the official MCP registry
BRIDGE_MCP_REGISTRY_URL=https://registry.modelcontextprotocol.io/v1/servers
# Default: https://registry.modelcontextprotocol.io/v1/servers

# Path to cache metadata about registry refreshes
BRIDGE_MCP_REGISTRY_CACHE_PATH=/path/to/data/mcp/registry_cache.json
# Default: {repo}/data/mcp/registry_cache.json

# Hours between automatic registry refreshes
BRIDGE_MCP_REFRESH_INTERVAL_HOURS=24
# Default: 24

# Timeout in seconds for fetching from external registries
BRIDGE_MCP_FETCH_TIMEOUT=30
# Default: 30

# Enable optional GitHub topic-based discovery (requires GITHUB_TOKEN)
BRIDGE_MCP_ENABLE_GITHUB_SOURCE=false
# Default: false
```

## Usage

### Manual Refresh

Manually refresh the MCP registry from upstream sources:

```bash
cd apps/orchestration-bridge
python bridge.py refresh-registry
```

Force a refresh even if the cache is fresh:

```bash
python bridge.py refresh-registry --force
```

### Programmatic Usage

```python
from src.utils.registry_service import refresh_registry

# Manual refresh
result = refresh_registry(force=True)

print(f"Success: {result['success']}")
print(f"Servers added: {result['servers_added']}")
print(f"Servers updated: {result['servers_updated']}")
print(f"Total servers: {result['servers_total']}")
print(f"Sources synced: {result['sources_synced']}")
print(f"Errors: {result['errors']}")
```

### Automatic Refresh

The registry refresh service automatically checks if a refresh is needed based on the configured refresh interval. If the cache is stale (older than `BRIDGE_MCP_REFRESH_INTERVAL_HOURS`), it will fetch from upstream sources.

## Data Sources

### Official MCP Registry (Default)

The primary data source is the official MCP registry at `https://registry.modelcontextprotocol.io/v1/servers`.

**Features:**
- Community-curated MCP servers
- Verified and tested servers
- Rich metadata (capabilities, tags, authentication)

**Requirements:**
- No authentication required
- Internet connection needed for initial fetch
- Cached data served if unreachable

### GitHub Topic Search (Optional)

An optional secondary source that discovers MCP servers by searching GitHub repositories tagged with specific topics (e.g., `mcp-server`).

**Features:**
- Discover community MCP servers
- Automatic metadata extraction from repository info

**Requirements:**
- Set `BRIDGE_MCP_ENABLE_GITHUB_SOURCE=true`
- Optional: Set `GITHUB_TOKEN` for higher API rate limits
- Servers marked as "reference" status (may need manual configuration)

**To enable:**

```bash
export BRIDGE_MCP_ENABLE_GITHUB_SOURCE=true
export GITHUB_TOKEN=your_github_token  # Optional, for higher rate limits
```

## Normalization

The ingestion system normalizes upstream server definitions into the local `MCPServer` format:

### Upstream Format Variations Handled

- **URL field**: Accepts both `url` and `endpoint`
- **Auth field**: Accepts both `auth` and `authentication`
- **ID generation**: Auto-generates ID from name if missing
- **Defaults**: Applies sensible defaults for optional fields

### Normalized Fields

Each ingested server includes:

```json
{
  "id": "unique-server-id",
  "name": "Human Readable Name",
  "url": "http://localhost:8000/mcp",
  "transport": "sse",
  "description": "What the server provides",
  "tags": ["category", "type"],
  "capabilities": ["capability1", "capability2"],
  "owner": "owner-name",
  "status": "available|experimental|offline|reference",
  "auth": {
    "type": "none|token_env|basic",
    "env_var": "ENV_VAR_NAME",
    "header": "X-Header-Name"
  },
  "metadata": {
    "source": "official-registry",
    "ingested_at": "2026-02-03T04:00:00Z",
    "repo_url": "https://github.com/org/repo"
  }
}
```

## Caching Strategy

### Cache Metadata

The system maintains cache metadata in `registry_cache.json`:

```json
{
  "last_refresh": "2026-02-03T04:00:00Z",
  "servers_count": 15,
  "sources": ["official", "github"]
}
```

### Incremental Updates

- **Upsert logic**: Servers with matching IDs are updated, new ones are added
- **No deletions**: Servers are never removed during refresh (prevents accidental data loss)
- **Metadata tracking**: Each server tracks its ingestion source and timestamp

### Refresh Decision Logic

1. Check if cache exists
2. If cache missing → refresh needed
3. If cache exists, check `last_refresh` timestamp
4. If `last_refresh` older than `BRIDGE_MCP_REFRESH_INTERVAL_HOURS` → refresh needed
5. Otherwise → serve from existing registry

## Failure Handling

### Graceful Degradation

When upstream sources are unreachable:

1. **Log the error**: Record connection failures in logs
2. **Continue with cache**: Serve existing registry data
3. **Return success**: Mark operation as successful (cached data available)
4. **Include error details**: Populate `errors` array in result

### Example Error Response

```python
{
  "success": True,  # Success because cached data is available
  "cached": True,
  "servers_total": 15,
  "servers_added": 0,
  "servers_updated": 0,
  "sources_synced": [],
  "errors": [
    "Failed to fetch from official registry: Connection timeout",
    "Failed to fetch from GitHub: Rate limit exceeded"
  ]
}
```

### Retry Strategy

The system does not implement automatic retries. Instead:

- Manual retry via CLI: `python bridge.py refresh-registry --force`
- Programmatic retry: Call `refresh_registry(force=True)` again
- Next scheduled refresh: Will retry after configured interval

## Testing

Run the test suite for registry ingestion:

```bash
cd apps/orchestration-bridge
pytest tests/test_registry_adapter.py -v
pytest tests/test_registry_service.py -v
```

### Test Coverage

- **Adapter tests**: Fetch, normalize, error handling
- **Service tests**: Refresh logic, caching, graceful failure
- **Integration tests**: End-to-end ingestion workflows

## Security Considerations

### No Secrets Required

The system works without any external secrets:

- Official registry requires no authentication
- GitHub search works without tokens (lower rate limits)
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

### Data Validation

All ingested servers are validated against the `MCPServer` Pydantic model:

- URL format validation (must be http/https)
- Required fields enforcement
- Type checking for all fields
- Malformed entries are logged and skipped

### Authentication Configuration

Servers may specify authentication requirements:

```json
{
  "auth": {
    "type": "token_env",
    "env_var": "MY_TOKEN",
    "header": "Authorization"
  }
}
```

**Important**: The ingestion system only catalogs auth requirements. Actual authentication is handled when connecting to the server.

## Troubleshooting

### Registry not updating

**Check cache freshness:**
```bash
cat data/mcp/registry_cache.json
```

**Force refresh:**
```bash
cd apps/orchestration-bridge
python bridge.py refresh-registry --force
```

### Connection errors

**Check network connectivity:**
```bash
curl -I https://registry.modelcontextprotocol.io/v1/servers
```

**Check timeout setting:**
```bash
export BRIDGE_MCP_FETCH_TIMEOUT=60  # Increase timeout
```

### Invalid server entries

Check logs for validation errors:
```bash
cd apps/orchestration-bridge
python bridge.py refresh-registry --force 2>&1 | grep -i error
```

Validation errors are logged but don't prevent other servers from being ingested.

## API Integration

For systems that need to integrate registry refresh into automated workflows:

```python
from src.utils.registry_service import RegistryRefreshService

# Create service with custom paths
service = RegistryRefreshService(
    registry_path="/custom/path/servers.json",
    cache_path="/custom/path/cache.json"
)

# Check if refresh is needed
if service.should_refresh():
    result = service.refresh()
    if result["success"]:
        print(f"Registry updated: {result['servers_total']} servers")
```

## Future Enhancements

Potential future improvements:

1. **Scheduled background refresh**: Integrate with orchestration bridge service
2. **Multiple registry sources**: Support custom registry URLs
3. **Server health checks**: Validate server availability post-ingestion
4. **Version tracking**: Track server version changes over time
5. **Diff reports**: Generate reports of what changed in each refresh

## Related Documentation

- [MCP Governance API](MCP_GOVERNANCE_API.md) - Full MCP management API
- [Architecture Facts](../ARCHITECTURE_FACTS.md) - System architecture overview
- [Orchestration Guide](../apps/orchestration-bridge/README.md) - Orchestration bridge usage
