"""
Unit tests for MCP Governance Policy Engine.

Tests the core policy evaluation logic including:
- Installation status checks
- Allowlist matching
- Denial checks
- Sensitive field detection
- Redaction logic
"""

import pytest
from datetime import datetime, timedelta
from mcp_governance.policy_engine import (
    DefaultPolicyEngine,
    PolicyDecision,
    PolicyResult,
    RunContext,
    ToolCallRequest
)


@pytest.fixture
def sample_install_records():
    """Sample install records for testing."""
    return {
        "local-filesystem": {
            "install_id": "install-1",
            "server_id": "local-filesystem",
            "status": "enabled",
            "installed_at": datetime.utcnow().isoformat(),
        },
        "postgres-sql": {
            "install_id": "install-2",
            "server_id": "postgres-sql",
            "status": "disabled",
            "installed_at": datetime.utcnow().isoformat(),
        },
    }


@pytest.fixture
def sample_collections():
    """Sample collections for testing."""
    return {
        "data-analysis": {
            "collection_id": "data-analysis",
            "name": "Data Analysis Tools",
            "server_ids": ["postgres-sql", "context-optimizer"],
        },
        "web-tools": {
            "collection_id": "web-tools",
            "name": "Web Tools",
            "server_ids": ["firecrawl"],
        },
    }


