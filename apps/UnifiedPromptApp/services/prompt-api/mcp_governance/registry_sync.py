"""
Registry sync service for MCP governance.

Integrates with existing registry adapters to fetch and sync MCP servers
from external sources into the local governance storage.
"""

import logging
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Add orchestration-bridge to path to import registry adapters
REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
ORCH_BRIDGE_PATH = REPO_ROOT / "orchestration-bridge" / "src"
if str(ORCH_BRIDGE_PATH) not in sys.path:
    sys.path.insert(0, str(ORCH_BRIDGE_PATH))

try:
    from utils.registry_adapter import (
        OfficialMCPRegistryAdapter,
        ingest_from_source,
    )
    from models import MCPRegistry, MCPServer
    ADAPTERS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Registry adapters not available: {e}")
    ADAPTERS_AVAILABLE = False


def convert_mcp_server_to_storage_format(server: 'MCPServer') -> Dict[str, Any]:
    """
    Convert an MCPServer model from orchestration-bridge to storage format.
    
    Args:
        server: MCPServer instance from orchestration-bridge
        
    Returns:
        Dict in storage format compatible with mcp_governance storage layer
    """
    return {
        "server_id": server.id,
        "name": server.name,
        "description": server.description,
        "url": server.url,
        "transport": server.transport,
        "tags": server.tags,
        "capabilities": server.capabilities,
        "status": server.status,
        "owner": server.owner or "unknown",
        "auth": {
            "type": server.auth.type if server.auth else "none",
            "env_var": server.auth.env_var if server.auth else None,
            "header": server.auth.header if server.auth else None,
        },
        "metadata": server.metadata,
    }


def sync_from_official_registry(
    existing_servers: List[Dict[str, Any]],
    timeout: int = 30
) -> Dict[str, Any]:
    """
    Sync servers from the official MCP registry.
    
    Args:
        existing_servers: Current servers in storage format
        timeout: Request timeout in seconds
        
    Returns:
        Dict with sync statistics:
        - servers_added: Number of new servers
        - servers_updated: Number of updated servers
        - servers_total: Total servers after sync
        - errors: List of error messages
    """
    if not ADAPTERS_AVAILABLE:
        return {
            "servers_added": 0,
            "servers_updated": 0,
            "servers_total": len(existing_servers),
            "errors": ["Registry adapters not available. Check orchestration-bridge integration."],
        }
    
    try:
        # Create adapter
        adapter = OfficialMCPRegistryAdapter(timeout=timeout)
        
        # Convert existing servers to MCPRegistry format
        from models import MCPServer as BridgeMCPServer
        existing_mcp_servers = []
        for server_dict in existing_servers:
            try:
                # Convert from storage format to MCPServer
                mcp_server = BridgeMCPServer(
                    id=server_dict.get("server_id"),
                    name=server_dict.get("name"),
                    url=server_dict.get("url"),
                    transport=server_dict.get("transport", "sse"),
                    description=server_dict.get("description"),
                    tags=server_dict.get("tags", []),
                    capabilities=server_dict.get("capabilities", []),
                    status=server_dict.get("status", "available"),
                    owner=server_dict.get("owner"),
                    metadata=server_dict.get("metadata", {}),
                )
                existing_mcp_servers.append(mcp_server)
            except Exception as e:
                logger.warning(f"Failed to convert server {server_dict.get('server_id')}: {e}")
        
        existing_registry = MCPRegistry(
            servers=existing_mcp_servers,
            metadata={"last_sync": datetime.utcnow().isoformat()}
        )
        
        # Perform ingestion
        stats = ingest_from_source(adapter, existing_registry)
        
        # Convert back to storage format
        synced_servers = [
            convert_mcp_server_to_storage_format(s)
            for s in existing_registry.servers
        ]
        
        # Return stats with converted servers
        stats["synced_servers"] = synced_servers
        return stats
        
    except Exception as e:
        logger.error(f"Registry sync failed: {e}", exc_info=True)
        return {
            "servers_added": 0,
            "servers_updated": 0,
            "servers_total": len(existing_servers),
            "errors": [f"Sync failed: {str(e)}"],
        }


def get_default_sources() -> List[Dict[str, Any]]:
    """
    Get default registry sources.
    
    Returns:
        List of registry source configurations
    """
    return [
        {
            "source_id": "official",
            "source_type": "official",
            "url": "https://registry.modelcontextprotocol.io/v1/servers",
            "enabled": True,
            "metadata": {
                "description": "Official MCP Registry",
                "priority": 1,
            }
        },
        {
            "source_id": "github-mcp-server",
            "source_type": "github",
            "url": "https://api.github.com/search/repositories?q=topic:mcp-server",
            "enabled": False,  # Disabled by default (requires GitHub token)
            "metadata": {
                "description": "GitHub repositories with topic 'mcp-server'",
                "priority": 2,
                "requires_auth": True,
            }
        },
    ]


def load_sources_config(config_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Load registry sources from config file.
    
    Args:
        config_path: Path to sources config file (optional)
        
    Returns:
        List of registry sources
    """
    if config_path is None:
        data_dir = REPO_ROOT / "data" / "mcp"
        config_path = data_dir / "registry_sources.json"
    
    if config_path.exists():
        try:
            import json
            with open(config_path, 'r') as f:
                sources = json.load(f)
                logger.info(f"Loaded {len(sources)} registry sources from {config_path}")
                return sources
        except Exception as e:
            logger.warning(f"Failed to load sources config: {e}")
    
    # Return defaults if config doesn't exist
    logger.info("Using default registry sources")
    return get_default_sources()


def save_sources_config(sources: List[Dict[str, Any]], config_path: Optional[Path] = None) -> bool:
    """
    Save registry sources to config file.
    
    Args:
        sources: List of registry sources
        config_path: Path to sources config file (optional)
        
    Returns:
        True if saved successfully, False otherwise
    """
    if config_path is None:
        data_dir = REPO_ROOT / "data" / "mcp"
        config_path = data_dir / "registry_sources.json"
    
    try:
        import json
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(sources, f, indent=2)
        logger.info(f"Saved {len(sources)} registry sources to {config_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to save sources config: {e}")
        return False
