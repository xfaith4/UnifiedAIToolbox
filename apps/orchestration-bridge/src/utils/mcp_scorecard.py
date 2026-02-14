"""
MCP server scorecard probing and governance pipeline.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests

from ..config import settings
from ..models import MCPServer
from .files import write_json_file
from .mcp_registry import load_registry

logger = logging.getLogger(__name__)

try:
    import jsonschema
except Exception:  # pragma: no cover
    jsonschema = None


@dataclass
class ProbeOutcome:
    handshake_ok: bool = False
    tools_list_ok: bool = False
    connect_latency_ms: Optional[int] = None
    tools_list_latency_ms: Optional[int] = None
    total_latency_ms: int = 0
    tools_payload: Any = None
    tools: List[Dict[str, Any]] = field(default_factory=list)
    attempts: int = 1
    http_status_code: Optional[int] = None
    error_class: Optional[str] = None
    error_message: Optional[str] = None
    transient: bool = False
    timeout: bool = False
    rate_limited: bool = False
    protocol_violation: bool = False
    structured_error: bool = False
    details: Dict[str, Any] = field(default_factory=dict)


class MCPProbeTransportClient:
    """Transport probe abstraction for MCP servers."""

    def probe_once(self, server: MCPServer, timeout_ms: int) -> ProbeOutcome:
        raise NotImplementedError


class HTTPMCPProbeTransportClient(MCPProbeTransportClient):
    """HTTP/SSE probe implementation for tools/list-only introspection."""

    def __init__(self, user_agent: str = "UnifiedAIToolbox/orchestration-bridge mcp-scorecard"):
        self.user_agent = user_agent

    def _headers_json(self) -> Dict[str, str]:
        return {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": self.user_agent,
        }

    def _headers_sse(self) -> Dict[str, str]:
        return {
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
            "User-Agent": self.user_agent,
        }

    def _parse_json_or_sse(self, response: requests.Response) -> Tuple[Optional[Any], bool]:
        try:
            return response.json(), False
        except ValueError:
            pass
        for line in (response.text or "").splitlines():
            if not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            if not payload:
                continue
            try:
                return json.loads(payload), False
            except ValueError:
                continue
        return None, True

    def _post_jsonrpc(self, url: str, payload: Dict[str, Any], timeout_s: float) -> Tuple[Optional[Any], ProbeOutcome]:
        out = ProbeOutcome()
        try:
            resp = requests.post(url, headers=self._headers_json(), json=payload, timeout=timeout_s)
            out.http_status_code = resp.status_code
            out.rate_limited = resp.status_code == 429
            out.transient = resp.status_code in {429, 500, 502, 503, 504}
            body, protocol_violation = self._parse_json_or_sse(resp)
            out.protocol_violation = protocol_violation
            if resp.status_code >= 400:
                out.error_class = "HTTPError"
                out.error_message = f"HTTP {resp.status_code}"
                if isinstance(body, dict) and isinstance(body.get("error"), dict):
                    out.structured_error = True
                    message = body["error"].get("message")
                    if message:
                        out.error_message = str(message)
                return body, out
            return body, out
        except requests.Timeout as exc:
            out.error_class = exc.__class__.__name__
            out.error_message = str(exc) or "Request timed out"
            out.timeout = True
            out.transient = True
            return None, out
        except requests.RequestException as exc:
            out.error_class = exc.__class__.__name__
            out.error_message = str(exc) or exc.__class__.__name__
            return None, out

    def _extract_tools(self, payload: Any) -> Tuple[List[Dict[str, Any]], bool]:
        if isinstance(payload, dict):
            if isinstance(payload.get("result"), dict):
                tools = payload["result"].get("tools")
                if isinstance(tools, list):
                    return [x for x in tools if isinstance(x, dict)], False
            if isinstance(payload.get("tools"), list):
                return [x for x in payload["tools"] if isinstance(x, dict)], False
        return [], True

    def _probe_streamable_http(self, server: MCPServer, timeout_s: float) -> ProbeOutcome:
        start = time.perf_counter()
        outcome = ProbeOutcome()

        init_req = {
            "jsonrpc": "2.0",
            "id": "scorecard-init",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "UnifiedAIToolbox Scorecard", "version": "1.0"},
            },
        }
        connect_start = time.perf_counter()
        _, init_out = self._post_jsonrpc(str(server.url), init_req, timeout_s)
        outcome.connect_latency_ms = int((time.perf_counter() - connect_start) * 1000)
        outcome.http_status_code = init_out.http_status_code
        outcome.rate_limited = init_out.rate_limited
        outcome.transient = init_out.transient
        outcome.timeout = init_out.timeout
        outcome.protocol_violation = init_out.protocol_violation
        outcome.error_class = init_out.error_class
        outcome.error_message = init_out.error_message
        outcome.structured_error = init_out.structured_error
        if init_out.error_class:
            outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
            return outcome

        outcome.handshake_ok = True
        tools_req = {"jsonrpc": "2.0", "id": "scorecard-tools", "method": "tools/list", "params": {}}
        list_start = time.perf_counter()
        payload, tools_out = self._post_jsonrpc(str(server.url), tools_req, timeout_s)
        outcome.tools_list_latency_ms = int((time.perf_counter() - list_start) * 1000)
        outcome.tools_payload = payload
        outcome.http_status_code = tools_out.http_status_code or outcome.http_status_code
        outcome.rate_limited = outcome.rate_limited or tools_out.rate_limited
        outcome.transient = outcome.transient or tools_out.transient
        outcome.timeout = outcome.timeout or tools_out.timeout
        outcome.protocol_violation = outcome.protocol_violation or tools_out.protocol_violation
        outcome.error_class = tools_out.error_class or outcome.error_class
        outcome.error_message = tools_out.error_message or outcome.error_message
        outcome.structured_error = outcome.structured_error or tools_out.structured_error
        if tools_out.error_class:
            outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
            return outcome

        tools, protocol_violation = self._extract_tools(payload)
        outcome.tools = tools
        outcome.protocol_violation = outcome.protocol_violation or protocol_violation
        outcome.tools_list_ok = not protocol_violation
        outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
        return outcome

    def _probe_sse(self, server: MCPServer, timeout_s: float) -> ProbeOutcome:
        start = time.perf_counter()
        outcome = ProbeOutcome()
        connect_start = time.perf_counter()
        message_endpoint = None
        try:
            with requests.get(
                str(server.url),
                headers=self._headers_sse(),
                timeout=timeout_s,
                stream=True,
            ) as resp:
                outcome.http_status_code = resp.status_code
                outcome.rate_limited = resp.status_code == 429
                outcome.transient = resp.status_code in {429, 500, 502, 503, 504}
                outcome.connect_latency_ms = int((time.perf_counter() - connect_start) * 1000)
                if resp.status_code >= 400:
                    outcome.error_class = "HTTPError"
                    outcome.error_message = f"HTTP {resp.status_code}"
                    outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
                    return outcome
                outcome.handshake_ok = True
                seen = 0
                for raw in resp.iter_lines(decode_unicode=True):
                    if raw is None:
                        continue
                    seen += 1
                    if seen > 20:
                        break
                    line = raw.strip()
                    if not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :].strip()
                    if not payload:
                        continue
                    try:
                        parsed = json.loads(payload)
                    except ValueError:
                        continue
                    if isinstance(parsed, dict):
                        endpoint = parsed.get("endpoint") or parsed.get("url")
                        if isinstance(endpoint, str) and endpoint.strip():
                            message_endpoint = urljoin(str(server.url), endpoint.strip())
                            break
        except requests.Timeout as exc:
            outcome.error_class = exc.__class__.__name__
            outcome.error_message = str(exc) or "Request timed out"
            outcome.timeout = True
            outcome.transient = True
            outcome.connect_latency_ms = int((time.perf_counter() - connect_start) * 1000)
            outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
            return outcome
        except requests.RequestException as exc:
            outcome.error_class = exc.__class__.__name__
            outcome.error_message = str(exc) or exc.__class__.__name__
            outcome.connect_latency_ms = int((time.perf_counter() - connect_start) * 1000)
            outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
            return outcome

        # TODO: replace with shared MCP SSE client when available.
        target = message_endpoint or str(server.url)
        outcome.details["message_endpoint"] = target
        list_start = time.perf_counter()
        payload, tools_out = self._post_jsonrpc(
            target,
            {"jsonrpc": "2.0", "id": "scorecard-tools-sse", "method": "tools/list", "params": {}},
            timeout_s,
        )
        outcome.tools_list_latency_ms = int((time.perf_counter() - list_start) * 1000)
        outcome.tools_payload = payload
        outcome.http_status_code = tools_out.http_status_code or outcome.http_status_code
        outcome.rate_limited = outcome.rate_limited or tools_out.rate_limited
        outcome.transient = outcome.transient or tools_out.transient
        outcome.timeout = outcome.timeout or tools_out.timeout
        outcome.protocol_violation = outcome.protocol_violation or tools_out.protocol_violation
        outcome.error_class = tools_out.error_class or outcome.error_class
        outcome.error_message = tools_out.error_message or outcome.error_message
        outcome.structured_error = outcome.structured_error or tools_out.structured_error
        if not tools_out.error_class:
            tools, protocol_violation = self._extract_tools(payload)
            outcome.tools = tools
            outcome.protocol_violation = outcome.protocol_violation or protocol_violation
            outcome.tools_list_ok = not protocol_violation
        outcome.total_latency_ms = int((time.perf_counter() - start) * 1000)
        return outcome

    def probe_once(self, server: MCPServer, timeout_ms: int) -> ProbeOutcome:
        timeout_s = max(timeout_ms / 1000.0, 0.1)
        transport = str(server.transport or "").strip().lower()
        if transport == "streamable-http":
            return self._probe_streamable_http(server, timeout_s)
        if transport == "sse":
            return self._probe_sse(server, timeout_s)
        return ProbeOutcome(
            error_class="UnsupportedTransport",
            error_message=f"Unsupported transport: {server.transport}",
            protocol_violation=True,
        )


### BEGIN: MCPScorecardService (drop-in replacement)
class MCPScorecardService:
    """Runs allowlisted MCP probes and writes scorecard/allowlist artifacts."""

    def __init__(
        self,
        registry_path: Optional[Path] = None,
        allowlist_path: Optional[Path] = None,
        scorecard_path: Optional[Path] = None,
        runs_dir: Optional[Path] = None,
        probe_client: Optional[MCPProbeTransportClient] = None,
    ):
        self.registry_path = Path(registry_path or settings.mcp_registry_path)
        self.allowlist_path = Path(allowlist_path or settings.mcp_allowlist_path)
        self.scorecard_path = Path(scorecard_path or settings.mcp_scorecard_path)
        self.runs_dir = Path(runs_dir or settings.mcp_scorecard_runs_dir)
        self.probe_client = probe_client or HTTPMCPProbeTransportClient()

        self.allowlist_path.parent.mkdir(parents=True, exist_ok=True)
        self.scorecard_path.parent.mkdir(parents=True, exist_ok=True)
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def run_probe(
        self,
        server_ids: Optional[List[str]] = None,
        run_id: Optional[str] = None,
        allowlisted_only: Optional[bool] = None,
        discovery_only: bool = False,
        max_servers: Optional[int] = None,
        timeout_ms: Optional[int] = None,
        retries: Optional[int] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        write_markdown: bool = True,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        run_id = run_id or f"mcp-scorecard-{now.strftime('%Y%m%dT%H%M%SZ')}"
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        events_path = run_dir / "events.jsonl"

        timeout_ms = timeout_ms if timeout_ms is not None else int(settings.mcp_scorecard_timeout_ms)
        retries = retries if retries is not None else int(settings.mcp_scorecard_retries)
        max_servers = max_servers if max_servers is not None else int(settings.mcp_scorecard_max_servers)
        allowlisted_only = (
            allowlisted_only
            if allowlisted_only is not None
            else bool(settings.mcp_scorecard_allowlisted_only)
        )

        registry = load_registry(self.registry_path, allow_missing=True)
        allowlist_payload = self._load_allowlist()
        allowlist_map = {
            str(item.get("id")): item
            for item in allowlist_payload.get("servers", [])
            if isinstance(item, dict) and item.get("id")
        }

        servers = sorted(registry.servers, key=lambda item: item.id)
        if server_ids:
            target_ids = set(server_ids)
            servers = [server for server in servers if server.id in target_ids]
        if max_servers > 0 and len(servers) > max_servers:
            servers = servers[:max_servers]

        self._emit_event(
            events_path,
            progress_callback,
            event="mcp_scorecard_phase",
            phase="discovery",
            status="start",
            run_id=run_id,
            total_candidates=len(servers),
        )

        entries: List[Dict[str, Any]] = []
        latency_samples: List[int] = []

        for index, server in enumerate(servers, start=1):
            allowlist_entry = allowlist_map.get(server.id)
            allowlisted = bool(allowlist_entry and allowlist_entry.get("allowed"))
            status = str(server.status or "").lower()
            blocked_reasons: List[str] = []

            if status == "deleted":
                blocked_reasons.append("REGISTRY_STATUS_DELETED")
            if allowlisted_only and not allowlisted:
                blocked_reasons.append("NOT_ALLOWLISTED")
            if discovery_only and not allowlisted:
                blocked_reasons.append("DISCOVERY_ONLY")

            self._emit_event(
                events_path,
                progress_callback,
                event="mcp_scorecard_probe",
                phase="probe",
                status="start",
                run_id=run_id,
                server_id=server.id,
                server_index=index,
                server_total=len(servers),
            )

            started_at = datetime.now(timezone.utc)
            outcome = ProbeOutcome()
            if blocked_reasons:
                outcome.error_class = "Blocked"
                outcome.error_message = ",".join(blocked_reasons)
            else:
                outcome = self._probe_with_retries(server, timeout_ms=timeout_ms, retries=retries)

            server_dir = run_dir / "servers" / self._safe_server_slug(server.id)
            server_dir.mkdir(parents=True, exist_ok=True)
            tool_list_path, timing_path, errors_path = self._write_probe_receipts(
                server_dir=server_dir,
                server=server,
                outcome=outcome,
            )

            schema_rows, schema_stats = self._capture_tool_schemas(
                server=server,
                tools=outcome.tools,
                events_path=events_path,
                progress_callback=progress_callback,
                run_id=run_id,
            )

            minimum_gate = self._minimum_gate(
                server=server,
                allowlisted=allowlisted,
                allowlisted_only=allowlisted_only,
                blocked_reasons=blocked_reasons,
                outcome=outcome,
                schema_rows=schema_rows,
            )
            risk_flags = self._collect_risk_flags(
                server=server,
                allowlisted=allowlisted,
                outcome=outcome,
                schema_stats=schema_stats,
                tools=outcome.tools,
            )
            scoring = self._score_server(
                server=server,
                allowlisted=allowlisted,
                allowlist_entry=allowlist_entry,
                minimum_gate=minimum_gate,
                outcome=outcome,
                schema_stats=schema_stats,
                risk_flags=risk_flags,
            )
            recommendation = self._recommendation(scoring["totalScore"], minimum_gate["pass"])
            explain = self._build_explain_lines(
                server=server,
                outcome=outcome,
                schema_stats=schema_stats,
                recommendation=recommendation,
            )

            ended_at = datetime.now(timezone.utc)
            entry = {
                "server": {
                    "id": server.id,
                    "title": server.name,
                    "version": server.metadata.get("version"),
                    "registrySource": server.metadata.get("source", "registry"),
                    "registryStatus": server.status,
                    "transport": server.transport,
                    "endpoint": str(server.url),
                    "repositoryUrl": self._repo_url(server),
                    "websiteUrl": server.metadata.get("websiteUrl"),
                },
                "probe": {
                    "startedAt": started_at.isoformat(),
                    "endedAt": ended_at.isoformat(),
                    "durationMs": int((ended_at - started_at).total_seconds() * 1000),
                    "attempts": outcome.attempts,
                    "result": "ok"
                    if outcome.tools_list_ok and minimum_gate["pass"]
                    else ("blocked" if not minimum_gate["pass"] else "failed"),
                    "http": {
                        "statusCode": outcome.http_status_code,
                        "errorClass": outcome.error_class,
                    },
                },
                "introspection": {
                    "tools": {
                        "count": len(outcome.tools),
                        "names": [t.get("name") for t in outcome.tools if t.get("name")],
                        "schemas": schema_rows,
                        "schemaStats": schema_stats,
                    },
                    "serverInfo": {
                        "declaredCapabilities": list(server.capabilities),
                        "declaredTags": list(server.tags),
                        "declaredAuthHints": self._declared_auth_hints(server),
                        "rawManifestHash": self._manifest_hash(server),
                        "schemaUri": server.metadata.get("schemaUri") or server.metadata.get("schema"),
                        "schemaValidation": server.metadata.get("schemaValidation"),
                        "hasRemotes": bool(server.metadata.get("hasRemotes")),
                        "hasPackages": bool(server.metadata.get("hasPackages")),
                        "hasStructuredInputs": bool(server.metadata.get("hasStructuredInputs")),
                    },
                },
                "metrics": {
                    "latencyMs": {
                        "connect": outcome.connect_latency_ms,
                        "toolsList": outcome.tools_list_latency_ms,
                        "total": outcome.total_latency_ms,
                    },
                    "reliability": {
                        "successRate": 1.0 if outcome.tools_list_ok else 0.0,
                        "errorRate": 0.0 if outcome.tools_list_ok else 1.0,
                        "timeouts": 1 if outcome.timeout else 0,
                        "rateLimited": 1 if outcome.rate_limited else 0,
                    },
                },
                "governance": {
                    "minimumGate": minimum_gate,
                    "riskFlags": risk_flags,
                    "recommendation": recommendation,
                },
                "scoring": scoring,
                "receipts": {
                    "toolListRawPath": str(tool_list_path) if tool_list_path else None,
                    "errorsRawPath": str(errors_path) if errors_path else None,
                    "timingsRawPath": str(timing_path) if timing_path else None,
                },
                "explain": explain,
            }
            entries.append(entry)
            if outcome.total_latency_ms:
                latency_samples.append(outcome.total_latency_ms)

            self._emit_event(
                events_path,
                progress_callback,
                event="mcp_scorecard_probe",
                phase="probe",
                status="end",
                run_id=run_id,
                server_id=server.id,
                result=entry["probe"]["result"],
                attempts=outcome.attempts,
            )
            self._emit_event(
                events_path,
                progress_callback,
                event="mcp_scorecard_score",
                phase="score",
                status="computed",
                run_id=run_id,
                server_id=server.id,
                total_score=scoring["totalScore"],
                tier=recommendation["tier"],
                decision=recommendation["decision"],
            )

        summary = self._build_summary(entries, latency_samples)
        scorecard_payload = {
            "schemaVersion": "mcp-scorecard-1.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "runId": run_id,
            "probeConfig": {
                "mode": "tools_list_only",
                "maxServers": max_servers,
                "timeoutMs": timeout_ms,
                "retries": retries,
                "transportPreference": ["streamable-http", "sse"],
                "allowlistedOnly": allowlisted_only,
                "discoveryOnly": discovery_only,
            },
            "servers": entries,
            "summary": summary,
        }
        run_scorecard_path = run_dir / "servers.scorecard.json"
        write_json_file(scorecard_payload, run_scorecard_path)
        write_json_file(scorecard_payload, self.scorecard_path)

        allowlist_output = self._build_allowlist_output(allowlist_payload, entries)
        run_allowlist_path = run_dir / "servers.allowlist.json"
        write_json_file(allowlist_output, run_allowlist_path)
        write_json_file(allowlist_output, self.allowlist_path)

        markdown_path: Optional[Path] = None
        if write_markdown:
            markdown_path = run_dir / "probe-report.md"
            markdown_path.write_text(self._render_markdown(scorecard_payload), encoding="utf-8")

        self._emit_event(
            events_path,
            progress_callback,
            event="mcp_scorecard_phase",
            phase="discovery",
            status="end",
            run_id=run_id,
            summary=summary,
        )

        return {
            "run_id": run_id,
            "scorecard_path": str(run_scorecard_path),
            "allowlist_path": str(run_allowlist_path),
            "events_path": str(events_path),
            "markdown_path": str(markdown_path) if markdown_path else None,
            "summary": summary,
        }

    def _load_allowlist(self) -> Dict[str, Any]:
        if not self.allowlist_path.exists():
            return {
                "schemaVersion": "mcp-allowlist-1.0",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "defaultPolicy": "deny",
                "servers": [],
            }
        try:
            payload = json.loads(self.allowlist_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Allowlist must be an object")
            payload.setdefault("schemaVersion", "mcp-allowlist-1.0")
            payload.setdefault("defaultPolicy", "deny")
            payload.setdefault("servers", [])
            return payload
        except Exception as exc:
            logger.warning("Failed to load allowlist from %s: %s", self.allowlist_path, exc)
            return {
                "schemaVersion": "mcp-allowlist-1.0",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "defaultPolicy": "deny",
                "servers": [],
            }

    def _probe_with_retries(self, server: MCPServer, timeout_ms: int, retries: int) -> ProbeOutcome:
        attempts = max(retries + 1, 1)
        last = ProbeOutcome()
        for attempt in range(1, attempts + 1):
            outcome = self.probe_client.probe_once(server, timeout_ms=timeout_ms)
            outcome.attempts = attempt
            last = outcome
            if outcome.tools_list_ok:
                return outcome
            if not outcome.transient:
                return outcome
            if attempt < attempts:
                time.sleep(min(0.5 * attempt, 2.0))
        return last

    def _write_probe_receipts(
        self,
        server_dir: Path,
        server: MCPServer,
        outcome: ProbeOutcome,
    ) -> Tuple[Optional[Path], Optional[Path], Optional[Path]]:
        timings_path = server_dir / "timings.json"
        write_json_file(
            {
                "serverId": server.id,
                "transport": server.transport,
                "connectMs": outcome.connect_latency_ms,
                "toolsListMs": outcome.tools_list_latency_ms,
                "totalMs": outcome.total_latency_ms,
                "attempts": outcome.attempts,
                "httpStatusCode": outcome.http_status_code,
            },
            timings_path,
        )

        tool_list_path = server_dir / "tools-list.json"
        write_json_file(
            {
                "serverId": server.id,
                "rawPayload": outcome.tools_payload,
                "toolCount": len(outcome.tools),
            },
            tool_list_path,
        )

        errors_path: Optional[Path] = None
        if outcome.error_class or outcome.error_message:
            errors_path = server_dir / "errors.json"
            write_json_file(
                {
                    "serverId": server.id,
                    "errorClass": outcome.error_class,
                    "errorMessage": outcome.error_message,
                    "httpStatusCode": outcome.http_status_code,
                    "transient": outcome.transient,
                    "timeout": outcome.timeout,
                    "rateLimited": outcome.rate_limited,
                    "details": outcome.details,
                },
                errors_path,
            )
        return tool_list_path, timings_path, errors_path

    def _capture_tool_schemas(
        self,
        server: MCPServer,
        tools: List[Dict[str, Any]],
        events_path: Path,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]],
        run_id: str,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        parse_errors = 0
        input_count = 0
        output_count = 0
        anyof_allof_count = 0
        opaque_count = 0

        for index, tool in enumerate(tools):
            name = str(tool.get("name") or f"unnamed_{index}")
            input_schema = tool.get("inputSchema")
            output_schema = tool.get("outputSchema")
            notes: List[str] = []
            ok = True

            if input_schema is not None:
                input_count += 1
                valid, reason = self._validate_schema(input_schema)
                if not valid:
                    ok = False
                    parse_errors += 1
                    notes.append(f"inputSchema: {reason}")
                if self._contains_composite_keywords(input_schema):
                    anyof_allof_count += 1
                if self._is_opaque_schema(input_schema):
                    opaque_count += 1

            if output_schema is not None:
                output_count += 1
                valid, reason = self._validate_schema(output_schema)
                if not valid:
                    ok = False
                    parse_errors += 1
                    notes.append(f"outputSchema: {reason}")
                if self._contains_composite_keywords(output_schema):
                    anyof_allof_count += 1

            rows.append(
                {
                    "name": name,
                    "inputSchema": input_schema,
                    "outputSchema": output_schema,
                    "schemaParseOk": ok,
                    "notes": notes,
                    "description": tool.get("description"),
                }
            )
            self._emit_event(
                events_path,
                progress_callback,
                event="mcp_scorecard_probe",
                phase="tool_schema",
                status="captured",
                run_id=run_id,
                server_id=server.id,
                tool_name=name,
                schema_parse_ok=ok,
            )

        total = len(tools)
        stats = {
            "schemasPresentRate": round(input_count / total, 4) if total else 0.0,
            "outputSchemasPresentRate": round(output_count / total, 4) if total else 0.0,
            "parseErrorCount": parse_errors,
            "anyOfAllOfUsedRate": round(anyof_allof_count / max(total, 1), 4) if total else 0.0,
            "opaqueSchemaRate": round(opaque_count / max(input_count, 1), 4) if input_count else 0.0,
        }
        return rows, stats

    def _validate_schema(self, schema: Any) -> Tuple[bool, Optional[str]]:
        if not isinstance(schema, dict):
            return False, "schema is not an object"
        if jsonschema is None:
            return True, None
        try:
            jsonschema.Draft202012Validator.check_schema(schema)
            return True, None
        except Exception as exc:  # pragma: no cover
            return False, str(exc)

    def _contains_composite_keywords(self, schema: Any) -> bool:
        if isinstance(schema, dict):
            for key, value in schema.items():
                if key in {"anyOf", "allOf", "oneOf"}:
                    return True
                if self._contains_composite_keywords(value):
                    return True
        if isinstance(schema, list):
            return any(self._contains_composite_keywords(item) for item in schema)
        return False

    def _is_opaque_schema(self, schema: Any) -> bool:
        if not isinstance(schema, dict):
            return True
        schema_type = schema.get("type")
        if schema_type in {"string", "any"}:
            return True
        if schema_type == "object" and not schema.get("properties"):
            return True
        if not schema_type and not schema.get("properties") and not schema.get("required"):
            return True
        return False

    def _minimum_gate(
        self,
        server: MCPServer,
        allowlisted: bool,
        allowlisted_only: bool,
        blocked_reasons: List[str],
        outcome: ProbeOutcome,
        schema_rows: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        reasons = list(blocked_reasons)
        if allowlisted_only and not allowlisted and "NOT_ALLOWLISTED" not in reasons:
            reasons.append("NOT_ALLOWLISTED")
        if not outcome.tools_list_ok and not outcome.transient:
            reasons.append("TOOLS_LIST_FAILED")
        if self._has_unusual_auth(server):
            reasons.append("DANGEROUS_AUTH_DEMANDS")

        parse_attempts = 0
        parse_failures = 0
        for row in schema_rows:
            has_schema = row.get("inputSchema") is not None or row.get("outputSchema") is not None
            if not has_schema:
                continue
            parse_attempts += 1
            if not bool(row.get("schemaParseOk")):
                parse_failures += 1
        if parse_attempts and parse_attempts == parse_failures:
            reasons.append("ALL_SCHEMAS_UNPARSEABLE")

        unique = []
        seen = set()
        for reason in reasons:
            if reason in seen:
                continue
            seen.add(reason)
            unique.append(reason)
        return {"pass": len(unique) == 0, "reasons": unique}

    def _collect_risk_flags(
        self,
        server: MCPServer,
        allowlisted: bool,
        outcome: ProbeOutcome,
        schema_stats: Dict[str, Any],
        tools: List[Dict[str, Any]],
    ) -> List[Dict[str, str]]:
        flags: List[Dict[str, str]] = [
            {"flag": "REMOTE_ENDPOINT", "severity": "info", "evidence": f"transport={server.transport}"}
        ]
        schema_validation = self._schema_validation(server)
        if not bool(schema_validation.get("ok")):
            flags.append(
                {
                    "flag": "SCHEMA_VALIDATION_FAILED",
                    "severity": "error",
                    "evidence": "; ".join([str(x) for x in schema_validation.get("errors", [])[:3]]) or "schemaValidation.ok=false",
                }
            )
        if str(server.status).lower() == "deprecated":
            flags.append({"flag": "REGISTRY_DEPRECATED", "severity": "warn", "evidence": "status=deprecated"})
        if not self._repo_url(server):
            flags.append({"flag": "REPOSITORY_URL_MISSING", "severity": "warn", "evidence": "repository.url missing"})

        package_total, package_hashed = self._package_hash_stats(server)
        if package_total > 0 and package_hashed < package_total:
            flags.append(
                {
                    "flag": "PACKAGE_HASH_MISSING",
                    "severity": "warn",
                    "evidence": f"fileSha256 present for {package_hashed}/{package_total} packages",
                }
            )
        if (bool(server.metadata.get("hasPackages")) or package_total > 0) and not self._has_structured_manifest_inputs(server):
            flags.append(
                {
                    "flag": "STRUCTURED_INPUTS_MISSING",
                    "severity": "warn",
                    "evidence": "no structured headers/arguments/env inputs declared",
                }
            )
        if outcome.error_class or not outcome.tools_list_ok:
            flags.append(
                {
                    "flag": "TOOLS_LIST_FAILED",
                    "severity": "error",
                    "evidence": outcome.error_message or (outcome.error_class or "unknown"),
                }
            )
        parse_errors = int(schema_stats.get("parseErrorCount") or 0)
        if parse_errors:
            flags.append(
                {
                    "flag": "SCHEMA_PARSE_ERRORS",
                    "severity": "warn",
                    "evidence": f"parseErrorCount={parse_errors}",
                }
            )
        schemas_present = float(schema_stats.get("schemasPresentRate") or 0.0)
        if schemas_present < 0.5 and tools:
            flags.append(
                {
                    "flag": "SCHEMA_MISSING_MAJORITY",
                    "severity": "warn",
                    "evidence": f"schemasPresentRate={schemas_present:.2f}",
                }
            )
        opaque_rate = float(schema_stats.get("opaqueSchemaRate") or 0.0)
        if opaque_rate >= 0.8 and tools:
            flags.append({"flag": "OPAQUE_SCHEMA", "severity": "warn", "evidence": f"opaqueSchemaRate={opaque_rate:.2f}"})
        if outcome.error_message and not outcome.structured_error:
            flags.append({"flag": "ERRORS_UNSTRUCTURED", "severity": "warn", "evidence": outcome.error_message})
        if outcome.protocol_violation:
            flags.append({"flag": "PROTOCOL_VIOLATION", "severity": "error", "evidence": "tools/list framing or payload mismatch"})
        if not self._has_origin_validation_evidence(server):
            flags.append(
                {
                    "flag": "MISSING_ORIGIN_VALIDATION_EVIDENCE",
                    "severity": "warn",
                    "evidence": "No explicit origin validation evidence in manifest/probe",
                }
            )
        if self._has_unusual_auth(server):
            flags.append({"flag": "UNUSUAL_AUTH_DEMANDS", "severity": "warn", "evidence": f"auth.type={server.auth.type}"})
        exfil_tool = self._detect_exfiltration_prompt(tools)
        if exfil_tool:
            flags.append({"flag": "TOOL_DESCRIPTION_EXFIL_HINT", "severity": "error", "evidence": f"tool={exfil_tool}"})
        if not allowlisted:
            flags.append({"flag": "NOT_ALLOWLISTED", "severity": "warn", "evidence": "server not in allowlist"})
        return flags

    def _score_server(
        self,
        server: MCPServer,
        allowlisted: bool,
        allowlist_entry: Optional[Dict[str, Any]],
        minimum_gate: Dict[str, Any],
        outcome: ProbeOutcome,
        schema_stats: Dict[str, Any],
        risk_flags: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        parse_errors = int(schema_stats.get("parseErrorCount") or 0)
        schemas_present = float(schema_stats.get("schemasPresentRate") or 0.0)
        output_present = float(schema_stats.get("outputSchemasPresentRate") or 0.0)
        opaque_rate = float(schema_stats.get("opaqueSchemaRate") or 0.0)
        schema_validation_ok = self._schema_validation_ok(server)
        package_total, package_hashed = self._package_hash_stats(server)
        has_structured_inputs = self._has_structured_manifest_inputs(server)

        spec = 0
        if outcome.handshake_ok:
            spec += 15
        if outcome.tools_list_ok:
            spec += 10
        if not outcome.protocol_violation:
            spec += 5
        if schema_validation_ok:
            spec += 5
        if outcome.protocol_violation:
            spec -= 10
        if not schema_validation_ok:
            spec -= 10
        spec = self._clamp(spec, 0, 30)

        schema = 0
        if schemas_present >= 0.8:
            schema += 10
        if output_present >= 0.5:
            schema += 5
        if parse_errors == 0:
            schema += 5
        if opaque_rate <= 0.2 and schemas_present > 0:
            schema += 5
        if has_structured_inputs:
            schema += 2
        schema -= min(parse_errors, 10)
        if schemas_present == 0.0 or opaque_rate >= 1.0:
            schema -= 5
        if package_total > 0 and package_hashed < package_total:
            schema -= 3
        schema = self._clamp(schema, 0, 25)

        observability = 0
        if outcome.structured_error or outcome.error_message is None:
            observability += 5
        if not outcome.rate_limited or outcome.transient:
            observability += 5
        if self._repo_url(server) or server.metadata.get("websiteUrl"):
            observability += 5
        if any(flag["flag"] == "ERRORS_UNSTRUCTURED" for flag in risk_flags):
            observability -= 5
        observability = self._clamp(observability, 0, 15)

        reliability = 0
        reliability += 10 if outcome.tools_list_ok else 0
        reliability += 5 if not outcome.timeout else 0
        tools_latency = outcome.tools_list_latency_ms or outcome.total_latency_ms or 0
        reliability += 5 if 0 < tools_latency <= 2000 else 0
        reliability = self._clamp(reliability, 0, 20)

        governance = 0
        if str(server.status).lower() == "active":
            governance += 3
        if server.metadata.get("version"):
            governance += 2
        if self._repo_url(server):
            governance += 3
        if schema_validation_ok:
            governance += 1
        if package_total > 0 and package_hashed == package_total:
            governance += 1
        if allowlist_entry and allowlist_entry.get("notes"):
            governance += 2
        if str(server.status).lower() == "deprecated":
            governance -= 5
        if not allowlisted and minimum_gate["reasons"]:
            governance -= 10
        governance = self._clamp(governance, 0, 10)

        total = int(spec + schema + observability + reliability + governance)
        if not minimum_gate["pass"]:
            total = min(total, 49)

        return {
            "totalScore": total,
            "components": {
                "specCompliance": spec,
                "schemaQuality": schema,
                "observability": observability,
                "reliability": reliability,
                "governancePosture": governance,
            },
            "weights": {
                "specCompliance": 0.30,
                "schemaQuality": 0.25,
                "observability": 0.15,
                "reliability": 0.20,
                "governancePosture": 0.10,
            },
        }

    def _recommendation(self, total_score: int, gate_passed: bool) -> Dict[str, str]:
        if not gate_passed:
            return {"tier": "D", "decision": "block", "rationale": "Minimum gate failed."}
        if total_score >= 85:
            return {"tier": "A", "decision": "allow", "rationale": "Spec-aligned and stable."}
        if total_score >= 70:
            return {"tier": "B", "decision": "allow_with_caution", "rationale": "Usable with caution."}
        if total_score >= 50:
            return {"tier": "C", "decision": "quarantine", "rationale": "Discovery-only until improved."}
        return {"tier": "D", "decision": "block", "rationale": "Insufficient quality/reliability."}

    def _build_explain_lines(
        self,
        server: MCPServer,
        outcome: ProbeOutcome,
        schema_stats: Dict[str, Any],
        recommendation: Dict[str, str],
    ) -> List[str]:
        package_total, package_hashed = self._package_hash_stats(server)
        return [
            f"Spec compliance: transport={server.transport}, handshake={outcome.handshake_ok}, tools_list={outcome.tools_list_ok}",
            f"Schema quality: manifestSchemaOk={self._schema_validation_ok(server)}, schemasPresentRate={float(schema_stats.get('schemasPresentRate') or 0.0):.2f}, parseErrors={int(schema_stats.get('parseErrorCount') or 0)}",
            f"Manifest governance: repositoryUrlPresent={bool(self._repo_url(server))}, packageHashes={package_hashed}/{package_total}",
            f"Reliability: attempts={outcome.attempts}, totalLatencyMs={outcome.total_latency_ms}",
            f"Governance: recommendation={recommendation['decision']} ({recommendation['tier']})",
        ]

    def _build_summary(self, entries: List[Dict[str, Any]], latency_samples: List[int]) -> Dict[str, Any]:
        total = len(entries)
        blocked = len([e for e in entries if not e["governance"]["minimumGate"]["pass"]])
        probed = len([e for e in entries if e["probe"]["result"] != "blocked"])
        passed = len([e for e in entries if e["governance"]["minimumGate"]["pass"]])
        scores = [int(e["scoring"]["totalScore"]) for e in entries]
        return {
            "total": total,
            "probed": probed,
            "passedMinimum": passed,
            "blocked": blocked,
            "avgScore": round(sum(scores) / len(scores), 2) if scores else 0.0,
            "p95LatencyMs": self._p95(latency_samples),
        }

    def _build_allowlist_output(self, allowlist_payload: Dict[str, Any], entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        suggestions = []
        for entry in entries:
            if not entry["governance"]["minimumGate"]["pass"]:
                continue
            rec = entry["governance"]["recommendation"]
            suggestions.append(
                {
                    "id": entry["server"]["id"],
                    "suggestedDecision": rec["decision"],
                    "tier": rec["tier"],
                    "score": entry["scoring"]["totalScore"],
                    "rationale": rec["rationale"],
                }
            )
        return {
            "schemaVersion": "mcp-allowlist-1.0",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "defaultPolicy": allowlist_payload.get("defaultPolicy", "deny"),
            "servers": allowlist_payload.get("servers", []),
            "suggestions": suggestions,
        }

    def _render_markdown(self, scorecard_payload: Dict[str, Any]) -> str:
        lines = [
            "# MCP Probe Report",
            "",
            f"- Run ID: `{scorecard_payload['runId']}`",
            f"- Generated: `{scorecard_payload['generatedAt']}`",
            "",
            "## Summary",
            "",
            f"- Total servers: {scorecard_payload['summary']['total']}",
            f"- Probed: {scorecard_payload['summary']['probed']}",
            f"- Passed minimum gate: {scorecard_payload['summary']['passedMinimum']}",
            f"- Blocked: {scorecard_payload['summary']['blocked']}",
            f"- Average score: {scorecard_payload['summary']['avgScore']}",
            "",
            "## Servers",
            "",
            "| Server | Transport | Result | Score | Tier | Decision |",
            "|---|---|---|---:|---|---|",
        ]
        for entry in scorecard_payload.get("servers", []):
            lines.append(
                f"| {entry['server']['id']} | {entry['server']['transport']} | {entry['probe']['result']} | "
                f"{entry['scoring']['totalScore']} | {entry['governance']['recommendation']['tier']} | "
                f"{entry['governance']['recommendation']['decision']} |"
            )
        lines.append("")
        return "\n".join(lines)

    def _manifest_hash(self, server: MCPServer) -> str:
        data = json.dumps(server.metadata, sort_keys=True, default=str).encode("utf-8")
        return f"sha256:{hashlib.sha256(data).hexdigest()}"

    def _repo_url(self, server: MCPServer) -> Optional[str]:
        repo = server.metadata.get("repository")
        if isinstance(repo, dict) and isinstance(repo.get("url"), str) and repo["url"].strip():
            return repo["url"].strip()
        if isinstance(repo, str) and repo.strip():
            return repo.strip()
        if isinstance(server.owner, str) and server.owner.startswith("http"):
            return server.owner
        return None

    def _declared_auth_hints(self, server: MCPServer) -> List[str]:
        hints: List[str] = []
        if server.auth and server.auth.type and server.auth.type != "none":
            hints.append(server.auth.type)
        remotes = server.metadata.get("remotes")
        if isinstance(remotes, list):
            for remote in remotes:
                if not isinstance(remote, dict):
                    continue
                auth = remote.get("auth")
                if isinstance(auth, str) and auth.strip():
                    hints.append(auth.strip())
                if isinstance(auth, dict):
                    auth_type = auth.get("type")
                    if isinstance(auth_type, str) and auth_type.strip():
                        hints.append(auth_type.strip())
        return sorted(set(hints))

    def _schema_validation(self, server: MCPServer) -> Dict[str, Any]:
        value = server.metadata.get("schemaValidation")
        if isinstance(value, dict):
            return value
        return {"ok": False, "errors": ["schema validation metadata missing"], "mode": "missing"}

    def _schema_validation_ok(self, server: MCPServer) -> bool:
        validation = self._schema_validation(server)
        return bool(validation.get("ok"))

    def _package_hash_stats(self, server: MCPServer) -> Tuple[int, int]:
        packages = server.metadata.get("packages")
        if not isinstance(packages, list):
            return 0, 0
        total = 0
        hashed = 0
        for package in packages:
            if not isinstance(package, dict):
                continue
            total += 1
            file_hash = package.get("fileSha256")
            if isinstance(file_hash, str) and file_hash.strip():
                hashed += 1
        return total, hashed

    def _has_structured_manifest_inputs(self, server: MCPServer) -> bool:
        if bool(server.metadata.get("hasStructuredInputs")):
            return True
        structured = server.metadata.get("structuredInputs")
        if isinstance(structured, dict):
            return any(bool(v) for v in structured.values())

        remotes = server.metadata.get("remotes")
        if isinstance(remotes, list):
            for remote in remotes:
                if not isinstance(remote, dict):
                    continue
                if remote.get("headers") or remote.get("inputs"):
                    return True

        packages = server.metadata.get("packages")
        if isinstance(packages, list):
            for package in packages:
                if not isinstance(package, dict):
                    continue
                if package.get("runtimeArguments") or package.get("packageArguments") or package.get("environmentVariables"):
                    return True
        return False

    def _has_origin_validation_evidence(self, server: MCPServer) -> bool:
        meta = server.metadata.get("_meta")
        if not isinstance(meta, dict):
            return False
        text = json.dumps(meta, default=str).lower()
        return "origin" in text and ("validate" in text or "allow" in text)

    def _has_unusual_auth(self, server: MCPServer) -> bool:
        if server.auth and server.auth.type and server.auth.type != "none":
            return True
        remotes = server.metadata.get("remotes")
        if isinstance(remotes, list):
            for remote in remotes:
                if not isinstance(remote, dict):
                    continue
                auth = remote.get("auth")
                if isinstance(auth, dict):
                    auth_type = str(auth.get("type") or "").strip().lower()
                    if auth_type and auth_type not in {"none", "optional"}:
                        return True
                if isinstance(auth, str) and auth.strip().lower() not in {"none", "optional"}:
                    return True
        return False

    def _detect_exfiltration_prompt(self, tools: List[Dict[str, Any]]) -> Optional[str]:
        pattern = re.compile(
            r"(api[_ -]?key|token|password|secret).*(send|upload|exfil|forward)|"
            r"(send|upload|exfil|forward).*(api[_ -]?key|token|password|secret)",
            re.IGNORECASE,
        )
        for tool in tools:
            description = tool.get("description")
            if isinstance(description, str) and pattern.search(description):
                return str(tool.get("name") or "unknown")
        return None

    def _safe_server_slug(self, server_id: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9_.-]+", "_", server_id.strip())
        return slug.strip("_") or "server"

    def _emit_event(
        self,
        events_path: Path,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]],
        **event_data: Any,
    ) -> None:
        payload = {"timestamp": datetime.now(timezone.utc).isoformat(), **event_data}
        if progress_callback:
            progress_callback(payload)
        with open(events_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, default=str) + "\n")

    def _p95(self, values: List[int]) -> int:
        if not values:
            return 0
        ordered = sorted(values)
        return int(ordered[max(math.ceil(0.95 * len(ordered)) - 1, 0)])

    def _clamp(self, value: int, minimum: int, maximum: int) -> int:
        return max(minimum, min(value, maximum))
### END: MCPScorecardService (drop-in replacement)


def run_mcp_scorecard(
    server_ids: Optional[List[str]] = None,
    run_id: Optional[str] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Convenience wrapper for running a scorecard probe run."""
    return MCPScorecardService().run_probe(
        server_ids=server_ids,
        run_id=run_id,
        progress_callback=progress_callback,
    )