@pytest.fixture
def sample_allowlists():
    """Sample allowlists for testing."""
    return {
        "allowlist-1": {
            "allowlist_id": "allowlist-1",
            "scope": "run",
            "scope_id": "run-123",
            "allowed_servers": ["local-filesystem"],
            "allowed_collections": [],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
        "allowlist-2": {
            "allowlist_id": "allowlist-2",
            "scope": "global",
            "scope_id": "global",
            "allowed_servers": [],
            "allowed_collections": ["data-analysis"],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
        "allowlist-expired": {
            "allowlist_id": "allowlist-expired",
            "scope": "user",
            "scope_id": "user-456",
            "allowed_servers": ["local-filesystem"],
            "allowed_collections": [],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": (datetime.utcnow() - timedelta(hours=1)).isoformat(),
        },
    }


@pytest.fixture
def policy_engine(sample_install_records, sample_allowlists, sample_collections):
    """Create a policy engine with sample data."""
    return DefaultPolicyEngine(
        install_records=sample_install_records,
        allowlists=sample_allowlists,
        collections=sample_collections
    )


class TestInstallationChecks:
    """Test installation status checks."""
    
    def test_allow_enabled_server(self, policy_engine):
        """Should allow tool call to enabled server."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
    
    def test_deny_disabled_server(self, policy_engine):
        """Should deny tool call to disabled server."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="postgres-sql",
            tool_name="query",
            arguments={"sql": "SELECT 1"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "disabled" in result.reason.lower()
    
    def test_deny_nonexistent_server(self, policy_engine):
        """Should deny tool call to server not in install records."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="nonexistent-server",
            tool_name="do_something",
            arguments={}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "not found" in result.reason.lower()


class TestAllowlistMatching:
    """Test allowlist matching logic."""
    
    def test_match_run_level_allowlist(self, policy_engine):
        """Should match run-level allowlist."""
        context = RunContext(run_id="run-123", user_id="user-1", scope_type="run", scope_id="run-123")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert result.matched_allowlist == "allowlist-1"
    
    def test_match_global_allowlist(self, policy_engine):
        """Should fall back to global allowlist."""
        context = RunContext(run_id="run-999", user_id="user-1")
        request = ToolCallRequest(
            server_id="postgres-sql",
            tool_name="query",
            arguments={"sql": "SELECT 1"}
        )
        
        result = policy_engine.evaluate(context, request)
        # This will be denied because postgres-sql is disabled
        # But if it were enabled, it would match global allowlist via collection
        assert result.decision == PolicyDecision.DENY
    
    def test_deny_no_allowlist(self, policy_engine):
        """Should deny when no allowlist found."""
        # Create engine with no allowlists
        empty_engine = DefaultPolicyEngine(
            install_records={"local-filesystem": {"status": "enabled"}},
            allowlists={},
            collections={}
        )
        
        context = RunContext(run_id="run-999", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = empty_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "no allowlist" in result.reason.lower()
    
    def test_expired_allowlist_ignored(self, policy_engine):
        """Should ignore expired allowlists."""
        context = RunContext(run_id="run-999", user_id="user-456", scope_type="user", scope_id="user-456")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        # Should fall back to global allowlist since user allowlist is expired
        result = policy_engine.evaluate(context, request)
        # Will be denied because local-filesystem not in global allowlist
        assert result.decision == PolicyDecision.DENY


class TestDenialChecks:
    """Test explicit denial checks."""
    
    def test_deny_explicitly_denied_server(self, policy_engine):
        """Should deny explicitly denied server."""
        # Modify allowlist to include denial
        allowlist = policy_engine.allowlists["allowlist-1"]
        allowlist["denied_servers"] = ["local-filesystem"]
        
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "denied" in result.reason.lower()
    
    def test_deny_explicitly_denied_tool(self, policy_engine):
        """Should deny explicitly denied tool."""
        # Modify allowlist to include tool denial
        allowlist = policy_engine.allowlists["allowlist-1"]
        allowlist["denied_tools"] = ["local-filesystem:read_file"]
        
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "denied" in result.reason.lower()


class TestAllowChecks:
    """Test explicit allow checks."""
    
    def test_allow_server_in_allowed_servers(self, policy_engine):
        """Should allow server in allowed_servers list."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "allowed_servers" in result.reason
    
    def test_allow_server_in_collection(self, policy_engine):
        """Should allow server via collection."""
        # Enable postgres-sql for this test
        policy_engine.install_records["postgres-sql"]["status"] = "enabled"
        
        context = RunContext(run_id="run-999", user_id="user-1")  # Uses global allowlist
        request = ToolCallRequest(
            server_id="postgres-sql",
            tool_name="query",
            arguments={"sql": "SELECT 1"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "data-analysis" in result.reason
    
    def test_deny_server_not_in_allowlist(self, policy_engine):
        """Should deny server not in allowlist."""
        context = RunContext(run_id="run-123", user_id="user-1")
        
        # Add a server to install records that's not in allowlist
        policy_engine.install_records["new-server"] = {"status": "enabled"}
        
        request = ToolCallRequest(
            server_id="new-server",
            tool_name="do_something",
            arguments={}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert "not in allowed" in result.reason.lower()
    
    def test_tool_restriction(self, policy_engine):
        """Should enforce allowed_tools restriction."""
        # Modify allowlist to restrict tools
        allowlist = policy_engine.allowlists["allowlist-1"]
        allowlist["allowed_tools"] = ["local-filesystem:list_files"]
        
        context = RunContext(run_id="run-123", user_id="user-1")
        
        # Try allowed tool
        request1 = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="list_files",
            arguments={"path": "/"}
        )
        result1 = policy_engine.evaluate(context, request1)
        assert result1.decision == PolicyDecision.ALLOW
        
        # Try non-allowed tool
        request2 = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        result2 = policy_engine.evaluate(context, request2)
        assert result2.decision == PolicyDecision.DENY


class TestSensitiveFieldDetection:
    """Test sensitive field detection and redaction."""
    
    def test_detect_api_key(self, policy_engine):
        """Should detect api_key field."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="call_api",
            arguments={"api_key": "sk-1234567890", "query": "test"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "api_key" in result.redact_request_fields
    
    def test_detect_password(self, policy_engine):
        """Should detect password field."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="authenticate",
            arguments={"username": "user", "password": "secret123"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "password" in result.redact_request_fields
    
    def test_detect_token(self, policy_engine):
        """Should detect token field."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="call_service",
            arguments={"bearer_token": "abc123", "data": "test"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "bearer_token" in result.redact_request_fields
    
    def test_detect_nested_sensitive_fields(self, policy_engine):
        """Should detect sensitive fields in nested structures."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="complex_call",
            arguments={
                "config": {
                    "api_key": "sk-1234",
                    "timeout": 30
                },
                "data": "test"
            }
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert "config.api_key" in result.redact_request_fields
    
    def test_no_sensitive_fields(self, policy_engine):
        """Should not redact when no sensitive fields present."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt", "encoding": "utf-8"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert len(result.redact_request_fields) == 0


class TestPolicyResult:
    """Test policy result structure."""
    
    def test_policy_result_includes_metadata(self, policy_engine):
        """Should include metadata in policy result."""
        context = RunContext(run_id="run-123", user_id="user-1")
        request = ToolCallRequest(
            server_id="local-filesystem",
            tool_name="read_file",
            arguments={"path": "/test.txt"}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.ALLOW
        assert result.policy_name == "default"
        assert result.matched_allowlist == "allowlist-1"
        assert result.matched_rule == "allowed_servers"
    
    def test_deny_result_has_reason(self, policy_engine):
        """Should include clear reason for denial."""
        context = RunContext(run_id="run-999", user_id="user-1")
        request = ToolCallRequest(
            server_id="nonexistent",
            tool_name="do_something",
            arguments={}
        )
        
        result = policy_engine.evaluate(context, request)
        assert result.decision == PolicyDecision.DENY
        assert result.reason is not None
        assert len(result.reason) > 0
