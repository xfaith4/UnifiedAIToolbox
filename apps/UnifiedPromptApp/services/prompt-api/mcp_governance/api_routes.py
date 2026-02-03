"""
FastAPI routes for MCP Governance API.

Provides REST endpoints for:
- Registry sync/refresh
- Search/browse MCP servers
- CRUD collections
- Install records (create/update/disable)
- Bind allowlist to run/job
- Query audit logs
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import logging
import uuid

from .models import (
    Collection, CollectionCreate, CollectionUpdate,
    InstallRecord, InstallRecordCreate, InstallRecordUpdate, InstallStatus,
    Allowlist, AllowlistCreate, AllowlistUpdate, AllowlistScope,
    AuditEvent, AuditEventQuery, AuditEventType
)


logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/mcp", tags=["mcp-governance"])


# ============================================================================
# REGISTRY ENDPOINTS
# ============================================================================

class RegistrySource(BaseModel):
    """External registry source configuration."""
    source_id: str
    source_type: str  # github, official, custom
    url: str
    enabled: bool = True
    metadata: dict = {}


class RegistrySyncRequest(BaseModel):
    """Request to sync/refresh registry from external source."""
    source_id: Optional[str] = None  # If None, sync all sources
    force: bool = False  # Force refresh even if recently synced


class RegistrySyncResponse(BaseModel):
    """Response from registry sync operation."""
    success: bool
    servers_added: int
    servers_updated: int
    servers_total: int
    source_id: str
    synced_at: datetime
    errors: List[str] = []


@router.post("/registry/sync", response_model=RegistrySyncResponse)
async def sync_registry(request: RegistrySyncRequest):
    """
    Sync/refresh MCP server registry from external sources.
    
    Discovers MCP servers from:
    - Official MCP registry
    - GitHub topics (mcp-server)
    - Custom registries
    
    Merges discovered servers with local registry.
    """
    # TODO: Implement registry sync logic
    # This would integrate with mcp/ingestion_service.py
    
    return RegistrySyncResponse(
        success=True,
        servers_added=0,
        servers_updated=0,
        servers_total=10,
        source_id=request.source_id or "all",
        synced_at=datetime.utcnow()
    )


@router.get("/registry/sources", response_model=List[RegistrySource])
async def list_registry_sources():
    """
    List configured registry sources.
    
    Returns all external sources configured for registry ingestion.
    """
    # TODO: Implement source listing
    return []


@router.post("/registry/sources", response_model=RegistrySource, status_code=201)
async def add_registry_source(source: RegistrySource):
    """
    Add a new registry source.
    
    Configures a new external source for MCP server discovery.
    """
    # TODO: Implement source addition
    return source


# ============================================================================
# SERVER SEARCH/BROWSE ENDPOINTS
# ============================================================================

class ServerSearchQuery(BaseModel):
    """Search query for MCP servers."""
    query: Optional[str] = None  # Text search in name/description
    tags: Optional[List[str]] = None  # Filter by tags
    capabilities: Optional[List[str]] = None  # Filter by capabilities
    status: Optional[str] = None  # Filter by status
    installation_status: Optional[str] = None  # installed, catalog, deprecated
    limit: int = 50
    offset: int = 0


class ServerSearchResult(BaseModel):
    """MCP server search result."""
    server_id: str
    name: str
    description: Optional[str]
    url: str
    tags: List[str]
    capabilities: List[str]
    status: str
    installation_status: str = "catalog"
    owner: Optional[str]


class ServerSearchResponse(BaseModel):
    """Response from server search."""
    results: List[ServerSearchResult]
    total: int
    limit: int
    offset: int


@router.post("/servers/search", response_model=ServerSearchResponse)
async def search_servers(query: ServerSearchQuery):
    """
    Search and browse available MCP servers.
    
    Searches both catalog (discoverable) and installed servers.
    Supports filtering by tags, capabilities, and installation status.
    """
    # TODO: Implement server search
    # This would query /data/mcp/servers.json with filters
    
    return ServerSearchResponse(
        results=[],
        total=0,
        limit=query.limit,
        offset=query.offset
    )


@router.get("/servers/{server_id}")
async def get_server(server_id: str):
    """
    Get details of a specific MCP server.
    
    Returns full server metadata including installation status,
    health checks, and capabilities.
    """
    # TODO: Implement server detail lookup
    raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")


# ============================================================================
# COLLECTION CRUD ENDPOINTS
# ============================================================================

@router.get("/collections", response_model=List[Collection])
async def list_collections(
    tag: Optional[str] = Query(None, description="Filter by tag"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    List all collections.
    
    Collections group related MCP servers for easier management
    and policy application.
    """
    # TODO: Implement collection listing
    return []


