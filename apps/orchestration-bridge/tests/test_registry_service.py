"""
Tests for MCP registry refresh service.
"""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

# Make src importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import MCPAuthConfig, MCPServer, MCPRegistry  # noqa: E402
from src.utils.registry_service import RegistryRefreshService  # noqa: E402


class TestRegistryRefreshService:
    """Tests for the RegistryRefreshService."""

    def test_should_refresh_returns_true_when_cache_missing(self, tmp_path):
        """Test that should_refresh returns True when cache doesn't exist."""
        service = RegistryRefreshService(
            registry_path=tmp_path / "registry.json",
            cache_path=tmp_path / "cache.json",
        )
        
        assert service.should_refresh() is True

    def test_should_refresh_returns_true_when_cache_stale(self, tmp_path):
        """Test that should_refresh returns True when cache is stale."""
        cache_path = tmp_path / "cache.json"
        
        # Create stale cache (25 hours old, default refresh interval is 24h)
        stale_time = datetime.now(timezone.utc) - timedelta(hours=25)
        cache_data = {
            "last_refresh": stale_time.isoformat(),
            "servers_count": 5,
        }
        
        with open(cache_path, "w") as f:
            json.dump(cache_data, f)
        
        service = RegistryRefreshService(
            registry_path=tmp_path / "registry.json",
            cache_path=cache_path,
        )
        
        assert service.should_refresh() is True

    def test_should_refresh_returns_false_when_cache_fresh(self, tmp_path):
        """Test that should_refresh returns False when cache is fresh."""
        cache_path = tmp_path / "cache.json"
        
        # Create fresh cache (1 hour old)
        fresh_time = datetime.now(timezone.utc) - timedelta(hours=1)
        cache_data = {
            "last_refresh": fresh_time.isoformat(),
            "servers_count": 5,
        }
        
        with open(cache_path, "w") as f:
            json.dump(cache_data, f)
        
        service = RegistryRefreshService(
            registry_path=tmp_path / "registry.json",
            cache_path=cache_path,
        )
        
        assert service.should_refresh() is False

    def test_refresh_adds_servers_from_official_registry(self, tmp_path):
        """Test that refresh fetches and adds servers from official registry."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"
        
        # Start with empty registry
        from src.utils.mcp_registry import save_registry
        initial_registry = MCPRegistry(servers=[], metadata={})
        save_registry(initial_registry, registry_path)
        
        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )
        
        # Mock the official adapter
        mock_servers = [
            {
                "id": "server1",
                "name": "Server 1",
                "url": "http://localhost:8001/mcp",
                "description": "Test server 1",
            },
            {
                "id": "server2",
                "name": "Server 2",
                "url": "http://localhost:8002/mcp",
                "description": "Test server 2",
            },
        ]
        
        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            
            # Mock fetch to return our test data
            mock_adapter.fetch.return_value = mock_servers
            
            # Mock normalize to create MCPServer instances
            def normalize_side_effect(data):
                return MCPServer(
                    id=data["id"],
                    name=data["name"],
                    url=data["url"],
                    transport="sse",
                    description=data.get("description"),
                    auth=MCPAuthConfig(type="none"),
                    metadata={"source": "official-registry"}
                )
            
            mock_adapter.normalize.side_effect = normalize_side_effect
            
            result = service.refresh(force=True)
            
            assert result["success"] is True
            assert result["servers_added"] == 2
            assert result["servers_updated"] == 0
            assert result["servers_total"] == 2
            assert "official" in result["sources_synced"]
            
            # Verify registry was saved
            from src.utils.mcp_registry import load_registry
            saved_registry = load_registry(registry_path)
            assert len(saved_registry.servers) == 2

    def test_refresh_updates_existing_servers(self, tmp_path):
        """Test that refresh updates servers that already exist."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"
        
        # Start with a registry containing one server
        from src.utils.mcp_registry import save_registry
        existing_server = MCPServer(
            id="server1",
            name="Old Name",
            url="http://localhost:8001/mcp",
            transport="sse",
            description="Old description",
            auth=MCPAuthConfig(type="none"),
        )
        initial_registry = MCPRegistry(servers=[existing_server], metadata={})
        save_registry(initial_registry, registry_path)
        
        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )
        
        # Mock the official adapter with updated data
        mock_servers = [
            {
                "id": "server1",
                "name": "Updated Name",
                "url": "http://localhost:8001/mcp",
                "description": "Updated description",
            },
        ]
        
        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            mock_adapter.fetch.return_value = mock_servers
            
            def normalize_side_effect(data):
                return MCPServer(
                    id=data["id"],
                    name=data["name"],
                    url=data["url"],
                    transport="sse",
                    description=data.get("description"),
                    auth=MCPAuthConfig(type="none"),
                    metadata={"source": "official-registry"}
                )
            
            mock_adapter.normalize.side_effect = normalize_side_effect
            
            result = service.refresh(force=True)
            
            assert result["success"] is True
            assert result["servers_added"] == 0
            assert result["servers_updated"] == 1
            assert result["servers_total"] == 1

    def test_refresh_serves_cached_data_on_failure(self, tmp_path):
        """Test that refresh serves cached data when upstream fails."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"
        
        # Create existing registry with servers
        from src.utils.mcp_registry import save_registry
        existing_server = MCPServer(
            id="cached-server",
            name="Cached Server",
            url="http://localhost:8000/mcp",
            transport="sse",
            auth=MCPAuthConfig(type="none"),
        )
        initial_registry = MCPRegistry(servers=[existing_server], metadata={})
        save_registry(initial_registry, registry_path)
        
        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )
        
        # Mock adapter to fail
        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            mock_adapter.fetch.side_effect = Exception("Network error")
            
            result = service.refresh(force=True)
            
            # Should succeed with cached data
            assert result["success"] is True
            assert result["cached"] is True
            assert result["servers_total"] == 1
            assert len(result["errors"]) > 0
            assert "Network error" in result["errors"][0]

    def test_refresh_skips_when_cache_fresh_and_not_forced(self, tmp_path):
        """Test that refresh skips when cache is fresh and force=False."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"
        
        # Create fresh cache
        fresh_time = datetime.now(timezone.utc) - timedelta(hours=1)
        cache_data = {
            "last_refresh": fresh_time.isoformat(),
            "servers_count": 5,
        }
        with open(cache_path, "w") as f:
            json.dump(cache_data, f)
        
        # Create registry with some servers
        from src.utils.mcp_registry import save_registry
        existing_server = MCPServer(
            id="server1",
            name="Server 1",
            url="http://localhost:8001/mcp",
            transport="sse",
            auth=MCPAuthConfig(type="none"),
        )
        initial_registry = MCPRegistry(servers=[existing_server], metadata={})
        save_registry(initial_registry, registry_path)
        
        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )
        
        # Should skip refresh
        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            result = service.refresh(force=False)
            
            # Should not call adapter at all
            mock_adapter_class.assert_not_called()
            
            assert result["success"] is True
            assert result["cached"] is True
            assert result["servers_total"] == 1

    def test_refresh_saves_cache_metadata(self, tmp_path):
        """Test that refresh saves cache metadata after successful refresh."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"
        
        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )
        
        # Mock successful refresh
        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            mock_adapter.fetch.return_value = [
                {"id": "server1", "name": "Server 1", "url": "http://localhost:8001/mcp"}
            ]
            
            def normalize_side_effect(data):
                return MCPServer(
                    id=data["id"],
                    name=data["name"],
                    url=data["url"],
                    transport="sse",
                    auth=MCPAuthConfig(type="none"),
                )
            
            mock_adapter.normalize.side_effect = normalize_side_effect
            
            result = service.refresh(force=True)
            
            assert result["success"] is True
            
            # Verify cache was saved
            assert cache_path.exists()
            with open(cache_path, "r") as f:
                cache_data = json.load(f)
                assert "last_refresh" in cache_data
                assert "last_successful_registry_sync_at" in cache_data
                assert cache_data["servers_count"] == 1
                assert "official" in cache_data["sources"]

    def test_refresh_uses_updated_since_from_last_successful_sync(self, tmp_path):
        """Test incremental official sync passes updated_since from cache metadata."""
        registry_path = tmp_path / "registry.json"
        cache_path = tmp_path / "cache.json"

        last_successful = "2026-02-10T12:00:00+00:00"
        stale_refresh = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "last_refresh": stale_refresh,
                    "last_successful_registry_sync_at": last_successful,
                    "servers_count": 0,
                    "sources": ["official"],
                },
                f,
            )

        service = RegistryRefreshService(
            registry_path=registry_path,
            cache_path=cache_path,
        )

        with patch("src.utils.registry_service.OfficialMCPRegistryAdapter") as mock_adapter_class:
            mock_adapter = Mock()
            mock_adapter_class.return_value = mock_adapter
            mock_adapter.fetch.return_value = []
            mock_adapter.normalize.side_effect = lambda data: data

            result = service.refresh(force=False)

            assert result["success"] is True
            kwargs = mock_adapter_class.call_args.kwargs
            assert kwargs["updated_since"] == last_successful
