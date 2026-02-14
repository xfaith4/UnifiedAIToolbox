"""
Tests for MCP registry adapter and ingestion functionality.
"""
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import requests

# Make src importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models import MCPAuthConfig, MCPRegistry, MCPServer  # noqa: E402
from src.utils.registry_adapter import (  # noqa: E402
    GitHubTopicAdapter,
    OfficialMCPRegistryAdapter,
    ingest_from_source,
)


class TestOfficialMCPRegistryAdapter:
    """Tests for official MCP registry v0.1 adapter behavior."""

    def test_fetch_paginates_identifiers_and_fetches_latest_manifests(self):
        adapter = OfficialMCPRegistryAdapter()

        def make_response(status_code: int, payload):
            response = Mock()
            response.status_code = status_code
            response.headers = {}
            response.json.return_value = payload
            response.raise_for_status = Mock()
            return response

        def side_effect(url, params=None, headers=None, timeout=None):  # noqa: ARG001
            if url.endswith("/v0.1/servers"):
                cursor = (params or {}).get("cursor")
                if not cursor:
                    return make_response(
                        200,
                        {
                            "servers": ["org/server-a:1.2.3"],
                            "metadata": {"nextCursor": "cursor-2"},
                        },
                    )
                return make_response(
                    200,
                    {
                        "servers": ["org/server-b:9.9.9"],
                        "metadata": {},
                    },
                )
            if url.endswith("/v0.1/servers/org%2Fserver-a/versions/latest"):
                return make_response(
                    200,
                    {
                        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
                        "name": "org/server-a",
                        "title": "Server A",
                        "description": "A server",
                        "version": "1.2.3",
                        "remotes": [{"type": "streamable-http", "url": "https://a.example/mcp"}],
                    },
                )
            if url.endswith("/v0.1/servers/org%2Fserver-b/versions/latest"):
                return make_response(
                    200,
                    {
                        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
                        "name": "org/server-b",
                        "title": "Server B",
                        "description": "B server",
                        "version": "9.9.9",
                        "remotes": [{"type": "sse", "url": "https://b.example/sse"}],
                    },
                )
            raise AssertionError(f"unexpected URL: {url}")

        with patch("requests.get", side_effect=side_effect) as mock_get:
            manifests = adapter.fetch()

        assert len(manifests) == 2
        assert manifests[0]["name"] == "org/server-a"
        assert manifests[1]["name"] == "org/server-b"
        assert manifests[0]["_bridge_schema_validation"]["hasRemotes"] is True
        assert manifests[1]["_bridge_schema_validation"]["ok"] is True
        # One list request per page + one latest fetch per identifier
        assert mock_get.call_count == 4

    def test_fetch_accepts_list_items_with_nested_server_objects(self):
        adapter = OfficialMCPRegistryAdapter()

        def make_response(payload):
            response = Mock()
            response.status_code = 200
            response.headers = {}
            response.json.return_value = payload
            response.raise_for_status = Mock()
            return response

        def side_effect(url, params=None, headers=None, timeout=None):  # noqa: ARG001
            if url.endswith("/v0.1/servers"):
                return make_response(
                    {
                        "servers": [{"server": {"name": "org/server-c"}}],
                        "metadata": {},
                    }
                )
            if url.endswith("/v0.1/servers/org%2Fserver-c/versions/latest"):
                return make_response(
                    {
                        "name": "org/server-c",
                        "title": "Server C",
                        "description": "C server",
                        "version": "0.1.0",
                        "remotes": [{"type": "streamable-http", "url": "https://c.example/mcp"}],
                    }
                )
            raise AssertionError(f"unexpected URL: {url}")

        with patch("requests.get", side_effect=side_effect):
            manifests = adapter.fetch()

        assert len(manifests) == 1
        assert manifests[0]["name"] == "org/server-c"
        assert manifests[0]["_bridge_schema_validation"]["hasRemotes"] is True

    def test_fetch_skips_non_conformant_non_server_json(self):
        adapter = OfficialMCPRegistryAdapter()

        def make_response(payload):
            response = Mock()
            response.status_code = 200
            response.headers = {}
            response.json.return_value = payload
            response.raise_for_status = Mock()
            return response

        def side_effect(url, params=None, headers=None, timeout=None):  # noqa: ARG001
            if url.endswith("/v0.1/servers"):
                return make_response({"servers": ["org/not-a-server:0.0.1"], "metadata": {}})
            if url.endswith("/v0.1/servers/org%2Fnot-a-server/versions/latest"):
                return make_response({"foo": "bar", "random": {"shape": True}})
            raise AssertionError(f"unexpected URL: {url}")

        with patch("requests.get", side_effect=side_effect):
            manifests = adapter.fetch()

        assert manifests == []

    def test_normalize_prefers_streamable_http_then_sse(self):
        adapter = OfficialMCPRegistryAdapter()
        raw_data = {
            "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
            "name": "org/files",
            "title": "Files",
            "description": "File server",
            "remotes": [
                {"type": "sse", "url": "https://example.com/sse"},
                {"type": "streamable-http", "url": "https://example.com/mcp"},
            ],
            "version": "1.0.0",
            "repository": {"url": "https://github.com/org/files"},
            "websiteUrl": "https://example.com",
            "icons": [{"src": "https://example.com/icon.png"}],
            "_meta": {"io.modelcontextprotocol.registry/official": {"status": "active"}},
        }

        server = adapter.normalize(raw_data)

        assert server is not None
        assert server.id == "org/files"
        assert server.name == "Files"
        assert str(server.url) == "https://example.com/mcp"
        assert server.transport == "streamable-http"
        assert server.status == "active"
        assert server.auth.type == "none"
        assert server.metadata["version"] == "1.0.0"
        assert server.metadata["repository"]["url"] == "https://github.com/org/files"
        assert server.metadata["websiteUrl"] == "https://example.com"
        assert isinstance(server.metadata["remotes"], list)
        assert server.metadata["schemaUri"] == "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json"
        assert server.metadata["schemaValidation"]["ok"] is True
        assert server.metadata["hasRemotes"] is True
        assert server.metadata["hasPackages"] is False

    def test_normalize_skips_deleted_and_packages_only(self):
        adapter = OfficialMCPRegistryAdapter()

        deleted = adapter.normalize(
            {
                "name": "org/deleted",
                "description": "Deleted server",
                "version": "0.0.1",
                "_meta": {"io.modelcontextprotocol.registry/official": {"status": "deleted"}},
                "remotes": [{"type": "streamable-http", "url": "https://example.com/mcp"}],
            }
        )
        packages_only = adapter.normalize(
            {
                "name": "org/package-only",
                "description": "Package only server",
                "version": "1.0.0",
                "packages": [
                    {
                        "registryType": "npm",
                        "identifier": "@org/server",
                        "version": "1.0.0",
                        "transport": {"type": "stdio"},
                    }
                ],
            }
        )

        assert deleted is None
        assert packages_only is None
        assert "org/deleted" in adapter.skipped_deleted_servers
        assert "org/package-only" in adapter.packages_only_servers

    def test_normalize_skips_deprecated_by_default(self):
        adapter = OfficialMCPRegistryAdapter()
        raw_data = {
            "name": "org/old",
            "description": "Old server",
            "version": "0.9.0",
            "_meta": {"io.modelcontextprotocol.registry/official": {"status": "deprecated"}},
            "remotes": [{"type": "sse", "url": "https://example.com/sse"}],
        }
        assert adapter.normalize(raw_data) is None

        include_deprecated = OfficialMCPRegistryAdapter(include_deprecated=True)
        server = include_deprecated.normalize(raw_data)
        assert server is not None
        assert server.status == "deprecated"

    def test_normalize_manifest_schema_uri_and_structured_inputs_metadata(self):
        adapter = OfficialMCPRegistryAdapter()
        raw_data = {
            "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
            "name": "org/structured",
            "title": "Structured",
            "description": "Server with structured remote/package inputs",
            "version": "1.0.0",
            "remotes": [
                {
                    "type": "streamable-http",
                    "url": "https://structured.example/mcp",
                    "headers": {"x-api-key": {"type": "string"}},
                    "inputs": [{"name": "workspaceId", "type": "string"}],
                }
            ],
            "packages": [
                {
                    "registryType": "npm",
                    "identifier": "@org/structured",
                    "version": "1.0.0",
                    "transport": {"type": "stdio"},
                    "runtimeArguments": [{"name": "--readonly", "value": "true"}],
                    "environmentVariables": [{"name": "DEBUG", "value": "0"}],
                }
            ],
        }

        server = adapter.normalize(raw_data)

        assert server is not None
        assert server.metadata["schemaUri"] == raw_data["$schema"]
        assert server.metadata["schemaValidation"]["ok"] is True
        assert server.metadata["hasRemotes"] is True
        assert server.metadata["hasPackages"] is True
        assert server.metadata["hasStructuredInputs"] is True
        assert server.metadata["structuredInputs"]["remoteHeaders"] >= 1
        assert server.metadata["structuredInputs"]["remoteInputs"] >= 1
        assert server.metadata["structuredInputs"]["packageRuntimeArguments"] >= 1

    def test_fetch_retries_transient_errors(self):
        adapter = OfficialMCPRegistryAdapter()

        response_429 = Mock()
        response_429.status_code = 429
        response_429.headers = {}
        response_429.raise_for_status = Mock()

        response_ok = Mock()
        response_ok.status_code = 200
        response_ok.headers = {}
        response_ok.raise_for_status = Mock()
        response_ok.json.return_value = {"servers": [], "metadata": {}}

        with patch("requests.get", side_effect=[response_429, response_ok]) as mock_get:
            manifests = adapter.fetch()

        assert manifests == []
        assert mock_get.call_count == 2


