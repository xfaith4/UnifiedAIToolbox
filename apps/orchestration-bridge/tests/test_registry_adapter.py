"""
Tests for MCP registry adapter and ingestion functionality.
"""
import json
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest
import requests

# Make src importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import MCPAuthConfig, MCPServer, MCPRegistry  # noqa: E402
from src.utils.registry_adapter import (  # noqa: E402
    OfficialMCPRegistryAdapter,
    GitHubTopicAdapter,
    ingest_from_source,
)


class TestOfficialMCPRegistryAdapter:
    """Tests for the official MCP registry adapter."""

    def test_fetch_returns_list_of_servers(self):
        """Test that fetch returns a list of server definitions."""
        adapter = OfficialMCPRegistryAdapter()
        
        mock_response = {
            "servers": [
                {
                    "id": "test-server",
                    "name": "Test Server",
                    "url": "http://localhost:8000/mcp",
                    "description": "A test server",
                }
            ]
        }
        
        with patch("requests.get") as mock_get:
            mock_get.return_value.json.return_value = mock_response
            mock_get.return_value.raise_for_status = Mock()
            
            servers = adapter.fetch()
            
            assert len(servers) == 1
            assert servers[0]["id"] == "test-server"
            mock_get.assert_called_once()

    def test_fetch_handles_direct_array_response(self):
        """Test that fetch handles responses that are direct arrays."""
        adapter = OfficialMCPRegistryAdapter()
        
        mock_response = [
            {"id": "server1", "name": "Server 1", "url": "http://localhost:8001/mcp"},
            {"id": "server2", "name": "Server 2", "url": "http://localhost:8002/mcp"},
        ]
        
        with patch("requests.get") as mock_get:
            mock_get.return_value.json.return_value = mock_response
            mock_get.return_value.raise_for_status = Mock()
            
            servers = adapter.fetch()
            
            assert len(servers) == 2
            assert servers[0]["id"] == "server1"
            assert servers[1]["id"] == "server2"

    def test_fetch_raises_on_request_error(self):
        """Test that fetch raises on network errors."""
        adapter = OfficialMCPRegistryAdapter()
        
        with patch("requests.get") as mock_get:
            mock_get.side_effect = requests.RequestException("Network error")
            
            with pytest.raises(requests.RequestException):
                adapter.fetch()

    def test_normalize_creates_valid_mcp_server(self):
        """Test that normalize creates a valid MCPServer from raw data."""
        adapter = OfficialMCPRegistryAdapter()
        
        raw_data = {
            "id": "filesystem",
            "name": "Filesystem MCP",
            "url": "http://localhost:5174/mcp",
            "transport": "sse",
            "description": "Local filesystem access",
            "capabilities": ["filesystem", "search"],
            "tags": ["local", "default"],
            "owner": "platform",
            "status": "available",
            "auth": {"type": "none"},
        }
        
        server = adapter.normalize(raw_data)
        
        assert server is not None
        assert server.id == "filesystem"
        assert server.name == "Filesystem MCP"
        assert str(server.url) == "http://localhost:5174/mcp"
        assert "filesystem" in server.capabilities
        assert "local" in server.tags
        assert server.auth.type == "none"
        assert server.metadata["source"] == "official-registry"
        assert "ingested_at" in server.metadata

    def test_normalize_handles_auth_variations(self):
        """Test that normalize handles different auth field names."""
        adapter = OfficialMCPRegistryAdapter()
        
        # Test with "authentication" field
        raw_data_auth = {
            "id": "server1",
            "name": "Server 1",
            "url": "http://localhost:8000/mcp",
            "authentication": {
                "type": "token_env",
                "env_var": "MY_TOKEN",
                "header": "X-API-Key"
            }
        }
        
        server1 = adapter.normalize(raw_data_auth)
        assert server1.auth.type == "token_env"
        assert server1.auth.env_var == "MY_TOKEN"
        assert server1.auth.header == "X-API-Key"
        
        # Test with "auth" field
        raw_data_auth2 = {
            "id": "server2",
            "name": "Server 2",
            "url": "http://localhost:8001/mcp",
            "auth": {"type": "basic"}
        }
        
        server2 = adapter.normalize(raw_data_auth2)
        assert server2.auth.type == "basic"

    def test_normalize_handles_missing_url(self):
        """Test that normalize returns None for servers without URLs."""
        adapter = OfficialMCPRegistryAdapter()
        
        raw_data = {
            "id": "broken-server",
            "name": "Broken Server",
            # Missing URL
        }
        
        server = adapter.normalize(raw_data)
        assert server is None

    def test_normalize_uses_endpoint_as_fallback(self):
        """Test that normalize uses 'endpoint' field if 'url' is missing."""
        adapter = OfficialMCPRegistryAdapter()
        
        raw_data = {
            "id": "alt-server",
            "name": "Alt Server",
            "endpoint": "http://localhost:9000/mcp",  # Using endpoint instead of url
        }
        
        server = adapter.normalize(raw_data)
        assert server is not None
        assert str(server.url) == "http://localhost:9000/mcp"

    def test_normalize_generates_id_from_name(self):
        """Test that normalize generates an ID from name if ID is missing."""
        adapter = OfficialMCPRegistryAdapter()
        
        raw_data = {
            "name": "Test Server Name",
            "url": "http://localhost:8000/mcp",
        }
        
        server = adapter.normalize(raw_data)
        assert server is not None
        assert server.id == "test-server-name"