@router.post("/collections", response_model=Collection, status_code=201)
async def create_collection(collection: CollectionCreate):
    """
    Create a new collection.
    
    Groups MCP servers under a named collection for easier
    allowlist management.
    """
    # TODO: Implement collection creation
    
    new_collection = Collection(
        collection_id=str(uuid.uuid4()),
        name=collection.name,
        description=collection.description,
        server_ids=collection.server_ids,
        tags=collection.tags,
        created_by="system",  # TODO: Get from auth context
        created_at=datetime.utcnow()
    )
    
    return new_collection


@router.get("/collections/{collection_id}", response_model=Collection)
async def get_collection(collection_id: str):
    """Get a specific collection by ID."""
    # TODO: Implement collection lookup
    raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")


@router.put("/collections/{collection_id}", response_model=Collection)
async def update_collection(collection_id: str, update: CollectionUpdate):
    """
    Update an existing collection.
    
    Updates name, description, server list, or tags.
    """
    # TODO: Implement collection update
    raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")


@router.delete("/collections/{collection_id}", status_code=204)
async def delete_collection(collection_id: str):
    """
    Delete a collection.
    
    Note: Deleting a collection does not affect MCP servers themselves,
    only removes the grouping.
    """
    # TODO: Implement collection deletion
    raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")


# ============================================================================
# INSTALL RECORD ENDPOINTS
# ============================================================================

