"""Middleware for enforcing MCP policy checks during orchestration tool calls."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
import re
import time
from typing import Any, Callable, Dict, Optional

from mcp_governance import storage
from mcp_governance.policy_engine import DefaultPolicyEngine, RunContext, ToolCallRequest
from mcp_governance.runtime_enforcer import EnforcementError, PolicyDeniedError, RuntimeEnforcer, create_runtime_enforcer

logger = logging.getLogger(__name__)

_TOKEN_PATTERN = re.compile(r"(?i)(bearer\s+[a-z0-9._\-]+|gh[pousr]_[a-z0-9_]+|sk-[a-z0-9\-]+)")


@dataclass(frozen=True)
class MCPToolInvocation:
    """Runtime metadata for an MCP tool invocation."""

    server_id: str
    tool_name: str
    arguments: Dict[str, Any]
    metadata: Dict[str, Any]


class OrchestrationMCPMiddleware:
    """Applies runtime policy enforcement around MCP tool execution."""

    def __init__(self, enforcer: RuntimeEnforcer, enabled: bool = True):
        self.enforcer = enforcer
        self.enabled = enabled

    @classmethod
    def from_environment(cls, audit_log_dir: str = "./data/audit") -> "OrchestrationMCPMiddleware":
        """Create middleware configured by environment variables and stored governance data."""
        enabled = os.getenv("MCP_ENFORCEMENT_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}

        installs = {record.server_id: record.model_dump() for record in storage.get_install_records()}
        allowlists = {allowlist.allowlist_id: allowlist.model_dump() for allowlist in storage.get_allowlists()}
        collections = {collection.collection_id: collection.model_dump() for collection in storage.get_collections()}

        policy_engine = DefaultPolicyEngine(
            install_records=installs,
            allowlists=allowlists,
            collections=collections,
        )
        enforcer = create_runtime_enforcer(policy_engine=policy_engine, audit_log_dir=audit_log_dir)
        return cls(enforcer=enforcer, enabled=enabled)

    @staticmethod
    def build_context(runtime_context: Dict[str, Any]) -> RunContext:
        """Build a governance RunContext from orchestration runtime context."""
        run_id = runtime_context.get("run_id")
        job_id = runtime_context.get("job_id")
        user_id = runtime_context.get("user_id") or "system"

        scope_type = "run"
        scope_id = run_id
        if not run_id and job_id:
            scope_type = "job"
            scope_id = job_id
        if not scope_id:
            scope_type = "global"
            scope_id = "global"

        return RunContext(
            run_id=run_id,
            job_id=job_id,
            user_id=user_id,
            scope_type=scope_type,
            scope_id=scope_id,
            agent_id=runtime_context.get("agent_id"),
            orchestrator_version=runtime_context.get("orchestrator_version"),
            metadata=runtime_context.get("metadata") or {},
        )

    @staticmethod
    def build_request(invocation: Dict[str, Any]) -> ToolCallRequest:
        """Build ToolCallRequest from raw invocation payload."""
        server_id = invocation.get("server_id") or invocation.get("server")
        tool_name = invocation.get("tool_name") or invocation.get("tool")
        if not server_id or not tool_name:
            raise ValueError("MCP tool invocation requires 'server_id' and 'tool_name'.")

        arguments = invocation.get("arguments") or invocation.get("args") or {}
        metadata = invocation.get("metadata") or {}

        return ToolCallRequest(
            server_id=server_id,
            tool_name=tool_name,
            arguments=arguments,
            metadata=metadata,
        )

    def execute_tool_call(
        self,
        runtime_context: Dict[str, Any],
        invocation: Dict[str, Any],
        execute_fn: Callable[[], Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Enforce policy before execution and audit response after completion."""
        context = self.build_context(runtime_context)
        request = self.build_request(invocation)

        if not self.enabled:
            return execute_fn()

        started = time.perf_counter()
        try:
            enforcement_result = self.enforcer.enforce_tool_call(context, request)
        except EnforcementError as exc:
            # Fail secure on policy errors.
            raise RuntimeError("Tool call blocked because policy enforcement failed.") from exc

        if not enforcement_result.allowed:
            reason = enforcement_result.policy_result.reason
            raise PolicyDeniedError(f"Tool call denied by policy: {reason}", enforcement_result.policy_result)

        success = False
        response: Dict[str, Any]
        try:
            response = execute_fn()
            success = True
            return response
        except Exception as exc:
            response = {"error": self._sanitize_for_logs(str(exc))}
            raise
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            self.enforcer.log_tool_execution(
                context=context,
                request=request,
                response=response,
                success=success,
                duration_ms=duration_ms,
                enforcement_result=enforcement_result,
            )

    @staticmethod
    def _sanitize_for_logs(message: str) -> str:
        """Redact token-like strings from messages before logging/persisting."""
        return _TOKEN_PATTERN.sub("***REDACTED_TOKEN***", message)


__all__ = ["MCPToolInvocation", "OrchestrationMCPMiddleware"]
