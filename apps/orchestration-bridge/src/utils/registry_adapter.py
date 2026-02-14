"""
Registry adapter for ingesting MCP servers from upstream sources.

This module provides adapters for fetching and normalizing MCP server
definitions from external registries like the official MCP registry.
"""
from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
from pydantic import ValidationError

from ..models import MCPAuthConfig, MCPRegistry, MCPServer

logger = logging.getLogger(__name__)

try:
    import jsonschema
except Exception:  # pragma: no cover
    jsonschema = None


_PINNED_SERVER_SCHEMA_URI = "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json"
_PINNED_SERVER_SCHEMA_BASELINE: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": _PINNED_SERVER_SCHEMA_URI,
    "type": "object",
    "required": ["name", "description", "version"],
    "properties": {
        "$schema": {"type": "string", "format": "uri"},
        "name": {"type": "string", "minLength": 1},
        "description": {"type": "string", "minLength": 1},
        "version": {"type": "string", "minLength": 1},
        "status": {"type": "string", "enum": ["active", "deprecated", "deleted"]},
        "repository": {
            "anyOf": [
                {"type": "string"},
                {
                    "type": "object",
                    "properties": {"url": {"type": "string"}},
                    "additionalProperties": True,
                },
            ]
        },
        "websiteUrl": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "capabilities": {
            "anyOf": [
                {"type": "array", "items": {"type": "string"}},
                {"type": "object", "additionalProperties": True},
            ]
        },
        "remotes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["type", "url"],
                "properties": {
                    "type": {"type": "string", "enum": ["streamable-http", "sse"]},
                    "url": {"type": "string"},
                },
                "additionalProperties": True,
            },
        },
        "packages": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["registryType", "identifier", "version", "transport"],
                "properties": {
                    "registryType": {"type": "string"},
                    "registryBaseUrl": {"type": "string"},
                    "identifier": {"type": "string"},
                    "version": {"type": "string"},
                    "fileSha256": {"type": "string"},
                    "transport": {
                        "type": "object",
                        "required": ["type"],
                        "properties": {
                            "type": {"type": "string", "enum": ["stdio", "streamable-http", "sse"]},
                        },
                        "additionalProperties": True,
                    },
                    "runtimeArguments": {"type": "array"},
                    "packageArguments": {"type": "array"},
                    "environmentVariables": {"type": "array"},
                },
                "additionalProperties": True,
            },
        },
        "_meta": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": True,
}


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