class TestGitHubTopicAdapter:
    """Tests for the GitHub topic adapter."""

    def test_fetch_searches_github_by_topic(self):
        """Test that fetch searches GitHub for repositories by topic."""
        adapter = GitHubTopicAdapter(topic="mcp-server")
        
        mock_response = {
            "items": [
                {
                    "full_name": "user/repo1",
                    "name": "repo1",
                    "description": "An MCP server",
                    "html_url": "https://github.com/user/repo1",
                    "owner": {"login": "user"},
                    "stargazers_count": 42,
                }
            ]
        }
        
        with patch("requests.get") as mock_get:
            mock_get.return_value.json.return_value = mock_response
            mock_get.return_value.raise_for_status = Mock()
            
            repos = adapter.fetch()
            
            assert len(repos) == 1
            assert repos[0]["full_name"] == "user/repo1"

    def test_normalize_creates_server_from_github_repo(self):
        """Test that normalize creates a server from GitHub repo data."""
        adapter = GitHubTopicAdapter()
        
        raw_data = {
            "full_name": "example/mcp-filesystem",
            "name": "mcp-filesystem",
            "description": "Filesystem access via MCP",
            "html_url": "https://github.com/example/mcp-filesystem",
            "owner": {"login": "example"},
            "stargazers_count": 123,
        }
        
        server = adapter.normalize(raw_data)
        
        assert server is not None
        assert server.id == "example-mcp-filesystem"
        assert server.name == "mcp-filesystem"
        assert server.description == "Filesystem access via MCP"
        assert server.status == "reference"
        assert "github" in server.tags
        assert server.metadata["source"] == "github-topic"
        assert server.metadata["repo_url"] == "https://github.com/example/mcp-filesystem"
        assert server.metadata["stars"] == 123


class TestIngestFromSource:
    """Tests for the ingest_from_source function."""

    def test_ingest_adds_new_servers(self):
        """Test that ingest adds new servers to the registry."""
        existing = MCPRegistry(servers=[], metadata={})
        
        mock_source = Mock()
        mock_source.source_id = "test-source"
        mock_source.fetch.return_value = [
            {"id": "new1", "name": "New 1", "url": "http://localhost:8001/mcp"},
            {"id": "new2", "name": "New 2", "url": "http://localhost:8002/mcp"},
        ]
        
        def mock_normalize(data):
            return MCPServer(
                id=data["id"],
                name=data["name"],
                url=data["url"],
                transport="sse",
                auth=MCPAuthConfig(type="none"),
            )
        
        mock_source.normalize = mock_normalize
        
        stats = ingest_from_source(mock_source, existing)
        
        assert stats["servers_added"] == 2
        assert stats["servers_updated"] == 0
        assert stats["servers_total"] == 2
        assert len(stats["errors"]) == 0

    def test_ingest_updates_existing_servers(self):
        """Test that ingest updates existing servers in the registry."""
        existing_server = MCPServer(
            id="existing",
            name="Old Name",
            url="http://localhost:8000/mcp",
            transport="sse",
            description="Old description",
            auth=MCPAuthConfig(type="none"),
        )
        existing = MCPRegistry(servers=[existing_server], metadata={})
        
        mock_source = Mock()
        mock_source.source_id = "test-source"
        mock_source.fetch.return_value = [
            {
                "id": "existing",
                "name": "Updated Name",
                "url": "http://localhost:8000/mcp",
                "description": "New description",
            },
        ]
        
        def mock_normalize(data):
            return MCPServer(
                id=data["id"],
                name=data["name"],
                url=data["url"],
                transport="sse",
                description=data.get("description"),
                auth=MCPAuthConfig(type="none"),
            )
        
        mock_source.normalize = mock_normalize
        
        stats = ingest_from_source(mock_source, existing)
        
        assert stats["servers_added"] == 0
        assert stats["servers_updated"] == 1
        assert stats["servers_total"] == 1
        assert existing.servers[0].name == "Updated Name"
        assert existing.servers[0].description == "New description"

    def test_ingest_skips_invalid_servers(self):
        """Test that ingest skips servers that fail normalization."""
        existing = MCPRegistry(servers=[], metadata={})
        
        mock_source = Mock()
        mock_source.source_id = "test-source"
        mock_source.fetch.return_value = [
            {"id": "valid", "name": "Valid", "url": "http://localhost:8001/mcp"},
            {"id": "invalid", "name": "Invalid"},  # Missing URL
        ]
        
        def mock_normalize(data):
            if "url" not in data:
                return None  # Simulate normalization failure
            return MCPServer(
                id=data["id"],
                name=data["name"],
                url=data["url"],
                transport="sse",
                auth=MCPAuthConfig(type="none"),
            )
        
        mock_source.normalize = mock_normalize
        
        stats = ingest_from_source(mock_source, existing)
        
        assert stats["servers_added"] == 1  # Only valid server added
        assert stats["servers_total"] == 1
        assert existing.servers[0].id == "valid"

    def test_ingest_handles_fetch_errors(self):
        """Test that ingest handles errors during fetch."""
        existing = MCPRegistry(servers=[], metadata={})
        
        mock_source = Mock()
        mock_source.source_id = "failing-source"
        mock_source.fetch.side_effect = requests.RequestException("Network error")
        
        stats = ingest_from_source(mock_source, existing)
        
        assert stats["servers_added"] == 0
        assert stats["servers_updated"] == 0
        assert len(stats["errors"]) == 1
        assert "Network error" in stats["errors"][0]

    def test_ingest_updates_registry_metadata(self):
        """Test that ingest updates registry metadata with sync info."""
        existing = MCPRegistry(servers=[], metadata={})
        
        mock_source = Mock()
        mock_source.source_id = "test-source"
        mock_source.fetch.return_value = []
        
        stats = ingest_from_source(mock_source, existing)
        
        assert "last_sync" in existing.metadata
        assert existing.metadata["last_source"] == "test-source"
