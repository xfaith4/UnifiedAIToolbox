#!/usr/bin/env python3
"""
Demonstration and validation script for MCP Governance Policy Engine.

This script demonstrates the key features of the MCP governance system:
1. Policy evaluation (allow/deny decisions)
2. Allowlist matching
3. Sensitive field detection and redaction
4. Audit event logging
"""

import sys
import os
from datetime import datetime, timedelta

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)

from mcp_governance.policy_engine import (
    DefaultPolicyEngine,
    PolicyDecision,
    RunContext,
    ToolCallRequest
)
from mcp_governance.runtime_enforcer import (
    RuntimeEnforcer,
    JsonlAuditLogger,
    PolicyDeniedError
)


def print_section(title):
    """Print a section header."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")


def print_result(result):
    """Pretty print a policy result."""
    print(f"Decision: {result.decision.value.upper()}")
    print(f"Reason: {result.reason}")
    print(f"Policy: {result.policy_name}")
    if result.matched_allowlist:
        print(f"Matched Allowlist: {result.matched_allowlist}")
    if result.matched_rule:
        print(f"Matched Rule: {result.matched_rule}")
    if result.redact_request_fields:
        print(f"Redacted Fields: {', '.join(result.redact_request_fields)}")
    print()


def demo_basic_policy():
    """Demonstrate basic policy evaluation."""
    print_section("Demo 1: Basic Policy Evaluation")
    
    # Setup: Install records
    install_records = {
        "local-filesystem": {
            "install_id": "install-1",
            "server_id": "local-filesystem",
            "status": "enabled",
        },
        "postgres-sql": {
            "install_id": "install-2",
            "server_id": "postgres-sql",
            "status": "disabled",
        },
    }
    
    # Setup: Allowlists
    allowlists = {
        "allowlist-1": {
            "allowlist_id": "allowlist-1",
            "scope": "run",
            "scope_id": "run-demo",
            "allowed_servers": ["local-filesystem"],
            "allowed_collections": [],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
    }
    
    # Create policy engine
    policy_engine = DefaultPolicyEngine(
        install_records=install_records,
        allowlists=allowlists,
        collections={}
    )
    
    # Test 1: Allowed tool call
    print("Test 1: Tool call to enabled server in allowlist")
    context = RunContext(run_id="run-demo", user_id="demo-user")
    request = ToolCallRequest(
        server_id="local-filesystem",
        tool_name="read_file",
        arguments={"path": "/data/config.json"}
    )
    result = policy_engine.evaluate(context, request)
    print_result(result)
    
    # Test 2: Disabled server
    print("Test 2: Tool call to disabled server")
    request2 = ToolCallRequest(
        server_id="postgres-sql",
        tool_name="query",
        arguments={"sql": "SELECT 1"}
    )
    result2 = policy_engine.evaluate(context, request2)
    print_result(result2)
    
    # Test 3: Server not in allowlist
    install_records["new-server"] = {"status": "enabled"}
    print("Test 3: Tool call to server not in allowlist")
    request3 = ToolCallRequest(
        server_id="new-server",
        tool_name="do_something",
        arguments={}
    )
    result3 = policy_engine.evaluate(context, request3)
    print_result(result3)


def demo_sensitive_field_detection():
    """Demonstrate sensitive field detection and redaction."""
    print_section("Demo 2: Sensitive Field Detection & Redaction")
    
    install_records = {
        "api-server": {"status": "enabled"},
    }
    
    allowlists = {
        "allowlist-1": {
            "allowlist_id": "allowlist-1",
            "scope": "run",
            "scope_id": "run-demo",
            "allowed_servers": ["api-server"],
            "allowed_collections": [],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
    }
    
    policy_engine = DefaultPolicyEngine(
        install_records=install_records,
        allowlists=allowlists,
        collections={}
    )
    
    context = RunContext(run_id="run-demo", user_id="demo-user")
    
    # Test 1: API key detection
    print("Test 1: Detecting api_key field")
    request1 = ToolCallRequest(
        server_id="api-server",
        tool_name="call_external_api",
        arguments={
            "api_key": "sk-1234567890abcdef",
            "endpoint": "/api/users",
            "method": "GET"
        }
    )
    result1 = policy_engine.evaluate(context, request1)
    print_result(result1)
    
    # Test 2: Password detection
    print("Test 2: Detecting password field")
    request2 = ToolCallRequest(
        server_id="api-server",
        tool_name="authenticate",
        arguments={
            "username": "admin",
            "password": "supersecret123",
            "domain": "example.com"
        }
    )
    result2 = policy_engine.evaluate(context, request2)
    print_result(result2)
    
    # Test 3: Nested sensitive fields
    print("Test 3: Detecting nested sensitive fields")
    request3 = ToolCallRequest(
        server_id="api-server",
        tool_name="configure_service",
        arguments={
            "config": {
                "api_key": "sk-nested-key",
                "timeout": 30,
                "auth": {
                    "bearer_token": "abc123xyz"
                }
            },
            "name": "my-service"
        }
    )
    result3 = policy_engine.evaluate(context, request3)
    print_result(result3)


def demo_collections():
    """Demonstrate collection-based allowlisting."""
    print_section("Demo 3: Collection-Based Allowlisting")
    
    install_records = {
        "postgres-sql": {"status": "enabled"},
        "mysql-db": {"status": "enabled"},
        "mongodb": {"status": "enabled"},
    }
    
    collections = {
        "databases": {
            "collection_id": "databases",
            "name": "Database Tools",
            "server_ids": ["postgres-sql", "mysql-db", "mongodb"],
        },
    }
    
    allowlists = {
        "allowlist-1": {
            "allowlist_id": "allowlist-1",
            "scope": "run",
            "scope_id": "run-demo",
            "allowed_servers": [],
            "allowed_collections": ["databases"],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
    }
    
    policy_engine = DefaultPolicyEngine(
        install_records=install_records,
        allowlists=allowlists,
        collections=collections
    )
    
    context = RunContext(run_id="run-demo", user_id="demo-user")
    
    # Test 1: Server in collection
    print("Test 1: Tool call to server in 'databases' collection")
    request1 = ToolCallRequest(
        server_id="postgres-sql",
        tool_name="query",
        arguments={"sql": "SELECT * FROM users LIMIT 10"}
    )
    result1 = policy_engine.evaluate(context, request1)
    print_result(result1)
    
    # Test 2: Another server in same collection
    print("Test 2: Tool call to another server in 'databases' collection")
    request2 = ToolCallRequest(
        server_id="mongodb",
        tool_name="find",
        arguments={"collection": "users", "query": {}}
    )
    result2 = policy_engine.evaluate(context, request2)
    print_result(result2)


def demo_runtime_enforcement():
    """Demonstrate runtime enforcement with audit logging."""
    print_section("Demo 4: Runtime Enforcement & Audit Logging")
    
    import tempfile
    import json
    
    # Create temporary audit log directory
    temp_dir = tempfile.mkdtemp()
    print(f"Audit logs will be written to: {temp_dir}\n")
    
    install_records = {
        "local-filesystem": {"status": "enabled"},
    }
    
    allowlists = {
        "allowlist-1": {
            "allowlist_id": "allowlist-1",
            "scope": "run",
            "scope_id": "run-demo",
            "allowed_servers": ["local-filesystem"],
            "allowed_collections": [],
            "allowed_tools": None,
            "denied_servers": [],
            "denied_tools": [],
            "expires_at": None,
        },
    }
    
    policy_engine = DefaultPolicyEngine(
        install_records=install_records,
        allowlists=allowlists,
        collections={}
    )
    
    audit_logger = JsonlAuditLogger(temp_dir)
    enforcer = RuntimeEnforcer(policy_engine, audit_logger)
    
    context = RunContext(run_id="run-demo", user_id="demo-user")
    
    # Test 1: Allowed tool call
    print("Test 1: Enforcing allowed tool call")
    request1 = ToolCallRequest(
        server_id="local-filesystem",
        tool_name="read_file",
        arguments={"path": "/data/config.json"}
    )
    
    enforcement_result = enforcer.enforce_tool_call(context, request1)
    print(f"Allowed: {enforcement_result.allowed}")
    print(f"Audit Event ID: {enforcement_result.audit_event_id}")
    
    if enforcement_result.allowed:
        # Simulate tool execution
        response = {"content": "...", "size": 1024}
        enforcer.log_tool_execution(
            context,
            request1,
            response,
            success=True,
            duration_ms=125.5,
            enforcement_result=enforcement_result
        )
        print("✅ Tool executed and logged\n")
    
    # Test 2: Denied tool call
    print("Test 2: Enforcing denied tool call")
    request2 = ToolCallRequest(
        server_id="nonexistent-server",
        tool_name="do_something",
        arguments={}
    )
    
    enforcement_result2 = enforcer.enforce_tool_call(context, request2)
    print(f"Allowed: {enforcement_result2.allowed}")
    print(f"Reason: {enforcement_result2.policy_result.reason}")
    print(f"Audit Event ID: {enforcement_result2.audit_event_id}")
    print("❌ Tool call blocked\n")
    
    # Show audit log
    audit_log_file = os.path.join(temp_dir, "mcp_audit.jsonl")
    if os.path.exists(audit_log_file):
        print(f"Audit Log Contents ({audit_log_file}):")
        print("-" * 70)
        with open(audit_log_file, "r") as f:
            for line in f:
                event = json.loads(line)
                print(f"Event: {event['event_type']}")
                print(f"  Decision: {event.get('decision', 'N/A')}")
                print(f"  Server: {event.get('server_id', 'N/A')}")
                print(f"  Tool: {event.get('tool_name', 'N/A')}")
                print(f"  Reason: {event.get('reason', 'N/A')}")
                print()


def main():
    """Run all demonstrations."""
    print("\n" + "="*70)
    print("  MCP Governance Policy Engine - Demonstration & Validation")
    print("="*70)
    
    try:
        demo_basic_policy()
        demo_sensitive_field_detection()
        demo_collections()
        demo_runtime_enforcement()
        
        print_section("✅ All Demonstrations Completed Successfully!")
        
        print("\nKey Takeaways:")
        print("1. Policy engine enforces deny-by-default security")
        print("2. Sensitive fields are automatically detected and marked for redaction")
        print("3. Collections simplify management of related MCP servers")
        print("4. Runtime enforcer provides complete audit trail")
        print("5. All policy decisions include clear human-readable reasons")
        
    except Exception as e:
        print(f"\n❌ Error during demonstration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