### BEGIN: OfficialMCPRegistryAdapter v0.1 (drop-in replacement)
class OfficialMCPRegistryAdapter(RegistrySource):
    """
    Adapter for the official MCP registry API (v0.1).

    Registry behavior:
      - GET /v0.1/servers returns server identifiers, not full manifests.
      - Full server manifests are fetched via:
          GET /v0.1/servers/{serverName}/versions/latest
      - Remote endpoints are defined under remotes[] with transport type.
      - Package-only servers are skipped for now because MCPServer is remote-first.
    """

    def __init__(
        self,
        url: str = "https://registry.modelcontextprotocol.io/v0.1/servers",
        timeout: int = 30,
        include_deprecated: bool = False,
    ):
        super().__init__(source_id="official", url=url)
        self.timeout = timeout
        self.include_deprecated = include_deprecated

        self._max_retries = 3
        self._retry_backoff_s = 1.0
        self._page_limit = 100
        self._remote_type_preference = ("streamable-http", "sse")
        self._user_agent = "UnifiedAIToolbox/orchestration-bridge registry-ingestor"
        self._latest_fetch_workers = 4
        self._prefer_list_manifest_when_available = True
        self._schema_cache: Dict[str, Dict[str, Any]] = {_PINNED_SERVER_SCHEMA_URI: dict(_PINNED_SERVER_SCHEMA_BASELINE)}
        self._schema_fetch_failures: set[str] = set()

        # Diagnostics only (future packages/stdio support).
        self.packages_only_servers: List[str] = []
        self.skipped_deleted_servers: List[str] = []
        self.skipped_deprecated_servers: List[str] = []

    def _headers(self) -> Dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": self._user_agent,
        }

    def _registry_base_url(self) -> str:
        value = (self.url or "").rstrip("/")
        if value.endswith("/v0.1/servers"):
            return value[: -len("/v0.1/servers")]
        if value.endswith("/v0.1"):
            return value[: -len("/v0.1")]
        if value.endswith("/servers"):
            return value[: -len("/servers")]
        return value

    def _list_endpoint(self) -> str:
        base = self._registry_base_url().rstrip("/")
        return f"{base}/v0.1/servers"

    def _latest_endpoint(self, server_name: str) -> str:
        encoded = quote(server_name, safe="")
        return f"{self._registry_base_url().rstrip('/')}/v0.1/servers/{encoded}/versions/latest"

    def _retry_delay(self, attempt: int, response: Optional[requests.Response] = None) -> float:
        if response is not None:
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                try:
                    return max(float(retry_after), 0.1)
                except ValueError:
                    pass
        return min(self._retry_backoff_s * (2 ** (attempt - 1)), 8.0)

    def _request_json_with_retry(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        last_error: Optional[Exception] = None
        transient_codes = {429, 500, 502, 503, 504}

        for attempt in range(1, self._max_retries + 1):
            response: Optional[requests.Response] = None
            try:
                response = requests.get(
                    url,
                    params=params,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
                if response.status_code in transient_codes:
                    raise requests.HTTPError(
                        f"Transient HTTP {response.status_code} for {url}",
                        response=response,
                    )

                response.raise_for_status()
                return response.json()
            except Exception as exc:
                last_error = exc
                if attempt >= self._max_retries:
                    break
                time.sleep(self._retry_delay(attempt, response=response))

        assert last_error is not None
        raise last_error

    def _extract_server_name(self, item: Any) -> Optional[str]:
        # Common shape: "org/name:1.2.3"
        if isinstance(item, str):
            value = item.strip()
            if not value:
                return None
            if ":" in value:
                return value.rsplit(":", 1)[0]
            return value

        if isinstance(item, dict):
            if isinstance(item.get("server"), dict):
                nested_name = item["server"].get("name")
                if isinstance(nested_name, str) and nested_name.strip():
                    return nested_name.strip()
            candidate = item.get("serverName") or item.get("name") or item.get("id")
            if isinstance(candidate, str) and candidate.strip():
                value = candidate.strip()
                if ":" in value:
                    return value.rsplit(":", 1)[0]
                return value

        return None

    def _fetch_server_entries(self) -> tuple[List[str], Dict[str, Dict[str, Any]]]:
        identifiers: List[str] = []
        prefetched: Dict[str, Dict[str, Any]] = {}
        seen: set[str] = set()
        cursor: Optional[str] = None

        while True:
            params: Dict[str, Any] = {"limit": self._page_limit}
            if cursor:
                params["cursor"] = cursor

            payload = self._request_json_with_retry(self._list_endpoint(), params=params)
            page_items: List[Any] = []
            next_cursor: Optional[str] = None

            if isinstance(payload, list):
                page_items = payload
            elif isinstance(payload, dict):
                maybe_items = payload.get("servers")
                if isinstance(maybe_items, list):
                    page_items = maybe_items
                meta = payload.get("metadata", {})
                if isinstance(meta, dict):
                    nc = meta.get("nextCursor")
                    if isinstance(nc, str) and nc.strip():
                        next_cursor = nc
                if not next_cursor:
                    nc2 = payload.get("nextCursor")
                    if isinstance(nc2, str) and nc2.strip():
                        next_cursor = nc2
            else:
                logger.warning("Unexpected server-list response type from official registry")
                break

            for item in page_items:
                server_name = self._extract_server_name(item)
                if not server_name or server_name in seen:
                    continue
                seen.add(server_name)
                identifiers.append(server_name)
                if self._prefer_list_manifest_when_available:
                    manifest = self._unwrap_manifest(item)
                    if manifest and isinstance(manifest, dict) and manifest.get("name"):
                        prefetched[server_name] = manifest

            if not next_cursor:
                break
            cursor = next_cursor

        return identifiers, prefetched

    def _unwrap_manifest(self, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            return {}
        if "server" in raw and isinstance(raw["server"], dict):
            manifest = dict(raw["server"])
            if "version" not in manifest and isinstance(raw.get("version"), str):
                manifest["version"] = raw["version"]
            if "_meta" not in manifest and isinstance(raw.get("_meta"), dict):
                manifest["_meta"] = raw["_meta"]
            return manifest
        return raw

    def _manifest_has_required_server_fields(self, manifest: Dict[str, Any]) -> bool:
        for field_name in ("name", "description", "version"):
            value = manifest.get(field_name)
            if not isinstance(value, str) or not value.strip():
                return False
        return True

    def _manifest_has_remotes(self, manifest: Dict[str, Any]) -> bool:
        remotes = manifest.get("remotes")
        return isinstance(remotes, list) and len(remotes) > 0

    def _manifest_has_packages(self, manifest: Dict[str, Any]) -> bool:
        packages = manifest.get("packages")
        return isinstance(packages, list) and len(packages) > 0

    def _structured_input_summary(self, manifest: Dict[str, Any]) -> Dict[str, int]:
        summary = {
            "remoteHeaders": 0,
            "remoteInputs": 0,
            "packageRuntimeArguments": 0,
            "packageArguments": 0,
            "packageEnvironmentVariables": 0,
        }

        remotes = manifest.get("remotes")
        if isinstance(remotes, list):
            for remote in remotes:
                if not isinstance(remote, dict):
                    continue
                headers = remote.get("headers")
                if isinstance(headers, dict):
                    summary["remoteHeaders"] += len(headers)
                elif isinstance(headers, list):
                    summary["remoteHeaders"] += len(headers)
                inputs = remote.get("inputs")
                if isinstance(inputs, list):
                    summary["remoteInputs"] += len(inputs)
                elif isinstance(inputs, dict):
                    summary["remoteInputs"] += len(inputs)

        packages = manifest.get("packages")
        if isinstance(packages, list):
            for package in packages:
                if not isinstance(package, dict):
                    continue
                runtime_args = package.get("runtimeArguments")
                if isinstance(runtime_args, list):
                    summary["packageRuntimeArguments"] += len(runtime_args)
                package_args = package.get("packageArguments")
                if isinstance(package_args, list):
                    summary["packageArguments"] += len(package_args)
                env_vars = package.get("environmentVariables")
                if isinstance(env_vars, list):
                    summary["packageEnvironmentVariables"] += len(env_vars)

        return summary

    def _can_use_prefetched_manifest(self, manifest: Dict[str, Any]) -> bool:
        if not isinstance(manifest, dict):
            return False
        if not self._manifest_has_required_server_fields(manifest):
            return False
        return self._manifest_has_remotes(manifest) or self._manifest_has_packages(manifest)

    def _load_schema(self, schema_uri: str) -> Optional[Dict[str, Any]]:
        uri = (schema_uri or "").strip()
        if not uri:
            return None
        if uri in self._schema_cache:
            return self._schema_cache[uri]
        if uri in self._schema_fetch_failures:
            return None
        try:
            payload = self._request_json_with_retry(uri)
            if isinstance(payload, dict):
                self._schema_cache[uri] = payload
                return payload
            self._schema_fetch_failures.add(uri)
            return None
        except Exception as exc:
            logger.debug("Failed to fetch schema '%s': %s", uri, exc)
            self._schema_fetch_failures.add(uri)
            return None

    def _format_schema_error(self, err: Any) -> str:
        path_segments = [str(segment) for segment in getattr(err, "absolute_path", [])]
        path_text = ".".join(path_segments) if path_segments else "$"
        message = getattr(err, "message", str(err))
        return f"{path_text}: {message}"

    def _validate_manifest_schema(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        has_remotes = self._manifest_has_remotes(manifest)
        has_packages = self._manifest_has_packages(manifest)
        has_required = self._manifest_has_required_server_fields(manifest)
        declared_uri = manifest.get("$schema") if isinstance(manifest.get("$schema"), str) else None
        requested_uri = declared_uri or _PINNED_SERVER_SCHEMA_URI
        mode = "manifest" if declared_uri else "baseline"

        schema = self._load_schema(requested_uri)
        schema_uri_used = requested_uri
        if schema is None and requested_uri != _PINNED_SERVER_SCHEMA_URI:
            schema = self._load_schema(_PINNED_SERVER_SCHEMA_URI)
            schema_uri_used = _PINNED_SERVER_SCHEMA_URI
            mode = "manifest_fallback"
        elif schema is None:
            schema = _PINNED_SERVER_SCHEMA_BASELINE
            schema_uri_used = _PINNED_SERVER_SCHEMA_URI
            mode = "baseline_fallback"

        errors: List[str] = []
        validation_ok = True

        if jsonschema is not None:
            try:
                validator_cls = jsonschema.validators.validator_for(schema)
                validator_cls.check_schema(schema)
                validator = validator_cls(schema)
                all_errors = sorted(validator.iter_errors(manifest), key=lambda err: list(err.path))
                if all_errors:
                    validation_ok = False
                    errors = [self._format_schema_error(err) for err in all_errors[:20]]
            except Exception as exc:
                validation_ok = False
                errors = [f"schema validation failed: {exc}"]
        else:
            if not has_required:
                validation_ok = False
                errors = ["missing required fields: name, description, version"]

        unknown_version = False
        if not validation_ok and declared_uri is None and has_required and (has_remotes or has_packages):
            # No explicit schema URI: treat fallback mismatch as unknown-version shape rather than hard invalid.
            unknown_version = True

        return {
            "schemaUri": schema_uri_used,
            "declaredSchemaUri": declared_uri,
            "ok": validation_ok,
            "errors": errors,
            "mode": mode,
            "unknownVersion": unknown_version,
            "hasRemotes": has_remotes,
            "hasPackages": has_packages,
            "hasRequiredFields": has_required,
            "structuredInputs": self._structured_input_summary(manifest),
        }

    def _extract_status(self, server_json: Dict[str, Any]) -> str:
        status = server_json.get("status")
        meta = server_json.get("_meta", {})
        if isinstance(meta, dict):
            official_meta = meta.get("io.modelcontextprotocol.registry/official")
            if not official_meta:
                registry_meta = meta.get("io.modelcontextprotocol.registry")
                if isinstance(registry_meta, dict):
                    official_meta = registry_meta.get("official")
            if isinstance(official_meta, dict) and official_meta.get("status"):
                status = official_meta.get("status")
        return str(status or "active").strip().lower()

    def _pick_remote(self, server_json: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        remotes = server_json.get("remotes")
        if not isinstance(remotes, list):
            return None

        candidates: List[Dict[str, Any]] = []
        for remote in remotes:
            if not isinstance(remote, dict):
                continue
            r_type = remote.get("type")
            r_url = remote.get("url")
            if not isinstance(r_type, str) or not r_type.strip():
                continue
            if not isinstance(r_url, str) or not r_url.strip():
                continue
            candidates.append(remote)

        if not candidates:
            return None

        for preferred_type in self._remote_type_preference:
            for remote in candidates:
                if str(remote.get("type")).strip() == preferred_type:
                    return remote

        # Deterministic fallback: first valid remote in manifest order.
        return candidates[0]

    def _as_str_list(self, value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, dict):
            return [str(k).strip() for k, v in value.items() if v and str(k).strip()]
        return []

    def fetch(self) -> List[Dict[str, Any]]:
        """
        Fetch and expand official registry entries into full manifests.
        """
        logger.info("Fetching MCP server identifiers from official registry: %s", self._list_endpoint())

        manifests: List[Dict[str, Any]] = []
        identifiers, prefetched = self._fetch_server_entries()

        def fetch_one(server_name: str) -> Optional[Dict[str, Any]]:
            prefetched_manifest = prefetched.get(server_name)
            if prefetched_manifest and self._can_use_prefetched_manifest(prefetched_manifest):
                return prefetched_manifest
            try:
                manifest_payload = self._request_json_with_retry(self._latest_endpoint(server_name))
                return self._unwrap_manifest(manifest_payload)
            except Exception as exc:
                logger.warning("Failed to fetch latest manifest for %s: %s", server_name, exc)
                return None

        manifest_by_name: Dict[str, Dict[str, Any]] = {}
        workers = max(1, min(self._latest_fetch_workers, 8))
        if workers == 1 or len(identifiers) <= 1:
            for server_name in identifiers:
                manifest = fetch_one(server_name)
                if manifest:
                    manifest_by_name[server_name] = manifest
        else:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_map = {executor.submit(fetch_one, name): name for name in identifiers}
                for future in as_completed(future_map):
                    server_name = future_map[future]
                    manifest = future.result()
                    if manifest:
                        manifest_by_name[server_name] = manifest

        for server_name in identifiers:
            manifest = manifest_by_name.get(server_name)
            if manifest:
                validation = self._validate_manifest_schema(manifest)
                if not validation["ok"] and not validation["unknownVersion"]:
                    logger.warning(
                        "Skipping non-conformant manifest '%s' (schemaUri=%s): %s",
                        server_name,
                        validation["schemaUri"],
                        "; ".join(validation["errors"][:3]) if validation["errors"] else "schema invalid",
                    )
                    continue
                manifest["_bridge_schema_validation"] = validation
                manifests.append(manifest)

        logger.info(
            "Fetched %d full manifests from official MCP registry (identifiers=%d)",
            len(manifests),
            len(identifiers),
        )
        return manifests

    def normalize(self, raw_data: Dict[str, Any]) -> Optional[MCPServer]:
        """
        Normalize official registry server.json manifest into MCPServer.

        Mapping:
          - id: manifest.name
          - name: manifest.title (fallback manifest.name)
          - url/transport: preferred remote endpoint
          - metadata keeps manifest-level fields for governance/review.
        """
        try:
            manifest = self._unwrap_manifest(raw_data)
            if not manifest:
                return None

            server_id = str(manifest.get("name") or "").strip()
            if not server_id:
                return None

            status = self._extract_status(manifest)
            if status == "deleted":
                self.skipped_deleted_servers.append(server_id)
                return None
            if status == "deprecated" and not self.include_deprecated:
                self.skipped_deprecated_servers.append(server_id)
                return None

            validation = manifest.get("_bridge_schema_validation")
            if not isinstance(validation, dict):
                validation = self._validate_manifest_schema(manifest)

            if not validation.get("ok") and not validation.get("unknownVersion"):
                logger.warning(
                    "Skipping manifest failing schema validation '%s': %s",
                    manifest.get("name", "unknown"),
                    "; ".join(validation.get("errors", [])[:3]) if isinstance(validation.get("errors"), list) else "schema invalid",
                )
                return None

            has_remotes = bool(validation.get("hasRemotes"))
            has_packages = bool(validation.get("hasPackages"))
            remote = self._pick_remote(manifest) if has_remotes else None
            if not remote:
                # packages[] only; current MCPServer model cannot activate local launch config.
                if has_packages:
                    self.packages_only_servers.append(server_id)
                    logger.debug("Skipping packages-only MCP server (no remotes[]): %s", server_id)
                else:
                    logger.warning(
                        "Skipping server '%s': no usable remotes[] and not package-classified",
                        server_id,
                    )
                return None

            repository = manifest.get("repository")
            owner = None
            if isinstance(repository, dict):
                owner = repository.get("url")
            elif isinstance(manifest.get("owner"), str):
                owner = manifest.get("owner")

            server = MCPServer(
                id=server_id,
                name=str(manifest.get("title") or server_id),
                url=str(remote.get("url")).strip(),
                transport=str(remote.get("type")).strip(),
                description=manifest.get("description"),
                tags=self._as_str_list(manifest.get("tags")),
                capabilities=self._as_str_list(manifest.get("capabilities")),
                owner=owner,
                status=status or "active",
                auth=MCPAuthConfig(type="none"),
                metadata={
                    "version": manifest.get("version"),
                    "repository": repository,
                    "websiteUrl": manifest.get("websiteUrl"),
                    "icons": manifest.get("icons"),
                    "_meta": manifest.get("_meta", {}),
                    "remotes": manifest.get("remotes", []),
                    "packages": manifest.get("packages", []),
                    "schema": manifest.get("$schema"),
                    "schemaUri": validation.get("declaredSchemaUri") or validation.get("schemaUri"),
                    "schemaValidation": {
                        "ok": bool(validation.get("ok")),
                        "errors": validation.get("errors", []),
                        "mode": validation.get("mode"),
                        "unknownVersion": bool(validation.get("unknownVersion")),
                        "declaredSchemaUri": validation.get("declaredSchemaUri"),
                        "schemaUriUsed": validation.get("schemaUri"),
                    },
                    "hasRemotes": has_remotes,
                    "hasPackages": has_packages,
                    "hasStructuredInputs": any((validation.get("structuredInputs") or {}).values()),
                    "structuredInputs": validation.get("structuredInputs", {}),
                    "status": status,
                    "source": "official-registry",
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return server

        except (ValidationError, ValueError, TypeError) as exc:
            logger.warning(
                "Failed to normalize official registry server '%s': %s",
                raw_data.get("name", "unknown"),
                exc,
            )
            return None
### END: OfficialMCPRegistryAdapter v0.1 (drop-in replacement)


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
        logger.info("Fetching repositories with topic '%s' from GitHub", self.topic)

        try:
            headers = {}
            token = os.environ.get("GITHUB_TOKEN")
            if token:
                headers["Authorization"] = f"token {token}"

            response = requests.get(self.url, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            repos = data.get("items", [])
            logger.info("Found %d repositories with topic '%s'", len(repos), self.topic)
            return repos

        except requests.RequestException as exc:
            logger.error("Failed to fetch from GitHub: %s", exc)
            raise

    def normalize(self, raw_data: Dict[str, Any]) -> Optional[MCPServer]:
        """
        Normalize GitHub repository data to MCPServer.

        This is a best-effort conversion since GitHub repos may not have
        full MCP server metadata.
        """
        try:
            repo_name = raw_data.get("full_name", "")
            server_id = repo_name.replace("/", "-").lower()

            server = MCPServer(
                id=server_id,
                name=raw_data.get("name", "Unnamed Server"),
                url="http://localhost:8000/mcp",
                transport="sse",
                description=raw_data.get("description"),
                tags=["github", "community"],
                capabilities=[],
                owner=raw_data.get("owner", {}).get("login"),
                status="reference",
                auth=MCPAuthConfig(type="none"),
                metadata={
                    "source": "github-topic",
                    "repo_url": raw_data.get("html_url"),
                    "stars": raw_data.get("stargazers_count", 0),
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return server

        except (ValidationError, ValueError) as exc:
            logger.warning(
                "Failed to normalize GitHub repo '%s': %s",
                raw_data.get("full_name", "unknown"),
                exc,
            )
            return None


def ingest_from_source(
    source: RegistrySource,
    existing_registry: Optional[MCPRegistry] = None,
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
        "errors": [],
    }

    try:
        raw_servers = source.fetch()
        existing_ids = {server.id for server in existing_registry.servers}

        for raw_server in raw_servers:
            normalized = source.normalize(raw_server)
            if not normalized:
                continue

            if normalized.id in existing_ids:
                for index, existing in enumerate(existing_registry.servers):
                    if existing.id == normalized.id:
                        existing_registry.servers[index] = normalized
                        stats["servers_updated"] += 1
                        break
            else:
                existing_registry.servers.append(normalized)
                existing_ids.add(normalized.id)
                stats["servers_added"] += 1

        stats["servers_total"] = len(existing_registry.servers)
        existing_registry.metadata["last_sync"] = datetime.now(timezone.utc).isoformat()
        existing_registry.metadata["last_source"] = str(source.source_id)
        if hasattr(source, "packages_only_servers"):
            skipped_packages = len(getattr(source, "packages_only_servers", []))
            if skipped_packages:
                logger.warning(
                    "Skipped %d packages-only servers from source '%s' (metadata-only for now)",
                    skipped_packages,
                    source.source_id,
                )
                existing_registry.metadata.setdefault("skipped_packages_only", {})[str(source.source_id)] = skipped_packages

        logger.info(
            "Ingestion complete: %d added, %d updated, %d total",
            stats["servers_added"],
            stats["servers_updated"],
            stats["servers_total"],
        )

    except Exception as exc:
        error_msg = f"Ingestion failed from {source.source_id}: {exc}"
        logger.error(error_msg)
        stats["errors"].append(error_msg)

    return stats
