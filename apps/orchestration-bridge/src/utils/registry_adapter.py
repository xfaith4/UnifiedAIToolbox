"""
Registry adapter for ingesting MCP servers from upstream sources.

This module provides adapters for fetching and normalizing MCP server
definitions from external registries like the official MCP registry.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from pydantic import ValidationError

from ..models import MCPAuthConfig, MCPRegistry, MCPServer

logger = logging.getLogger(__name__)


class RegistrySource:
    """Base class for registry sources."""
    
    def __init__(self, source_id: str, url: str, enabled: bool = True):
        self.source_id = source_id
        self.url = url
        self.enabled = enabled
    
    def fetch(self) -> List[Dict[str, Any]]:
        """Fetch raw server data from the source."""
        raise NotImplementedError
    
    def normalize(self, raw_data: Dict[str, Any]) -> Optional[MCPServer]:
        """Normalize raw server data into an MCPServer instance."""
        raise NotImplementedError


class OfficialMCPRegistryAdapter(RegistrySource):
    """Adapter for the official MCP registry at modelcontextprotocol.io."""
    
    def __init__(self, url: str = "https://registry.modelcontextprotocol.io/v1/servers", 
                 timeout: int = 30):
        super().__init__(source_id="official", url=url)
        self.timeout = timeout
    
    def fetch(self) -> List[Dict[str, Any]]:
        """
        Fetch servers from the official MCP registry.
        
        Returns:
            List of raw server definitions
            
        Raises:
            requests.RequestException: If the registry is unreachable
        """
        logger.info(f"Fetching servers from official MCP registry: {self.url}")
        
        try:
            response = requests.get(self.url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            # Handle both direct array and object with 'servers' key
            if isinstance(data, list):
                servers = data
            elif isinstance(data, dict) and "servers" in data:
                servers = data["servers"]
            else:
                logger.warning(f"Unexpected response format from {self.url}")
                return []
            
            logger.info(f"Fetched {len(servers)} servers from official registry")
            return servers
            
        except requests.RequestException as e:
            logger.error(f"Failed to fetch from official registry: {e}")
            raise
    
    def normalize(self, raw_data: Dict[str, Any]) -> Optional[MCPServer]:
        """
        Normalize official registry format to MCPServer model.
        
        Expected upstream format variations:
        - id, name, url, description, capabilities, tags (common fields)
        - authentication/auth for auth config
        - status, owner, metadata fields
        
        Args:
            raw_data: Raw server definition from upstream
            
        Returns:
            MCPServer instance or None if normalization fails
        """
        try:
            # Normalize authentication field
            auth_data = raw_data.get("authentication") or raw_data.get("auth") or {}
            if isinstance(auth_data, dict):
                auth = MCPAuthConfig(
                    type=auth_data.get("type", "none"),
                    env_var=auth_data.get("env_var"),
                    header=auth_data.get("header")
                )
            else:
                auth = MCPAuthConfig(type="none")
            
            # Normalize URL field - handle both url and endpoint
            url = raw_data.get("url") or raw_data.get("endpoint")
            if not url:
                logger.warning(f"Server missing URL: {raw_data.get('id', 'unknown')}")
                return None
            
            # Create normalized server
            server = MCPServer(
                id=raw_data.get("id") or raw_data.get("name", "").lower().replace(" ", "-"),
                name=raw_data.get("name", "Unnamed Server"),
                url=url,
                transport=raw_data.get("transport", "sse"),
                description=raw_data.get("description"),
                tags=raw_data.get("tags", []),
                capabilities=raw_data.get("capabilities", []),
                owner=raw_data.get("owner"),
                status=raw_data.get("status", "available"),
                auth=auth,
                metadata=raw_data.get("metadata", {})
            )
            
            # Add source metadata
            server.metadata["source"] = "official-registry"
            server.metadata["ingested_at"] = datetime.now(timezone.utc).isoformat()
            
            return server
            
        except (ValidationError, ValueError) as e:
            logger.warning(f"Failed to normalize server {raw_data.get('id', 'unknown')}: {e}")
            return None


class GitHubTopicAdapter(RegistrySource):
    """
    Optional adapter for GitHub topic-based discovery (e.g., topic:mcp-server).
    
    This is marked as optional and requires a GitHub token for API access.
    """
    
    def __init__(self, topic: str = "mcp-server", timeout: int = 30):
        url = f"https://api.github.com/search/repositories?q=topic:{topic}"
        super().__init__(source_id=f"github-{topic}", url=url)
        self.topic = topic
        self.timeout = timeout
    
    def fetch(self) -> List[Dict[str, Any]]:
        """
        Fetch repositories from GitHub by topic.
        
        Note: This is an optional secondary feed and may require authentication.
        """
        logger.info(f"Fetching repositories with topic '{self.topic}' from GitHub")
        
        try:
            headers = {}
            # Optional: Add GitHub token if available (not required for basic search)
            import os
            token = os.environ.get("GITHUB_TOKEN")
            if token:
                headers["Authorization"] = f"token {token}"
            
            response = requests.get(self.url, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            
            repos = data.get("items", [])
            logger.info(f"Found {len(repos)} repositories with topic '{self.topic}'")
            return repos
            
        except requests.RequestException as e:
            logger.error(f"Failed to fetch from GitHub: {e}")
            raise
    
    def normalize(self, raw_data: Dict[str, Any]) -> Optional[MCPServer]:
        """
        Normalize GitHub repository data to MCPServer.
        
        This is a best-effort conversion since GitHub repos may not have
        full MCP server metadata.
        """
        try:
            # Extract basic info from GitHub repo
            repo_name = raw_data.get("full_name", "")
            server_id = repo_name.replace("/", "-").lower()
            
            # Try to construct a reasonable default URL (may need manual configuration)
            # Most MCP servers run locally, so we use a placeholder
            url = f"http://localhost:8000/mcp"
            
            server = MCPServer(
                id=server_id,
                name=raw_data.get("name", "Unnamed Server"),
                url=url,
                transport="sse",
                description=raw_data.get("description"),
                tags=["github", "community"],
                capabilities=[],  # Would need to be determined from README/docs
                owner=raw_data.get("owner", {}).get("login"),
                status="reference",  # Mark as reference since we don't know if it's running
                auth=MCPAuthConfig(type="none"),
                metadata={
                    "source": "github-topic",
                    "repo_url": raw_data.get("html_url"),
                    "stars": raw_data.get("stargazers_count", 0),
                    "ingested_at": datetime.now(timezone.utc).isoformat()
                }
            )
            
            return server
            
        except (ValidationError, ValueError) as e:
            logger.warning(f"Failed to normalize GitHub repo {raw_data.get('full_name', 'unknown')}: {e}")
            return None


def ingest_from_source(
    source: RegistrySource,
    existing_registry: Optional[MCPRegistry] = None
) -> Dict[str, Any]:
    """
    Ingest servers from a source and merge with existing registry.
    
    Args:
        source: Registry source adapter
        existing_registry: Current registry to merge into (optional)
        
    Returns:
        Dict with ingestion statistics:
        - servers_added: Number of new servers added
        - servers_updated: Number of existing servers updated
        - servers_total: Total servers in registry after ingestion
        - errors: List of errors encountered
    """
    if existing_registry is None:
        existing_registry = MCPRegistry(servers=[], metadata={})
    
    stats = {
        "servers_added": 0,
        "servers_updated": 0,
        "servers_total": 0,
        "errors": []
    }
    
    try:
        # Fetch raw data
        raw_servers = source.fetch()
        
        # Track existing server IDs
        existing_ids = {s.id for s in existing_registry.servers}
        
        # Normalize and merge
        for raw_server in raw_servers:
            normalized = source.normalize(raw_server)
            if normalized:
                if normalized.id in existing_ids:
                    # Update existing server
                    for i, existing in enumerate(existing_registry.servers):
                        if existing.id == normalized.id:
                            existing_registry.servers[i] = normalized
                            stats["servers_updated"] += 1
                            break
                else:
                    # Add new server
                    existing_registry.servers.append(normalized)
                    stats["servers_added"] += 1
        
        stats["servers_total"] = len(existing_registry.servers)
        
        # Update registry metadata
        existing_registry.metadata["last_sync"] = datetime.now(timezone.utc).isoformat()
        existing_registry.metadata["last_source"] = str(source.source_id)
        
        logger.info(f"Ingestion complete: {stats['servers_added']} added, "
                   f"{stats['servers_updated']} updated, "
                   f"{stats['servers_total']} total")
        
    except Exception as e:
        error_msg = f"Ingestion failed from {source.source_id}: {str(e)}"
        logger.error(error_msg)
        stats["errors"].append(error_msg)
    
    return stats
