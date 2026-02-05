# How to Add MCPs to an Orchestration Run

This guide explains how to use the MCP Library feature to add Model Context Protocol servers to your orchestration runs.

## Overview

The MCP Library allows you to:
- Browse and search available MCP servers
- View detailed information about each server's capabilities and permissions
- Manage collections of servers for easier organization
- Control which MCPs are allowed in specific orchestration runs

## Step 1: Browse Available MCP Servers

1. Navigate to **MCP Library** from the sidebar under "Libraries"
2. Use the search bar to find specific servers by name or description
3. Filter servers by:
   - **Status**: Available, Experimental, Deprecated
   - **Installation Status**: Installed or Catalog-only
4. Click **VIEW DETAILS** on any server to see more information

## Step 2: Review Server Details

Before adding an MCP to a run, review its:

### Capabilities
- What tools and functions the server provides (e.g., filesystem, search, web-crawling)

### Permission Footprint ("Blast Radius")
- What resources the server can access
- **Important**: This shows the potential impact if the server is compromised

### Verification Status
- ✅ **Official Registry - Verified**: Trusted sources from the official MCP registry
- ⚠️ **Community Source - Unverified**: Community contributions (review carefully!)

### Authentication Requirements
- No Authentication: Safe for local/trusted environments
- Token/API Key: Requires credentials in environment variables

## Step 3: Install an MCP Server (Optional)

While not required for catalog servers, installing an MCP:
1. Marks it as available in your environment
2. Allows you to configure it with specific settings
3. Enables quick access for multiple runs

To install:
1. Go to the server detail page
2. Click **INSTALL SERVER**
3. Configure any required settings
4. The server status will change from "catalog" to "installed"

## Step 4: Create a Collection (Recommended)

Collections group related MCPs for easier management:

1. Go to **MCP Library** → **Collections** tab
2. Click **Create Collection**
3. Name your collection (e.g., "Data Analysis Tools", "Web Automation")
4. Add servers to the collection
5. Use collections in your orchestration runs

## Step 5: Add MCPs to an Orchestration Run

### Via Orchestrator Configuration

When configuring an orchestration run:

1. Navigate to **Orchestrator** → **New Run**
2. In the run configuration, find the **Allowed MCPs** section
3. Choose one of:
   - **Explicit Servers**: Select individual MCP servers
   - **Collections**: Select a pre-configured collection
4. Save the configuration

### Via API

```python
# Example: Create an allowlist for a run
import requests

allowlist_data = {
    "scope": "run",
    "scope_id": "run-abc123",
    "allowed_servers": ["local-filesystem", "firecrawl-web-research"],
    # OR use a collection:
    "allowed_collections": ["data-analysis-tools"]
}

response = requests.post(
    "http://localhost:8000/api/mcp/allowlists",
    json=allowlist_data
)
```

## Step 6: Runtime Enforcement

The system enforces your MCP selections with **deny-by-default** security:

- ✅ **Allowed calls**: Only MCPs in your allowlist can be invoked
- ❌ **Blocked calls**: Attempts to use non-allowed MCPs are denied
- 📝 **Audit trail**: All attempts (allowed and denied) are logged

### Viewing Audit Logs

To review MCP activity:
1. Navigate to **Orchestrator** → **Run Details**
2. Check the **Audit Log** section
3. Review:
   - Which MCPs were invoked
   - Which calls were blocked
   - Reasons for denials

## Security Best Practices

### 1. Principle of Least Privilege
Only add MCPs that are absolutely necessary for the task.

### 2. Review Unverified Sources Carefully
Community MCPs may not be as rigorously vetted as official ones.

### 3. Monitor Permission Footprints
Be aware of what resources each MCP can access.

### 4. Use Collections for Reusability
Define standard MCP sets for common workflows.

### 5. Review Audit Logs Regularly
Check for unexpected MCP usage or denial patterns.

## Example Workflow

Here's a complete example workflow:

### Scenario: Data Analysis Run

1. **Browse** the MCP Library and identify needed servers:
   - `local-filesystem` (read data files)
   - `postgres-database` (query database)
   - `firecrawl-web-research` (fetch external data)

2. **Review** each server's:
   - Capabilities (what it can do)
   - Permission footprint (what it can access)
   - Verification status (official or community)

3. **Create a collection** called "Data Analysis Tools" with these three servers

4. **Configure your run** to allow the "Data Analysis Tools" collection

5. **Execute the run** - agents can now invoke these MCPs

6. **Review audit logs** to confirm:
   - All MCP calls were within the allowed set
   - No unauthorized attempts occurred
   - Secrets were properly redacted

## Troubleshooting

### "MCP call denied" Error

**Cause**: The MCP is not in the run's allowlist

**Solution**:
1. Check the run's allowed MCPs configuration
2. Add the required MCP server or collection
3. Re-run the orchestration

### "MCP server not found" Error

**Cause**: The server ID doesn't exist in the catalog

**Solution**:
1. Verify the server ID is correct
2. Check if the server is in the MCP Library
3. Refresh the registry if needed

### Authentication Errors

**Cause**: Required credentials are missing

**Solution**:
1. Check the server's authentication requirements
2. Set required environment variables
3. Verify credentials are valid

## API Reference

### List Servers
```bash
curl -X POST http://localhost:8000/api/mcp/servers/search \
  -H "Content-Type: application/json" \
  -d '{"query": "filesystem", "limit": 10}'
```

### Get Server Details
```bash
curl http://localhost:8000/api/mcp/servers/local-filesystem
```

### Create Collection
```bash
curl -X POST http://localhost:8000/api/mcp/collections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Tools",
    "server_ids": ["local-filesystem", "postgres-database"]
  }'
```

### Create Allowlist
```bash
curl -X POST http://localhost:8000/api/mcp/allowlists \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "run",
    "scope_id": "run-123",
    "allowed_servers": ["local-filesystem"]
  }'
```

## Next Steps

- Explore the [MCP Governance API Documentation](../docs/MCP_GOVERNANCE_API.md)
- Review [Policy Engine Design](../docs/MCP_GOVERNANCE_DESIGN.md)
- Check [MCP Registry Ingestion](../docs/MCP_REGISTRY_INGESTION.md) for adding custom servers

## Support

For issues or questions:
- Check [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- Review [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)
