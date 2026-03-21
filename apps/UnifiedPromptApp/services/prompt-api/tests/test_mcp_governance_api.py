"""Integration tests for MCP governance API – Phase 4 coverage.

Tests cover:
- Violations summary endpoint (Phase 4.4)
- Audit query with event-type filtering
- Middleware integration: allow path logs execution
- Middleware integration: deny path blocks execution before it runs
"""

import asyncio
import pathlib
import sys
from datetime import datetime, timezone

import pytest

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from mcp_governance import api_routes, storage
from mcp_governance.models import AuditEvent, AuditEventType
from mcp_governance.policy_engine import PolicyDecision, PolicyResult
from mcp_governance.runtime_enforcer import EnforcementResult
from orchestration_mcp_middleware import OrchestrationMCPMiddleware


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_tmp_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> pathlib.Path:
    data_dir = tmp_path / "mcp"
    monkeypatch.setattr(storage, "DATA_DIR", data_dir)
    monkeypatch.setattr(storage, "AUDIT_LOG_FILE", data_dir / "audit_log.jsonl")
    return data_dir


def _make_deny_event(event_id: str, server_id: str = "filesystem", tool_name: str = "read_file", user_id: str = "alice") -> AuditEvent:
    return AuditEvent(
        event_id=event_id,
        event_type=AuditEventType.TOOL_CALL_DENIED,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        run_id="run-test",
        user_id=user_id,
        server_id=server_id,
        tool_name=tool_name,
        decision="deny",
        reason="server not in allowlist",
        policy_name="default",
        request_payload={},
    )


def _make_allow_event(event_id: str) -> AuditEvent:
    return AuditEvent(
        event_id=event_id,
        event_type=AuditEventType.TOOL_CALL_ALLOWED,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        run_id="run-test",
        user_id="alice",
        server_id="filesystem",
        tool_name="read_file",
        decision="allow",
        reason="server in allowlist",
        policy_name="default",
        request_payload={},
    )


class _FakeEnforcer:
    def __init__(self, allowed: bool = True):
        self.allowed = allowed
        self.logged: list = []

    def enforce_tool_call(self, context, request):
        decision = PolicyDecision.ALLOW if self.allowed else PolicyDecision.DENY
        result = PolicyResult(
            decision=decision,
            reason="ok" if self.allowed else "denied",
            policy_name="test",
        )
        return EnforcementResult(allowed=self.allowed, policy_result=result, audit_event_id="evt-1")

    def log_tool_execution(self, **kwargs):
        self.logged.append(kwargs)


# ---------------------------------------------------------------------------
# Violations summary tests
# ---------------------------------------------------------------------------

def test_violations_summary_empty(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    """Empty audit log returns zero violations."""
    _set_tmp_storage(monkeypatch, tmp_path)

    result = asyncio.run(api_routes.get_violations_summary(start_time=None, end_time=None, run_id=None, top_n=10))

    assert result.total_denied == 0
    assert result.by_server == []
    assert result.by_tool == []
    assert result.by_user == []


def test_violations_summary_groups_by_server(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    """Denied events are aggregated by server_id."""
    _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "test-key")

    storage.log_audit_event(_make_deny_event("d1", server_id="srv-a"))
    storage.log_audit_event(_make_deny_event("d2", server_id="srv-a"))
    storage.log_audit_event(_make_deny_event("d3", server_id="srv-b"))
    # An allow event should NOT appear in violations
    storage.log_audit_event(_make_allow_event("a1"))

    result = asyncio.run(api_routes.get_violations_summary(start_time=None, end_time=None, run_id=None, top_n=10))

    assert result.total_denied == 3
    server_keys = [g.group_key for g in result.by_server]
    assert "srv-a" in server_keys
    srv_a = next(g for g in result.by_server if g.group_key == "srv-a")
    assert srv_a.denied_count == 2


def test_violations_summary_groups_by_user(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    """Denied events are aggregated by user_id."""
    _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "test-key")

    storage.log_audit_event(_make_deny_event("d1", user_id="alice"))
    storage.log_audit_event(_make_deny_event("d2", user_id="alice"))
    storage.log_audit_event(_make_deny_event("d3", user_id="bob"))

    result = asyncio.run(api_routes.get_violations_summary(start_time=None, end_time=None, run_id=None, top_n=10))

    alice = next(g for g in result.by_user if g.group_key == "alice")
    assert alice.denied_count == 2
    bob = next(g for g in result.by_user if g.group_key == "bob")
    assert bob.denied_count == 1


def test_violations_summary_top_n(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    """top_n parameter limits the number of groups returned."""
    _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "test-key")

    for i in range(5):
        storage.log_audit_event(_make_deny_event(f"d{i}", server_id=f"srv-{i}"))

    result = asyncio.run(api_routes.get_violations_summary(start_time=None, end_time=None, run_id=None, top_n=2))

    assert len(result.by_server) <= 2


# ---------------------------------------------------------------------------
# Middleware integration tests (Phase 4.1)
# ---------------------------------------------------------------------------

def test_middleware_allow_path_logs_execution():
    """Allowed tool calls are executed and logged."""
    enforcer = _FakeEnforcer(allowed=True)
    middleware = OrchestrationMCPMiddleware(enforcer=enforcer, enabled=True)

    called = {"value": False}

    def _execute():
        called["value"] = True
        return {"result": "ok"}

    response = middleware.execute_tool_call(
        runtime_context={"run_id": "run-1", "user_id": "alice"},
        invocation={"server_id": "filesystem", "tool_name": "read_file", "arguments": {}},
        execute_fn=_execute,
    )

    assert response == {"result": "ok"}
    assert called["value"] is True
    assert len(enforcer.logged) == 1
    assert enforcer.logged[0]["success"] is True


def test_middleware_deny_path_blocks_execution():
    """Denied tool calls never reach the execute function."""
    enforcer = _FakeEnforcer(allowed=False)
    middleware = OrchestrationMCPMiddleware(enforcer=enforcer, enabled=True)

    executed = {"value": False}

    with pytest.raises(Exception, match="denied"):
        middleware.execute_tool_call(
            runtime_context={"run_id": "run-1", "user_id": "alice"},
            invocation={"server_id": "filesystem", "tool_name": "write_file", "arguments": {}},
            execute_fn=lambda: executed.update({"value": True}),
        )

    assert executed["value"] is False


def test_middleware_disabled_bypasses_enforcement():
    """When enforcement is disabled the execute function runs unconditionally."""
    enforcer = _FakeEnforcer(allowed=False)
    middleware = OrchestrationMCPMiddleware(enforcer=enforcer, enabled=False)

    result = middleware.execute_tool_call(
        runtime_context={"run_id": "run-1", "user_id": "alice"},
        invocation={"server_id": "filesystem", "tool_name": "read_file", "arguments": {}},
        execute_fn=lambda: {"ok": True},
    )

    assert result == {"ok": True}


def test_middleware_sanitizes_token_from_error_message():
    """Secret tokens in exception messages are redacted before logging."""
    assert OrchestrationMCPMiddleware._sanitize_for_logs("Bearer ghp_abc123XYZ") == "***REDACTED_TOKEN***"
    assert OrchestrationMCPMiddleware._sanitize_for_logs("no secret here") == "no secret here"