class TestGitHubTopicAdapter:
    """Tests for optional GitHub topic adapter."""

    def test_normalize_creates_server_from_github_repo(self):
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
    """Tests for ingest_from_source merge behavior."""

    def test_ingest_adds_and_updates_servers(self):
        existing = MCPRegistry(
            servers=[
                MCPServer(
                    id="existing",
                    name="Old",
                    url="http://localhost:8000/mcp",
                    transport="sse",
                    auth=MCPAuthConfig(type="none"),
                )
            ],
            metadata={},
        )

        source = Mock()
        source.source_id = "test-source"
        source.fetch.return_value = [{"id": "existing"}, {"id": "new"}]

        def normalize(raw):
            if raw["id"] == "existing":
                return MCPServer(
                    id="existing",
                    name="Updated",
                    url="http://localhost:8000/mcp",
                    transport="sse",
                    auth=MCPAuthConfig(type="none"),
                )
            return MCPServer(
                id="new",
                name="New",
                url="http://localhost:8001/mcp",
                transport="sse",
                auth=MCPAuthConfig(type="none"),
            )

        source.normalize = normalize

        stats = ingest_from_source(source, existing)

        assert stats["servers_added"] == 1
        assert stats["servers_updated"] == 1
        assert stats["servers_total"] == 2
        assert existing.metadata["last_source"] == "test-source"

    def test_ingest_handles_fetch_errors(self):
        existing = MCPRegistry(servers=[], metadata={})
        source = Mock()
        source.source_id = "failing-source"
        source.fetch.side_effect = requests.RequestException("Network error")

        stats = ingest_from_source(source, existing)

        assert stats["servers_added"] == 0
        assert stats["servers_updated"] == 0
        assert len(stats["errors"]) == 1
        assert "Network error" in stats["errors"][0]