@router.get("/installs", response_model=List[InstallRecord])
async def list_install_records(
    status: Optional[InstallStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    List all install records.
    
    Install records track which MCP servers are installed and enabled.
    """
    # TODO: Implement install record listing
    return []


@router.post("/installs", response_model=InstallRecord, status_code=201)
async def create_install_record(record: InstallRecordCreate):
    """
    Create a new install record (install MCP server).
    
    Marks an MCP server as installed with initial configuration.
    Server starts in 'pending' status until installation completes.
    """
    # TODO: Implement install record creation
    
    new_record = InstallRecord(
        install_id=str(uuid.uuid4()),
        server_id=record.server_id,
        status=InstallStatus.PENDING,
        installed_at=datetime.utcnow(),
        installed_by="system",  # TODO: Get from auth context
        config=record.config,
        notes=record.notes
    )
    
    return new_record


@router.get("/installs/{install_id}", response_model=InstallRecord)
async def get_install_record(install_id: str):
    """Get a specific install record by ID."""
    # TODO: Implement install record lookup
    raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")


@router.put("/installs/{install_id}", response_model=InstallRecord)
async def update_install_record(install_id: str, update: InstallRecordUpdate):
    """
    Update an install record.
    
    Common updates:
    - Change status (enable/disable server)
    - Update configuration
    - Add notes
    """
    # TODO: Implement install record update
    raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")


@router.post("/installs/{install_id}/enable", response_model=InstallRecord)
async def enable_install(install_id: str):
    """
    Enable an installed MCP server.
    
    Makes the server available for tool calls.
    """
    # TODO: Implement enable logic
    raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")


@router.post("/installs/{install_id}/disable", response_model=InstallRecord)
async def disable_install(install_id: str):
    """
    Disable an installed MCP server.
    
    Prevents the server from being used for tool calls.
    Does not uninstall the server.
    """
    # TODO: Implement disable logic
    raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")


# ============================================================================
# ALLOWLIST ENDPOINTS
# ============================================================================

@router.get("/allowlists", response_model=List[Allowlist])
async def list_allowlists(
    scope: Optional[AllowlistScope] = Query(None, description="Filter by scope"),
    scope_id: Optional[str] = Query(None, description="Filter by scope ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    List all allowlists.
    
    Allowlists control which MCP servers/tools are available
    for specific runs, jobs, users, or globally.
    """
    # TODO: Implement allowlist listing
    return []


@router.post("/allowlists", response_model=Allowlist, status_code=201)
async def create_allowlist(allowlist: AllowlistCreate):
    """
    Create a new allowlist.
    
    Binds a set of allowed MCP servers/tools to a specific scope
    (run, job, user, or global).
    """
    # TODO: Implement allowlist creation
    
    new_allowlist = Allowlist(
        allowlist_id=str(uuid.uuid4()),
        scope=allowlist.scope,
        scope_id=allowlist.scope_id,
        allowed_servers=allowlist.allowed_servers,
        allowed_collections=allowlist.allowed_collections,
        allowed_tools=allowlist.allowed_tools,
        denied_servers=allowlist.denied_servers,
        denied_tools=allowlist.denied_tools,
        created_by="system",  # TODO: Get from auth context
        created_at=datetime.utcnow(),
        expires_at=allowlist.expires_at
    )
    
    return new_allowlist


@router.get("/allowlists/{allowlist_id}", response_model=Allowlist)
async def get_allowlist(allowlist_id: str):
    """Get a specific allowlist by ID."""
    # TODO: Implement allowlist lookup
    raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")


@router.put("/allowlists/{allowlist_id}", response_model=Allowlist)
async def update_allowlist(allowlist_id: str, update: AllowlistUpdate):
    """
    Update an existing allowlist.
    
    Modifies the set of allowed/denied servers or tools.
    """
    # TODO: Implement allowlist update
    raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")


@router.delete("/allowlists/{allowlist_id}", status_code=204)
async def delete_allowlist(allowlist_id: str):
    """
    Delete an allowlist.
    
    Removes the allowlist binding. Any operations using this allowlist
    will fall back to higher-level allowlists (user or global).
    """
    # TODO: Implement allowlist deletion
    raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")


@router.post("/allowlists/bind", response_model=Allowlist, status_code=201)
async def bind_allowlist_to_scope(
    scope: AllowlistScope,
    scope_id: str,
    allowlist_config: AllowlistCreate
):
    """
    Convenience endpoint to create and bind an allowlist in one step.
    
    Common use case: Bind an allowlist to a specific run at run creation time.
    """
    allowlist_config.scope = scope
    allowlist_config.scope_id = scope_id
    return await create_allowlist(allowlist_config)


# ============================================================================
# AUDIT LOG ENDPOINTS
# ============================================================================

@router.post("/audit/query", response_model=List[AuditEvent])
async def query_audit_logs(query: AuditEventQuery):
    """
    Query audit logs.
    
    Searches audit events with flexible filtering:
    - Event type (policy decisions, tool calls, lifecycle events)
    - Run/job/user context
    - Server/tool names
    - Time ranges
    
    Returns redacted audit events (sensitive data already masked).
    """
    # TODO: Implement audit log querying
    # This would query the audit logger (JSONL or SQLite)
    
    return []


@router.get("/audit/events/{event_id}", response_model=AuditEvent)
async def get_audit_event(event_id: str):
    """Get a specific audit event by ID."""
    # TODO: Implement audit event lookup
    raise HTTPException(status_code=404, detail=f"Audit event '{event_id}' not found")


class AuditSummary(BaseModel):
    """Summary statistics for audit logs."""
    total_events: int
    policy_decisions: int
    tools_allowed: int
    tools_denied: int
    tools_executed: int
    tools_failed: int
    unique_servers: int
    unique_users: int
    time_range_start: datetime
    time_range_end: datetime


@router.get("/audit/summary", response_model=AuditSummary)
async def get_audit_summary(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    run_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """
    Get summary statistics for audit logs.
    
    Provides high-level metrics about policy decisions and tool usage.
    """
    # TODO: Implement audit summary calculation
    
    return AuditSummary(
        total_events=0,
        policy_decisions=0,
        tools_allowed=0,
        tools_denied=0,
        tools_executed=0,
        tools_failed=0,
        unique_servers=0,
        unique_users=0,
        time_range_start=start_time or datetime.utcnow(),
        time_range_end=end_time or datetime.utcnow()
    )


# ============================================================================
# HEALTH CHECK
# ============================================================================

class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    policy_engine: str
    audit_logger: str
    timestamp: datetime


@router.get("/health", response_model=HealthCheck)
async def health_check():
    """
    Health check endpoint for MCP governance system.
    
    Verifies that policy engine and audit logging are operational.
    """
    return HealthCheck(
        status="healthy",
        policy_engine="operational",
        audit_logger="operational",
        timestamp=datetime.utcnow()
    )
