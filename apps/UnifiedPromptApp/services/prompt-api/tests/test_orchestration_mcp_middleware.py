import pathlib
import sys

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from mcp_governance.policy_engine import PolicyDecision, PolicyResult
from mcp_governance.runtime_enforcer import EnforcementResult
from orchestration_mcp_middleware import OrchestrationMCPMiddleware


class _FakeEnforcer:
    def __init__(self, allowed=True):
        self.allowed = allowed
        self.logged = []

    def enforce_tool_call(self, context, request):
        decision = PolicyDecision.ALLOW if self.allowed else PolicyDecision.DENY
        result = PolicyResult(decision=decision, reason="ok" if self.allowed else "denied", policy_name="test")
        return EnforcementResult(allowed=self.allowed, policy_result=result, audit_event_id="evt-1")

    def log_tool_execution(self, **kwargs):
        self.logged.append(kwargs)


def test_execute_tool_call_allows_and_logs():
    enforcer = _FakeEnforcer(allowed=True)
    middleware = OrchestrationMCPMiddleware(enforcer=enforcer, enabled=True)

    response = middleware.execute_tool_call(
        runtime_context={"run_id": "run-1", "user_id": "alice"},
        invocation={"server_id": "filesystem", "tool_name": "read", "arguments": {"path": "README.md"}},
        execute_fn=lambda: {"ok": True},
    )

    assert response == {"ok": True}
    assert len(enforcer.logged) == 1
    assert enforcer.logged[0]["success"] is True


def test_execute_tool_call_denies_before_execution():
    enforcer = _FakeEnforcer(allowed=False)
    middleware = OrchestrationMCPMiddleware(enforcer=enforcer, enabled=True)

    executed = {"value": False}

    try:
        middleware.execute_tool_call(
            runtime_context={"run_id": "run-1", "user_id": "alice"},
            invocation={"server_id": "filesystem", "tool_name": "read", "arguments": {}},
            execute_fn=lambda: executed.update({"value": True}),
        )
    except Exception as exc:
        assert "denied" in str(exc).lower()

    assert executed["value"] is False
    assert len(enforcer.logged) == 0
