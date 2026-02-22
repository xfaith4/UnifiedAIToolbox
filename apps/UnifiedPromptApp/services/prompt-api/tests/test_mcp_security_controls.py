import asyncio
import json
import pathlib
import sys
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from mcp_governance import api_routes, storage
from mcp_governance.models import AuditEvent, AuditEventType


class _Role:
    def __init__(self, value: str):
        self.value = value


class _User:
    def __init__(self, username: str, role: str):
        self.username = username
        self.role = _Role(role)


def _set_tmp_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> pathlib.Path:
    data_dir = tmp_path / "mcp"
    monkeypatch.setattr(storage, "DATA_DIR", data_dir)
    monkeypatch.setattr(storage, "AUDIT_LOG_FILE", data_dir / "audit_log.jsonl")
    return data_dir


def _make_event(event_id: str, decision: str = "allow", event_type: AuditEventType = AuditEventType.TOOL_CALL_ALLOWED) -> AuditEvent:
    return AuditEvent(
        event_id=event_id,
        event_type=event_type,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        run_id="run-1",
        user_id="alice",
        server_id="filesystem",
        tool_name="read_file",
        decision=decision,
        reason="test event",
        policy_name="default",
        request_payload={"path": "README.md"},
    )


def _request(path: str = "/api/mcp/test") -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_audit_events_are_signed_and_signature_validates(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "unit-test-signing-key")

    storage.log_audit_event(_make_event("evt-1"))
    events = storage.query_audit_events(limit=10)

    assert len(events) == 1
    assert events[0]["signature"]
    assert events[0]["signature_valid"] is True

    # Tamper with event line and verify signature validation fails.
    with open(storage.AUDIT_LOG_FILE, "r", encoding="utf-8") as handle:
        line = handle.readline()
    payload = json.loads(line)
    payload["reason"] = "tampered"
    with open(storage.AUDIT_LOG_FILE, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")

    tampered = storage.query_audit_events(limit=10)
    assert tampered[0]["signature_valid"] is False


def test_audit_log_rotation_keeps_events_queryable(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    data_dir = _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "unit-test-signing-key")
    monkeypatch.setenv("MCP_AUDIT_ROTATE_MAX_BYTES", "300")
    monkeypatch.setenv("MCP_AUDIT_ROTATE_DAILY", "false")
    monkeypatch.setenv("MCP_AUDIT_ROTATE_KEEP_FILES", "5")

    event1 = _make_event("evt-rotate-1")
    event1.request_payload = {"blob": "x" * 800}
    storage.log_audit_event(event1)

    event2 = _make_event("evt-rotate-2")
    event2.request_payload = {"blob": "y" * 800}
    storage.log_audit_event(event2)

    rotated_files = list(data_dir.glob("audit_log.*.jsonl"))
    assert rotated_files, "Expected at least one rotated audit log file"

    events = storage.query_audit_events(limit=10)
    assert len(events) == 2


def test_anomaly_detection_flags_deny_spike_and_repeated_denials(monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path):
    _set_tmp_storage(monkeypatch, tmp_path)
    monkeypatch.setenv("MCP_AUDIT_SIGNING_KEY", "unit-test-signing-key")

    for idx in range(6):
        event = _make_event(
            f"evt-deny-{idx}",
            decision="deny",
            event_type=AuditEventType.TOOL_CALL_DENIED
        )
        storage.log_audit_event(event)

    anomalies = storage.get_audit_anomalies(
        window_minutes=120,
        min_events_for_spike=1,
        deny_ratio_threshold=0.2,
        repeated_deny_threshold=3,
        limit=20,
    )
    anomaly_types = {item["anomaly_type"] for item in anomalies}

    assert "policy.deny_ratio_spike" in anomaly_types
    assert "policy.repeated_denials" in anomaly_types


def test_rbac_requires_admin_for_admin_dependency(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MCP_GOVERNANCE_RBAC_ENABLED", "true")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(api_routes.require_admin_user(current_user=_User("alice", "user")))
    assert exc.value.status_code == 403

    allowed_user = asyncio.run(api_routes.require_admin_user(current_user=_User("admin", "admin")))
    assert allowed_user.username == "admin"


def test_mcp_rate_limit_blocks_after_threshold(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MCP_GOVERNANCE_RATE_LIMIT_REQUESTS", "2")
    monkeypatch.setenv("MCP_GOVERNANCE_RATE_LIMIT_WINDOW_SECONDS", "1")
    api_routes._MCP_RATE_BUCKETS.clear()

    request = _request("/api/mcp/collections")
    asyncio.run(api_routes.enforce_mcp_rate_limit(request=request, current_user=None))
    asyncio.run(api_routes.enforce_mcp_rate_limit(request=request, current_user=None))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(api_routes.enforce_mcp_rate_limit(request=request, current_user=None))
    assert exc.value.status_code == 429
