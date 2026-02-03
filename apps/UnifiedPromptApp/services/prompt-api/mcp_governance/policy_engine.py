"""
Policy Engine for MCP Governance.

The Policy Engine evaluates whether an MCP tool call should be allowed or denied.
It considers:
- Allowlist configuration (what's explicitly permitted)
- Install record status (is the server enabled?)
- Run/job context (who is requesting? what scope?)
- Tool arguments metadata (does it contain sensitive data?)

Default policy: DENY (fail-secure)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import re


# ============================================================================
# POLICY DECISION
# ============================================================================

class PolicyDecision(str, Enum):
    """Result of policy evaluation."""
    ALLOW = "allow"
    DENY = "deny"


class RedactionDirective(str, Enum):
    """How to redact sensitive data."""
    MASK = "mask"              # Replace with ****
    HASH = "hash"              # One-way hash
    REMOVE = "remove"          # Remove field entirely
    PARTIAL = "partial"        # Show first/last chars only


@dataclass
class PolicyResult:
    """
    Result of policy evaluation.
    
    Contains:
    - Decision (allow/deny)
    - Reason (human-readable explanation)
    - Redaction directives (which fields to redact and how)
    - Metadata (for audit logging)
    """
    decision: PolicyDecision
    reason: str
    policy_name: str
    
    # Redaction directives
    redact_request_fields: List[str] = None
    redact_response_fields: List[str] = None
    redaction_method: RedactionDirective = RedactionDirective.MASK
    
    # Additional metadata
    matched_allowlist: Optional[str] = None
    matched_rule: Optional[str] = None
    risk_score: Optional[float] = None
    
    def __post_init__(self):
        if self.redact_request_fields is None:
            self.redact_request_fields = []
        if self.redact_response_fields is None:
            self.redact_response_fields = []


# ============================================================================
# RUN CONTEXT
# ============================================================================

@dataclass
class RunContext:
    """
    Context for the current orchestration run or job.
    
    Provides the policy engine with information about:
    - Who is making the request (user)
    - What they're trying to do (run/job)
    - What scope applies (run, job, global)
    """
    run_id: Optional[str] = None
    job_id: Optional[str] = None
    user_id: str = "system"
    
    # Scope for allowlist lookup
    scope_type: str = "run"  # run, job, user, global
    scope_id: str = None
    
    # Additional context
    agent_id: Optional[str] = None
    orchestrator_version: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        if self.scope_id is None:
            # Default scope_id based on scope_type
            if self.scope_type == "run" and self.run_id:
                self.scope_id = self.run_id
            elif self.scope_type == "job" and self.job_id:
                self.scope_id = self.job_id
            elif self.scope_type == "user":
                self.scope_id = self.user_id
            else:
                self.scope_id = "global"


# ============================================================================
# TOOL CALL REQUEST
# ============================================================================

@dataclass
class ToolCallRequest:
    """
    Request to invoke an MCP tool.
    
    Contains:
    - Server ID (which MCP server)
    - Tool name (which tool on that server)
    - Arguments (tool input parameters)
    - Metadata (for policy evaluation)
    """
    server_id: str
    tool_name: str
    arguments: Dict[str, Any]
    
    # Optional metadata for policy evaluation
    server_capabilities: List[str] = None
    argument_schema: Optional[Dict[str, Any]] = None
    estimated_cost: Optional[float] = None
    estimated_duration_ms: Optional[float] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.server_capabilities is None:
            self.server_capabilities = []
        if self.metadata is None:
            self.metadata = {}
    
    @property
    def full_tool_name(self) -> str:
        """Fully qualified tool name: server_id:tool_name"""
        return f"{self.server_id}:{self.tool_name}"


# ============================================================================
# POLICY ENGINE INTERFACE
# ============================================================================

class PolicyEngine(ABC):
    """
    Abstract base class for MCP policy engines.
    
    Policy engines evaluate tool call requests and return allow/deny decisions.
    
    Implementations must:
    1. Check allowlists (is this server/tool permitted?)
    2. Check install status (is the server enabled?)
    3. Evaluate risk (does the request contain sensitive data?)
    4. Return decision + reason + redaction directives
    
    Default behavior: DENY (fail-secure)
    """
    
    @abstractmethod
    def evaluate(
        self,
        context: RunContext,
        request: ToolCallRequest
    ) -> PolicyResult:
        """
        Evaluate a tool call request.
        
        Args:
            context: Run context (who, what, where)
            request: Tool call request (server, tool, args)
            
        Returns:
            PolicyResult with decision, reason, and redaction directives
        """
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Return the name of this policy engine."""
        pass


# ============================================================================
# DEFAULT POLICY ENGINE
# ============================================================================

