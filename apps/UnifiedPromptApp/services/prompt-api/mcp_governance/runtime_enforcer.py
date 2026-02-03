"""
Runtime Enforcement Integration for MCP Tool Calls.

This module provides the integration point between the orchestrator/runtime
and the policy engine. It intercepts MCP tool calls, enforces policy decisions,
and logs audit events.

Integration Points:
1. Pre-execution hook: Intercept tool calls before they reach the MCP server
2. Policy evaluation: Consult policy engine for allow/deny decision
3. Blocking mechanism: Prevent denied calls from executing
4. Audit logging: Record all decisions and invocations
5. Response redaction: Apply redaction rules to responses

Usage:
    enforcer = RuntimeEnforcer(policy_engine, audit_logger)
    
    # Before invoking MCP tool:
    result = enforcer.enforce_tool_call(context, request)
    if result.decision == PolicyDecision.ALLOW:
        # Execute tool call
        response = mcp_client.call_tool(request.server_id, request.tool_name, request.arguments)
        # Log execution
        enforcer.log_tool_execution(context, request, response, success=True)
    else:
        # Blocked by policy
        raise PolicyDeniedError(result.reason)
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional
import logging
import uuid

from .policy_engine import (
    PolicyEngine,
    PolicyDecision,
    PolicyResult,
    RunContext,
    ToolCallRequest
)
from .models import AuditEvent, AuditEventType


logger = logging.getLogger(__name__)


# ============================================================================
# EXCEPTIONS
# ============================================================================

class PolicyDeniedError(Exception):
    """Raised when a tool call is denied by policy."""
    
    def __init__(self, reason: str, policy_result: PolicyResult):
        self.reason = reason
        self.policy_result = policy_result
        super().__init__(f"Policy denied: {reason}")


class EnforcementError(Exception):
    """Raised when enforcement fails due to internal error."""
    pass


# ============================================================================
# AUDIT LOGGER INTERFACE
# ============================================================================

class AuditLogger:
    """
    Interface for logging audit events.
    
    Implementations should persist audit events to durable storage
    (SQLite, JSONL files, external logging system, etc.)
    """
    
    def log_event(self, event: AuditEvent) -> None:
        """
        Log an audit event.
        
        Args:
            event: AuditEvent to log
        """
        raise NotImplementedError("AuditLogger.log_event must be implemented")
    
    def query_events(self, **filters) -> list:
        """
        Query audit events.
        
        Args:
            **filters: Filter criteria
            
        Returns:
            List of matching AuditEvent objects
        """
        raise NotImplementedError("AuditLogger.query_events must be implemented")


# ============================================================================
# SIMPLE FILE-BASED AUDIT LOGGER
# ============================================================================

class JsonlAuditLogger(AuditLogger):
    """
    Simple JSONL-based audit logger.
    
    Writes audit events to JSONL files for persistence and querying.
    Follows the pattern used by orchestrator_logger.py.
    """
    
    def __init__(self, log_dir: str):
        """
        Initialize JSONL audit logger.
        
        Args:
            log_dir: Directory to store audit log files
        """
        import os
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.log_file = os.path.join(log_dir, "mcp_audit.jsonl")
    
    def log_event(self, event: AuditEvent) -> None:
        """Log an audit event to JSONL file."""
        import json
        
        try:
            # Convert event to dict (handle datetime serialization)
            event_dict = event.model_dump()
            event_dict["timestamp"] = event.timestamp.isoformat()
            
            # Append to JSONL file
            with open(self.log_file, "a") as f:
                f.write(json.dumps(event_dict) + "\n")
            
            logger.debug(f"Logged audit event: {event.event_type}")
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
            # Don't raise - logging failure shouldn't break enforcement
    
    def query_events(self, **filters) -> list:
        """
        Query audit events from JSONL file.
        
        Simple implementation - loads all events and filters in memory.
        For production, consider SQLite or dedicated logging system.
        """
        import json
        
        events = []
        
        try:
            with open(self.log_file, "r") as f:
                for line in f:
                    if not line.strip():
                        continue
                    
                    event_dict = json.loads(line)
                    # Apply filters
                    match = True
                    for key, value in filters.items():
                        if event_dict.get(key) != value:
                            match = False
                            break
                    
                    if match:
                        events.append(event_dict)
        except FileNotFoundError:
            pass  # No events yet
        except Exception as e:
            logger.error(f"Failed to query audit events: {e}")
        
        return events


# ============================================================================
# REDACTION UTILITIES
# ============================================================================

class Redactor:
    """Utility for redacting sensitive data from payloads."""
    
    @staticmethod
    def redact_fields(
        data: Dict[str, Any],
        field_paths: list,
        method: str = "mask"
    ) -> tuple[Dict[str, Any], list]:
        """
        Redact specified fields from data.
        
        Args:
            data: Data to redact
            field_paths: List of field paths to redact (e.g., ["args.api_key"])
            method: Redaction method (mask, hash, remove, partial)
            
        Returns:
            Tuple of (redacted_data, redacted_field_list)
        """
        import copy
        import hashlib
        
        redacted_data = copy.deepcopy(data)
        redacted_fields = []
        
        for field_path in field_paths:
            parts = field_path.split(".")
            
            # Navigate to the field
            current = redacted_data
            for i, part in enumerate(parts[:-1]):
                # Handle array indexing
                if "[" in part:
                    key, idx = part.split("[")
                    idx = int(idx.rstrip("]"))
                    current = current.get(key, [])[idx]
                else:
                    current = current.get(part, {})
                
                if not isinstance(current, dict):
                    break
            
            # Redact the final field
            final_key = parts[-1]
            if "[" in final_key:
                key, idx = final_key.split("[")
                idx = int(idx.rstrip("]"))
                if key in current and idx < len(current[key]):
                    original_value = current[key][idx]
                    current[key][idx] = Redactor._apply_redaction(original_value, method)
                    redacted_fields.append(field_path)
            else:
                if final_key in current:
                    original_value = current[final_key]
                    current[final_key] = Redactor._apply_redaction(original_value, method)
                    redacted_fields.append(field_path)
        
        return redacted_data, redacted_fields
    
    @staticmethod
    def _apply_redaction(value: Any, method: str) -> Any:
        """Apply redaction method to a value."""
        import hashlib
        
        if value is None:
            return None
        
        value_str = str(value)
        
        if method == "mask":
            return "***REDACTED***"
        elif method == "hash":
            return hashlib.sha256(value_str.encode()).hexdigest()[:16]
        elif method == "remove":
            return None
        elif method == "partial":
            if len(value_str) <= 4:
                return "***"
            return f"{value_str[:2]}***{value_str[-2:]}"
        else:
            return "***REDACTED***"


# ============================================================================
# RUNTIME ENFORCER
# ============================================================================

@dataclass
class EnforcementResult:
    """Result of enforcement check."""
    allowed: bool
    policy_result: PolicyResult
    audit_event_id: str


class RuntimeEnforcer:
    """
    Runtime enforcement for MCP tool calls.
    
    Responsibilities:
    1. Intercept tool calls before execution
    2. Evaluate policy decisions
    3. Block denied calls
    4. Log all decisions and executions
    5. Apply redaction to sensitive data
    
    This is the main integration point between the orchestrator and the
    MCP governance system.
    """
    
    def __init__(
        self,
        policy_engine: PolicyEngine,
        audit_logger: AuditLogger
    ):
        """
        Initialize runtime enforcer.
        
        Args:
            policy_engine: Policy engine for decision making
            audit_logger: Logger for audit events
        """
        self.policy_engine = policy_engine
        self.audit_logger = audit_logger
    
    def enforce_tool_call(
        self,
        context: RunContext,
        request: ToolCallRequest
    ) -> EnforcementResult:
        """
        Enforce policy on a tool call request.
        
        This is the primary integration point. Call this BEFORE executing
        any MCP tool call.
        
        Workflow:
        1. Evaluate policy
        2. Log policy decision
        3. Return allow/deny result
        
        Args:
            context: Run context
            request: Tool call request
            
        Returns:
            EnforcementResult with decision
            
        Raises:
            EnforcementError: If enforcement fails
        """
        try:
            start_time = datetime.utcnow()
            
            # Step 1: Evaluate policy
            policy_result = self.policy_engine.evaluate(context, request)
            
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Step 2: Redact request if needed
            redacted_request = request.arguments
            redacted_fields = []
            
            if policy_result.redact_request_fields:
                redacted_request, redacted_fields = Redactor.redact_fields(
                    request.arguments,
                    policy_result.redact_request_fields,
                    policy_result.redaction_method.value
                )
            
            # Step 3: Create audit event
            event_id = str(uuid.uuid4())
            
            if policy_result.decision == PolicyDecision.ALLOW:
                event_type = AuditEventType.TOOL_CALL_ALLOWED
            else:
                event_type = AuditEventType.TOOL_CALL_DENIED
            
            audit_event = AuditEvent(
                event_id=event_id,
                event_type=event_type,
                timestamp=datetime.utcnow(),
                run_id=context.run_id,
                job_id=context.job_id,
                user_id=context.user_id,
                server_id=request.server_id,
                tool_name=request.tool_name,
                decision=policy_result.decision.value,
                reason=policy_result.reason,
                policy_name=policy_result.policy_name,
                request_payload=redacted_request,
                redacted_fields=redacted_fields,
                duration_ms=duration_ms,
                metadata={
                    "matched_allowlist": policy_result.matched_allowlist,
                    "matched_rule": policy_result.matched_rule,
                    "risk_score": policy_result.risk_score
                }
            )
            
            # Step 4: Log audit event
            self.audit_logger.log_event(audit_event)
            
            # Step 5: Return result
            return EnforcementResult(
                allowed=(policy_result.decision == PolicyDecision.ALLOW),
                policy_result=policy_result,
                audit_event_id=event_id
            )
            
        except Exception as e:
            logger.error(f"Enforcement failed: {e}", exc_info=True)
            
            # Log enforcement failure
            event_id = str(uuid.uuid4())
            audit_event = AuditEvent(
                event_id=event_id,
                event_type=AuditEventType.TOOL_CALL_DENIED,
                timestamp=datetime.utcnow(),
                run_id=context.run_id,
                job_id=context.job_id,
                user_id=context.user_id,
                server_id=request.server_id,
                tool_name=request.tool_name,
                decision="deny",
                reason=f"Enforcement error: {str(e)}",
                policy_name="error_handler",
                metadata={"error": str(e)}
            )
            self.audit_logger.log_event(audit_event)
            
            # Fail-secure: deny on error
            raise EnforcementError(f"Policy enforcement failed: {e}") from e
    
    def log_tool_execution(
        self,
        context: RunContext,
        request: ToolCallRequest,
        response: Dict[str, Any],
        success: bool,
        duration_ms: float,
        enforcement_result: EnforcementResult
    ) -> None:
        """
        Log tool execution result.
        
        Call this AFTER executing an MCP tool call to log the execution
        and response.
        
        Args:
            context: Run context
            request: Tool call request
            response: Tool response
            success: Whether execution succeeded
            duration_ms: Execution duration in milliseconds
            enforcement_result: Result from enforce_tool_call
        """
        try:
            # Apply response redaction if needed
            redacted_response = response
            response_redacted_fields = []
            
            if enforcement_result.policy_result.redact_response_fields:
                redacted_response, response_redacted_fields = Redactor.redact_fields(
                    response,
                    enforcement_result.policy_result.redact_response_fields,
                    enforcement_result.policy_result.redaction_method.value
                )
            
            # Create execution audit event
            event_type = AuditEventType.TOOL_CALL_EXECUTED if success else AuditEventType.TOOL_CALL_FAILED
            
            audit_event = AuditEvent(
                event_id=str(uuid.uuid4()),
                event_type=event_type,
                timestamp=datetime.utcnow(),
                run_id=context.run_id,
                job_id=context.job_id,
                user_id=context.user_id,
                server_id=request.server_id,
                tool_name=request.tool_name,
                decision="allow",  # Only executed if allowed
                reason="Execution completed" if success else "Execution failed",
                policy_name=enforcement_result.policy_result.policy_name,
                response_payload=redacted_response,
                redacted_fields=response_redacted_fields,
                duration_ms=duration_ms,
                metadata={
                    "enforcement_event_id": enforcement_result.audit_event_id,
                    "success": success
                }
            )
            
            self.audit_logger.log_event(audit_event)
            
        except Exception as e:
            logger.error(f"Failed to log tool execution: {e}", exc_info=True)
            # Don't raise - logging failure shouldn't break execution


# ============================================================================
# INTEGRATION HELPERS
# ============================================================================

def create_runtime_enforcer(
    policy_engine: PolicyEngine,
    audit_log_dir: str = "./data/audit"
) -> RuntimeEnforcer:
    """
    Factory function to create a RuntimeEnforcer with default configuration.
    
    Args:
        policy_engine: Configured policy engine
        audit_log_dir: Directory for audit logs
        
    Returns:
        Configured RuntimeEnforcer
    """
    audit_logger = JsonlAuditLogger(audit_log_dir)
    return RuntimeEnforcer(policy_engine, audit_logger)


def enforce_and_execute(
    enforcer: RuntimeEnforcer,
    context: RunContext,
    request: ToolCallRequest,
    execute_fn: callable
) -> Dict[str, Any]:
    """
    Helper function that combines enforcement and execution.
    
    Simplifies the integration by handling the full flow:
    1. Enforce policy
    2. Execute if allowed
    3. Log execution
    4. Raise exception if denied
    
    Args:
        enforcer: RuntimeEnforcer instance
        context: Run context
        request: Tool call request
        execute_fn: Function to call if allowed (signature: () -> Dict[str, Any])
        
    Returns:
        Tool execution response
        
    Raises:
        PolicyDeniedError: If policy denies the call
    """
    start_time = datetime.utcnow()
    
    # Step 1: Enforce policy
    enforcement_result = enforcer.enforce_tool_call(context, request)
    
    if not enforcement_result.allowed:
        raise PolicyDeniedError(
            enforcement_result.policy_result.reason,
            enforcement_result.policy_result
        )
    
    # Step 2: Execute
    try:
        response = execute_fn()
        success = True
    except Exception as e:
        logger.error(f"Tool execution failed: {e}", exc_info=True)
        response = {"error": str(e)}
        success = False
    
    # Step 3: Log execution
    duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
    enforcer.log_tool_execution(
        context,
        request,
        response,
        success,
        duration_ms,
        enforcement_result
    )
    
    # Step 4: Return or raise
    if not success:
        raise Exception(f"Tool execution failed: {response.get('error')}")
    
    return response
