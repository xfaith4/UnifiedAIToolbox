"""
Data models for MCP governance system.

Defines schemas for:
- Install records (tracking MCP server installations)
- Collections (grouping MCP servers)
- Allowlists (controlling tool access per run/job)
- Audit events (logging policy decisions and tool invocations)
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# INSTALL RECORDS
# ============================================================================

class InstallStatus(str, Enum):
    """Status of an MCP server installation."""
    ENABLED = "enabled"
    DISABLED = "disabled"
    PENDING = "pending"
    FAILED = "failed"
    DEPRECATED = "deprecated"


class InstallRecord(BaseModel):
    """
    Tracks the installation and enablement status of an MCP server.
    
    Install records distinguish between:
    - Available servers (in catalog)
    - Installed servers (downloaded/configured)
    - Enabled servers (active and available for tool calls)
    """
    install_id: str = Field(..., description="Unique identifier for this installation")
    server_id: str = Field(..., description="MCP server ID (from registry)")
    status: InstallStatus = Field(default=InstallStatus.ENABLED, description="Installation status")
    
    installed_at: datetime = Field(default_factory=datetime.utcnow, description="When server was installed")
    installed_by: str = Field(..., description="User who installed the server")
    
    enabled_at: Optional[datetime] = Field(None, description="When server was enabled")
    disabled_at: Optional[datetime] = Field(None, description="When server was disabled")
    
    version: Optional[str] = Field(None, description="Installed version of the server")
    config: Dict[str, Any] = Field(default_factory=dict, description="Server-specific configuration")
    
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    notes: Optional[str] = Field(None, description="Admin notes about this installation")


class InstallRecordCreate(BaseModel):
    """Request to create a new install record."""
    server_id: str = Field(..., description="MCP server ID to install")
    config: Dict[str, Any] = Field(default_factory=dict, description="Initial configuration")
    notes: Optional[str] = Field(None, description="Installation notes")


class InstallRecordUpdate(BaseModel):
    """Request to update an existing install record."""
    status: Optional[InstallStatus] = Field(None, description="New status")
    config: Optional[Dict[str, Any]] = Field(None, description="Updated configuration")
    notes: Optional[str] = Field(None, description="Updated notes")


# ============================================================================
# COLLECTIONS
# ============================================================================

class Collection(BaseModel):
    """
    A named collection of MCP servers grouped for convenience.
    
    Collections allow admins to:
    - Group related servers (e.g., "data-analysis", "web-automation")
    - Apply policies to multiple servers at once
    - Simplify allowlist management
    """
    collection_id: str = Field(..., description="Unique identifier for the collection")
    name: str = Field(..., description="Human-readable collection name")
    description: Optional[str] = Field(None, description="Collection purpose and contents")
    
    server_ids: List[str] = Field(default_factory=list, description="List of MCP server IDs in this collection")
    tags: List[str] = Field(default_factory=list, description="Tags for filtering/discovery")
    
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When collection was created")
    created_by: str = Field(..., description="User who created the collection")
    updated_at: Optional[datetime] = Field(None, description="When collection was last updated")
    
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class CollectionCreate(BaseModel):
    """Request to create a new collection."""
    name: str = Field(..., description="Collection name")
    description: Optional[str] = Field(None, description="Collection description")
    server_ids: List[str] = Field(default_factory=list, description="Initial server IDs")
    tags: List[str] = Field(default_factory=list, description="Collection tags")


class CollectionUpdate(BaseModel):
    """Request to update an existing collection."""
    name: Optional[str] = Field(None, description="Updated name")
    description: Optional[str] = Field(None, description="Updated description")
    server_ids: Optional[List[str]] = Field(None, description="Updated server IDs")
    tags: Optional[List[str]] = Field(None, description="Updated tags")


# ============================================================================
# ALLOWLISTS
# ============================================================================

class AllowlistScope(str, Enum):
    """Scope of an allowlist binding."""
    RUN = "run"              # Single orchestration run
    JOB = "job"              # Recurring job/workflow
    USER = "user"            # User-level default
    GLOBAL = "global"        # System-wide default


class Allowlist(BaseModel):
    """
    Allowlist binding that controls which MCP servers/tools are available.
    
    Allowlists enforce the principle of least privilege:
    - By default, deny all MCP access
    - Explicit allowlist required for each run/job
    - Can reference servers by ID or collection
    - Can restrict specific tools within a server
    """
    allowlist_id: str = Field(..., description="Unique identifier for this allowlist")
    scope: AllowlistScope = Field(..., description="What this allowlist applies to")
    scope_id: str = Field(..., description="ID of the run, job, user, or 'global'")
    
    # What is allowed
    allowed_servers: List[str] = Field(default_factory=list, description="Allowed MCP server IDs")
    allowed_collections: List[str] = Field(default_factory=list, description="Allowed collection IDs")
    
    # Optional: restrict to specific tools
    allowed_tools: Optional[List[str]] = Field(
        None, 
        description="If set, only these specific tools are allowed (format: 'server_id:tool_name')"
    )
    
    # Optional: explicit denials (override allows)
    denied_servers: List[str] = Field(default_factory=list, description="Explicitly denied server IDs")
    denied_tools: List[str] = Field(default_factory=list, description="Explicitly denied tools")
    
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When allowlist was created")
    created_by: str = Field(..., description="User who created the allowlist")
    updated_at: Optional[datetime] = Field(None, description="When allowlist was last updated")
    
    expires_at: Optional[datetime] = Field(None, description="When allowlist expires (None = never)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class AllowlistCreate(BaseModel):
    """Request to create a new allowlist."""
    scope: AllowlistScope = Field(..., description="Allowlist scope")
    scope_id: str = Field(..., description="Scope identifier")
    allowed_servers: List[str] = Field(default_factory=list, description="Allowed servers")
    allowed_collections: List[str] = Field(default_factory=list, description="Allowed collections")
    allowed_tools: Optional[List[str]] = Field(None, description="Allowed tools")
    denied_servers: List[str] = Field(default_factory=list, description="Denied servers")
    denied_tools: List[str] = Field(default_factory=list, description="Denied tools")
    expires_at: Optional[datetime] = Field(None, description="Expiration time")


class AllowlistUpdate(BaseModel):
    """Request to update an existing allowlist."""
    allowed_servers: Optional[List[str]] = Field(None, description="Updated allowed servers")
    allowed_collections: Optional[List[str]] = Field(None, description="Updated allowed collections")
    allowed_tools: Optional[List[str]] = Field(None, description="Updated allowed tools")
    denied_servers: Optional[List[str]] = Field(None, description="Updated denied servers")
    denied_tools: Optional[List[str]] = Field(None, description="Updated denied tools")
    expires_at: Optional[datetime] = Field(None, description="Updated expiration")


# ============================================================================
# AUDIT EVENTS
# ============================================================================

class AuditEventType(str, Enum):
    """Type of audit event."""
    # MCP lifecycle events
    MCP_SERVER_DISCOVERED = "mcp.server.discovered"
    MCP_SERVER_INSTALLED = "mcp.server.installed"
    MCP_SERVER_ENABLED = "mcp.server.enabled"
    MCP_SERVER_DISABLED = "mcp.server.disabled"
    MCP_SERVER_REMOVED = "mcp.server.removed"
    
    # Policy events
    POLICY_DECISION = "policy.decision"
    POLICY_ALLOW = "policy.allow"
    POLICY_DENY = "policy.deny"
    
    # Tool invocation events
    TOOL_CALL_REQUESTED = "tool.call.requested"
    TOOL_CALL_ALLOWED = "tool.call.allowed"
    TOOL_CALL_DENIED = "tool.call.denied"
    TOOL_CALL_EXECUTED = "tool.call.executed"
    TOOL_CALL_FAILED = "tool.call.failed"
    
    # Collection events
    COLLECTION_CREATED = "collection.created"
    COLLECTION_UPDATED = "collection.updated"
    COLLECTION_DELETED = "collection.deleted"
    
    # Allowlist events
    ALLOWLIST_CREATED = "allowlist.created"
    ALLOWLIST_UPDATED = "allowlist.updated"
    ALLOWLIST_DELETED = "allowlist.deleted"
    ALLOWLIST_EXPIRED = "allowlist.expired"


class RedactionRule(BaseModel):
    """
    Rule for redacting sensitive data in audit logs.
    
    Redaction protects:
    - API keys and tokens
    - Passwords and credentials
    - PII (personally identifiable information)
    - Sensitive business data
    """
    field_path: str = Field(..., description="JSON path to field to redact (e.g., 'args.api_key')")
    redaction_type: str = Field(
        default="mask",
        description="Redaction strategy: mask, hash, remove, partial"
    )
    pattern: Optional[str] = Field(None, description="Regex pattern to match (if partial redaction)")


class AuditEvent(BaseModel):
    """
    Audit event capturing MCP governance decisions and actions.
    
    Every policy decision, tool call, and administrative action is logged
    for compliance, debugging, and security analysis.
    """
    event_id: str = Field(..., description="Unique event identifier")
    event_type: AuditEventType = Field(..., description="Type of event")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When event occurred")
    
    # Context
    run_id: Optional[str] = Field(None, description="Associated run ID")
    job_id: Optional[str] = Field(None, description="Associated job ID")
    user_id: str = Field(..., description="User who triggered the action")
    
    # MCP context
    server_id: Optional[str] = Field(None, description="MCP server ID")
    tool_name: Optional[str] = Field(None, description="Tool name (if tool call)")
    
    # Policy decision
    decision: Optional[str] = Field(None, description="Policy decision: allow or deny")
    reason: Optional[str] = Field(None, description="Human-readable reason for decision")
    policy_name: Optional[str] = Field(None, description="Policy that made the decision")
    
    # Payload (redacted)
    request_payload: Optional[Dict[str, Any]] = Field(
        None, 
        description="Original request (may be redacted)"
    )
    response_payload: Optional[Dict[str, Any]] = Field(
        None,
        description="Response data (may be redacted)"
    )
    
    # Redaction tracking
    redacted_fields: List[str] = Field(
        default_factory=list,
        description="List of fields that were redacted"
    )
    
    # Performance
    duration_ms: Optional[float] = Field(None, description="Duration in milliseconds")
    
    # Additional context
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional event metadata")
    tags: List[str] = Field(default_factory=list, description="Tags for filtering/search")


class AuditEventQuery(BaseModel):
    """Query parameters for searching audit events."""
    event_types: Optional[List[AuditEventType]] = Field(None, description="Filter by event types")
    run_id: Optional[str] = Field(None, description="Filter by run ID")
    job_id: Optional[str] = Field(None, description="Filter by job ID")
    user_id: Optional[str] = Field(None, description="Filter by user ID")
    server_id: Optional[str] = Field(None, description="Filter by server ID")
    tool_name: Optional[str] = Field(None, description="Filter by tool name")
    decision: Optional[str] = Field(None, description="Filter by decision (allow/deny)")
    start_time: Optional[datetime] = Field(None, description="Events after this time")
    end_time: Optional[datetime] = Field(None, description="Events before this time")
    limit: int = Field(default=100, ge=1, le=1000, description="Maximum results")
    offset: int = Field(default=0, ge=0, description="Offset for pagination")