class DefaultPolicyEngine(PolicyEngine):
    """
    Default policy engine implementation.
    
    Enforces:
    1. Deny by default (explicit allowlist required)
    2. Check server installation status
    3. Check allowlist for run/job/user/global
    4. Apply redaction rules for sensitive fields
    
    Evaluation order:
    1. Check if server is installed and enabled
    2. Check explicit denials (denied_servers, denied_tools)
    3. Check explicit allows (allowed_servers, allowed_collections, allowed_tools)
    4. Check for sensitive data in arguments
    5. Default: DENY
    """
    
    def __init__(
        self,
        install_records: Dict[str, Any],
        allowlists: Dict[str, Any],
        collections: Dict[str, Any],
        redaction_patterns: Optional[List[str]] = None
    ):
        """
        Initialize default policy engine.
        
        Args:
            install_records: Map of server_id -> InstallRecord
            allowlists: Map of allowlist_id -> Allowlist
            collections: Map of collection_id -> Collection
            redaction_patterns: Regex patterns for sensitive data
        """
        self.install_records = install_records
        self.allowlists = allowlists
        self.collections = collections
        
        # Default redaction patterns
        self.redaction_patterns = redaction_patterns or [
            r'api[_-]?key',
            r'secret',
            r'password',
            r'token',
            r'credential',
            r'auth',
            r'bearer',
        ]
    
    def get_name(self) -> str:
        """Return policy engine name."""
        return "default"
    
    def evaluate(
        self,
        context: RunContext,
        request: ToolCallRequest
    ) -> PolicyResult:
        """
        Evaluate tool call request.
        
        Evaluation steps:
        1. Check installation status
        2. Find applicable allowlist
        3. Check explicit denials
        4. Check explicit allows
        5. Detect sensitive data
        6. Make decision
        
        Args:
            context: Run context
            request: Tool call request
            
        Returns:
            PolicyResult
        """
        
        # Step 1: Check installation status
        install_check = self._check_installation(request.server_id)
        if not install_check["enabled"]:
            return PolicyResult(
                decision=PolicyDecision.DENY,
                reason=f"Server '{request.server_id}' is not installed or enabled: {install_check['reason']}",
                policy_name=self.get_name()
            )
        
        # Step 2: Find applicable allowlist
        allowlist = self._find_allowlist(context)
        if not allowlist:
            return PolicyResult(
                decision=PolicyDecision.DENY,
                reason=f"No allowlist found for scope '{context.scope_type}:{context.scope_id}'",
                policy_name=self.get_name()
            )
        
        # Step 3: Check explicit denials
        denial_check = self._check_denials(allowlist, request)
        if denial_check["denied"]:
            return PolicyResult(
                decision=PolicyDecision.DENY,
                reason=f"Explicitly denied: {denial_check['reason']}",
                policy_name=self.get_name(),
                matched_allowlist=allowlist.get("allowlist_id")
            )
        
        # Step 4: Check explicit allows
        allow_check = self._check_allows(allowlist, request)
        if not allow_check["allowed"]:
            return PolicyResult(
                decision=PolicyDecision.DENY,
                reason=f"Not in allowlist: {allow_check['reason']}",
                policy_name=self.get_name(),
                matched_allowlist=allowlist.get("allowlist_id")
            )
        
        # Step 5: Detect sensitive data
        sensitive_fields = self._detect_sensitive_fields(request.arguments)
        
        # Step 6: ALLOW with redaction
        return PolicyResult(
            decision=PolicyDecision.ALLOW,
            reason=allow_check["reason"],
            policy_name=self.get_name(),
            matched_allowlist=allowlist.get("allowlist_id"),
            matched_rule=allow_check.get("matched_rule"),
            redact_request_fields=sensitive_fields,
            redaction_method=RedactionDirective.MASK
        )
    
    def _check_installation(self, server_id: str) -> Dict[str, Any]:
        """
        Check if server is installed and enabled.
        
        Args:
            server_id: Server to check
            
        Returns:
            Dict with 'enabled' (bool) and 'reason' (str)
        """
        if server_id not in self.install_records:
            return {
                "enabled": False,
                "reason": "Server not found in install records"
            }
        
        record = self.install_records[server_id]
        status = record.get("status", "unknown")
        
        if status != "enabled":
            return {
                "enabled": False,
                "reason": f"Server status is '{status}' (must be 'enabled')"
            }
        
        return {
            "enabled": True,
            "reason": "Server is enabled"
        }
    
    def _find_allowlist(self, context: RunContext) -> Optional[Dict[str, Any]]:
        """
        Find applicable allowlist for the given context.
        
        Search order:
        1. Run-specific allowlist (if run_id present)
        2. Job-specific allowlist (if job_id present)
        3. User-specific allowlist
        4. Global allowlist
        
        Args:
            context: Run context
            
        Returns:
            Allowlist dict or None
        """
        # Build search keys in priority order
        search_keys = []
        
        if context.run_id:
            search_keys.append(("run", context.run_id))
        if context.job_id:
            search_keys.append(("job", context.job_id))
        
        search_keys.append(("user", context.user_id))
        search_keys.append(("global", "global"))
        
        # Search for matching allowlist
        for scope, scope_id in search_keys:
            for allowlist in self.allowlists.values():
                if allowlist.get("scope") == scope and allowlist.get("scope_id") == scope_id:
                    # Check expiration
                    expires_at = allowlist.get("expires_at")
                    if expires_at:
                        if isinstance(expires_at, str):
                            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                        if datetime.utcnow() > expires_at:
                            continue  # Expired, skip
                    
                    return allowlist
        
        return None
    
    def _check_denials(
        self,
        allowlist: Dict[str, Any],
        request: ToolCallRequest
    ) -> Dict[str, Any]:
        """
        Check if request is explicitly denied.
        
        Args:
            allowlist: Allowlist to check
            request: Tool call request
            
        Returns:
            Dict with 'denied' (bool) and 'reason' (str)
        """
        denied_servers = allowlist.get("denied_servers", [])
        denied_tools = allowlist.get("denied_tools", [])
        
        # Check denied servers
        if request.server_id in denied_servers:
            return {
                "denied": True,
                "reason": f"Server '{request.server_id}' is in denied_servers list"
            }
        
        # Check denied tools
        if request.full_tool_name in denied_tools:
            return {
                "denied": True,
                "reason": f"Tool '{request.full_tool_name}' is in denied_tools list"
            }
        
        return {
            "denied": False,
            "reason": "Not explicitly denied"
        }
    
    def _check_allows(
        self,
        allowlist: Dict[str, Any],
        request: ToolCallRequest
    ) -> Dict[str, Any]:
        """
        Check if request is explicitly allowed.
        
        Args:
            allowlist: Allowlist to check
            request: Tool call request
            
        Returns:
            Dict with 'allowed' (bool), 'reason' (str), and optional 'matched_rule' (str)
        """
        allowed_servers = allowlist.get("allowed_servers", [])
        allowed_collections = allowlist.get("allowed_collections", [])
        allowed_tools = allowlist.get("allowed_tools")
        
        # Check if server is in allowed_servers
        if request.server_id in allowed_servers:
            # If allowed_tools is specified, check if tool is in list
            if allowed_tools is not None:
                if request.full_tool_name in allowed_tools:
                    return {
                        "allowed": True,
                        "reason": f"Tool '{request.full_tool_name}' is in allowed_tools list",
                        "matched_rule": "allowed_tools"
                    }
                else:
                    return {
                        "allowed": False,
                        "reason": f"Tool '{request.full_tool_name}' not in allowed_tools list"
                    }
            else:
                # No tool restriction, allow all tools from this server
                return {
                    "allowed": True,
                    "reason": f"Server '{request.server_id}' is in allowed_servers",
                    "matched_rule": "allowed_servers"
                }
        
        # Check if server is in any allowed collection
        for collection_id in allowed_collections:
            collection = self.collections.get(collection_id)
            if collection and request.server_id in collection.get("server_ids", []):
                # Same tool check as above
                if allowed_tools is not None:
                    if request.full_tool_name in allowed_tools:
                        return {
                            "allowed": True,
                            "reason": f"Tool '{request.full_tool_name}' allowed via collection '{collection_id}'",
                            "matched_rule": f"collection:{collection_id}"
                        }
                    else:
                        return {
                            "allowed": False,
                            "reason": f"Tool '{request.full_tool_name}' not in allowed_tools list"
                        }
                else:
                    return {
                        "allowed": True,
                        "reason": f"Server '{request.server_id}' allowed via collection '{collection_id}'",
                        "matched_rule": f"collection:{collection_id}"
                    }
        
        # Not in any allow list
        return {
            "allowed": False,
            "reason": f"Server '{request.server_id}' not in allowed_servers or allowed_collections"
        }
    
    def _detect_sensitive_fields(self, arguments: Dict[str, Any]) -> List[str]:
        """
        Detect fields that may contain sensitive data.
        
        Uses regex patterns to identify field names that typically contain
        sensitive data (API keys, passwords, tokens, etc.).
        
        Args:
            arguments: Tool arguments to scan
            
        Returns:
            List of field paths that should be redacted
        """
        sensitive_fields = []
        
        def scan_dict(obj: Dict[str, Any], prefix: str = ""):
            for key, value in obj.items():
                field_path = f"{prefix}.{key}" if prefix else key
                
                # Check if key matches any redaction pattern
                key_lower = key.lower()
                for pattern in self.redaction_patterns:
                    if re.search(pattern, key_lower, re.IGNORECASE):
                        sensitive_fields.append(field_path)
                        break
                
                # Recursively scan nested dicts
                if isinstance(value, dict):
                    scan_dict(value, field_path)
                elif isinstance(value, list):
                    for i, item in enumerate(value):
                        if isinstance(item, dict):
                            scan_dict(item, f"{field_path}[{i}]")
        
        scan_dict(arguments)
        return sensitive_fields
