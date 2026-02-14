"""
Registry refresh service with caching and graceful failure handling.

This module provides services for refreshing the MCP server registry
from upstream sources with caching, incremental updates, and graceful
failure handling.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import settings
from ..models import MCPRegistry
from .mcp_registry import load_registry, save_registry
from .registry_adapter import (
    OfficialMCPRegistryAdapter,
    GitHubTopicAdapter,
    ingest_from_source,
)

logger = logging.getLogger(__name__)


class RegistryRefreshService:
    """Service for refreshing the MCP registry from upstream sources."""
    
    def __init__(
        self,
        registry_path: Optional[Path] = None,
        cache_path: Optional[Path] = None,
    ):
        """
        Initialize the registry refresh service.
        
        Args:
            registry_path: Path to the registry file (defaults to settings)
            cache_path: Path to the cache file (defaults to settings)
        """
        self.registry_path = registry_path or settings.mcp_registry_path
        self.cache_path = cache_path or settings.mcp_registry_cache_path
        self.refresh_interval = timedelta(hours=settings.mcp_refresh_interval_hours)
    
    def should_refresh(self) -> bool:
        """
        Check if the registry should be refreshed based on cache age.
        
        Returns:
            True if cache is stale or missing, False otherwise
        """
        if not self.cache_path.exists():
            logger.info("No cache found, refresh needed")
            return True
        
        try:
            cache_data = self._load_cache()
            last_refresh = cache_data.get("last_refresh")
            
            if not last_refresh:
                logger.info("Cache missing last_refresh timestamp, refresh needed")
                return True
            
            last_refresh_time = datetime.fromisoformat(last_refresh.replace('Z', '+00:00'))
            time_since_refresh = datetime.now(timezone.utc) - last_refresh_time
            
            if time_since_refresh >= self.refresh_interval:
                logger.info(f"Cache is stale ({time_since_refresh.total_seconds() / 3600:.1f}h old), refresh needed")
                return True
            
            logger.info(f"Cache is fresh ({time_since_refresh.total_seconds() / 3600:.1f}h old)")
            return False
            
        except Exception as e:
            logger.warning(f"Failed to check cache age: {e}, forcing refresh")
            return True
    
    def refresh(self, force: bool = False) -> Dict[str, Any]:
        """
        Refresh the registry from upstream sources.
        
        Args:
            force: Force refresh even if cache is fresh
            
        Returns:
            Dict with refresh statistics:
            - success: Whether refresh succeeded
            - servers_added: Number of new servers
            - servers_updated: Number of updated servers
            - servers_total: Total servers after refresh
            - sources_synced: List of sources that were synced
            - cached: Whether cached data was used due to failure
            - errors: List of errors encountered
        """
        result = {
            "success": False,
            "servers_added": 0,
            "servers_updated": 0,
            "servers_total": 0,
            "sources_synced": [],
            "cached": False,
            "errors": []
        }
        
        # Check if refresh is needed
        if not force and not self.should_refresh():
            logger.info("Skipping refresh, cache is fresh")
            registry = load_registry(self.registry_path)
            result["success"] = True
            result["servers_total"] = len(registry.servers)
            result["cached"] = True
            return result
        
        # Load existing registry
        try:
            registry = load_registry(self.registry_path, allow_missing=True)
        except Exception as e:
            logger.error(f"Failed to load existing registry: {e}")
            registry = MCPRegistry(servers=[], metadata={})

        cache_data = self._load_cache()
        updated_since: Optional[str] = None
        if not force:
            cache_sync = cache_data.get("lastSuccessfulRegistrySyncAt") or cache_data.get("last_successful_registry_sync_at")
            cache_refresh = cache_data.get("last_refresh")
            updated_since = cache_sync or cache_refresh
        
        # Try to ingest from official registry
        official_source = OfficialMCPRegistryAdapter(
            url=settings.mcp_registry_url,
            timeout=settings.mcp_fetch_timeout,
            updated_since=updated_since,
        )
        official_sync_success = False
        
        try:
            logger.info("Attempting to refresh from official MCP registry")
            stats = ingest_from_source(official_source, registry)
            
            result["servers_added"] += stats["servers_added"]
            result["servers_updated"] += stats["servers_updated"]
            result["servers_total"] = stats["servers_total"]
            result["sources_synced"].append("official")
            result["errors"].extend(stats["errors"])
            
            if not stats["errors"]:
                result["success"] = True
                official_sync_success = True
            
        except Exception as e:
            error_msg = f"Failed to fetch from official registry: {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
        
        # Optionally ingest from GitHub (if enabled)
        if settings.mcp_enable_github_source:
            github_source = GitHubTopicAdapter(timeout=settings.mcp_fetch_timeout)
            try:
                logger.info("Attempting to refresh from GitHub topic search")
                stats = ingest_from_source(github_source, registry)
                
                result["servers_added"] += stats["servers_added"]
                result["servers_updated"] += stats["servers_updated"]
                result["servers_total"] = stats["servers_total"]
                result["sources_synced"].append("github")
                result["errors"].extend(stats["errors"])
                
            except Exception as e:
                error_msg = f"Failed to fetch from GitHub: {str(e)}"
                logger.warning(error_msg)  # Warning, not error, since this is optional
                result["errors"].append(error_msg)
        
        # Save registry if we got any data
        if result["servers_total"] > 0:
            try:
                save_registry(registry, self.registry_path)
                logger.info(f"Saved registry with {result['servers_total']} servers")
                
                # Update cache metadata
                sync_timestamp = datetime.now(timezone.utc).isoformat()
                cache_payload = {
                    "last_refresh": sync_timestamp,
                    "servers_count": result["servers_total"],
                    "sources": result["sources_synced"]
                }
                if official_sync_success:
                    cache_payload["last_successful_registry_sync_at"] = sync_timestamp
                    cache_payload["lastSuccessfulRegistrySyncAt"] = sync_timestamp
                self._save_cache({
                    **cache_data,
                    **cache_payload,
                })
                
            except Exception as e:
                error_msg = f"Failed to save registry: {str(e)}"
                logger.error(error_msg)
                result["errors"].append(error_msg)
                result["success"] = False
        
        # If refresh failed but we have cached data, serve from cache
        if not result["success"] and self.registry_path.exists():
            logger.warning("Refresh failed, serving from cached registry")
            registry = load_registry(self.registry_path)
            result["servers_total"] = len(registry.servers)
            result["cached"] = True
            result["success"] = True  # Success because we can serve cached data
        
        return result
    
    def _load_cache(self) -> Dict[str, Any]:
        """Load cache metadata."""
        if not self.cache_path.exists():
            return {}
        
        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load cache: {e}")
            return {}
    
    def _save_cache(self, data: Dict[str, Any]) -> None:
        """Save cache metadata."""
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save cache: {e}")


# Convenience function for manual refresh
def refresh_registry(force: bool = False) -> Dict[str, Any]:
    """
    Refresh the MCP registry from upstream sources.
    
    Args:
        force: Force refresh even if cache is fresh
        
    Returns:
        Dict with refresh statistics
    """
    service = RegistryRefreshService()
    return service.refresh(force=force)
