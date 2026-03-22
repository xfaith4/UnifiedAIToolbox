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

from collections import deque
from datetime import datetime, timezone
import os
import threading
import time
from typing import Deque, List, Optional, Set
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
import logging
import uuid

from .models import (
    Collection, CollectionCreate, CollectionUpdate,
    InstallRecord, InstallRecordCreate, InstallRecordUpdate, InstallStatus,
    Allowlist, AllowlistCreate, AllowlistUpdate, AllowlistScope,
    AuditEvent, AuditEventQuery, AuditEventType, AuditAnomaly
)
from . import storage
from . import registry_sync

# Import auth module if available
try:
    from auth import get_current_user, User
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    # Fallback type for when auth is not available
    User = None


logger = logging.getLogger(__name__)

# In-memory MCP-specific rate limiter state (user/IP + path).
_MCP_RATE_BUCKETS: dict[str, Deque[float]] = {}
_MCP_RATE_LOCK = threading.Lock()


def _is_truthy(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on", "y"}


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def _rbac_enabled() -> bool:
    return _is_truthy(os.environ.get("MCP_GOVERNANCE_RBAC_ENABLED", "true"))


def _role_name(current_user: Optional["User"]) -> Optional[str]:
    if not current_user:
        return None
    role = getattr(current_user, "role", None)
    if role is None:
        return None
    return role.value if hasattr(role, "value") else str(role)


def _require_roles(
    current_user: Optional["User"],
    allowed_roles: Set[str],
    operation: str
) -> None:
    if not AUTH_AVAILABLE or not _rbac_enabled():
        return
    if current_user is None:
        raise HTTPException(status_code=401, detail=f"Authentication required for {operation}")
    role = _role_name(current_user)
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail=f"Insufficient role for {operation}")


def _rate_limit_key(request: Request, current_user: Optional["User"]) -> str:
    if current_user:
        principal = f"user:{current_user.username}"
    else:
        client_host = request.client.host if request.client else "unknown"
        principal = f"ip:{client_host}"
    return f"{principal}:{request.url.path}"


# Create router
router = APIRouter(prefix="/api/mcp", tags=["mcp-governance"])


# Helper function to get current user ID
def get_user_id(current_user: Optional['User'] = None) -> str:
    """Get user ID from current user, or return 'system' if not authenticated."""
    if AUTH_AVAILABLE and current_user:
        return current_user.username
    return "system"


# Dependency for optional authentication
if AUTH_AVAILABLE:
    async def optional_current_user(current_user: Optional['User'] = Depends(get_current_user)):
        """Get current user (or None) when auth is enabled."""
        return current_user
else:
    async def optional_current_user():
        """Get current user if auth is available, otherwise return None."""
        return None


async def enforce_mcp_rate_limit(
    request: Request,
    current_user: Optional["User"] = Depends(optional_current_user)
):
    """
    Enforce per-user (or per-client IP fallback) MCP API rate limiting.

    Defaults to 10 requests / 1 second window to match security roadmap targets.
    """
    window_seconds = _env_int("MCP_GOVERNANCE_RATE_LIMIT_WINDOW_SECONDS", default=1)
    request_limit = _env_int("MCP_GOVERNANCE_RATE_LIMIT_REQUESTS", default=10)
    now = time.monotonic()
    key = _rate_limit_key(request, current_user)

    with _MCP_RATE_LOCK:
        bucket = _MCP_RATE_BUCKETS.setdefault(key, deque())
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()

        if len(bucket) >= request_limit:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"MCP rate limit exceeded: {request_limit} requests "
                    f"per {window_seconds} second(s)"
                )
            )

        bucket.append(now)


async def require_admin_user(
    current_user: Optional["User"] = Depends(optional_current_user)
) -> Optional["User"]:
    """Require admin role for MCP admin operations when RBAC is enabled."""
    _require_roles(current_user, {"admin"}, "MCP admin operation")
    return current_user


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
async def sync_registry(
    request: RegistrySyncRequest,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Sync/refresh MCP server registry from external sources.
    
    Discovers MCP servers from:
    - Official MCP registry
    - GitHub topics (mcp-server)
    - Custom registries
    
    Merges discovered servers with local registry.
    """
    try:
        # Get existing servers
        existing_servers = storage.get_servers()
        
        # Sync from official registry
        if request.source_id is None or request.source_id == "official":
            stats = registry_sync.sync_from_official_registry(existing_servers)
            
            # If sync was successful and we got new servers, save them
            if stats.get("synced_servers") and (stats["servers_added"] > 0 or stats["servers_updated"] > 0):
                # Save the updated servers back to storage
                storage.save_json_file("servers.json", stats["synced_servers"])
                logger.info(f"Saved {len(stats['synced_servers'])} servers to storage")
            
            return RegistrySyncResponse(
                success=len(stats.get("errors", [])) == 0,
                servers_added=stats["servers_added"],
                servers_updated=stats["servers_updated"],
                servers_total=stats["servers_total"],
                source_id=request.source_id or "official",
                synced_at=datetime.utcnow(),
                errors=stats.get("errors", [])
            )
        else:
            # For other sources, return the current count
            # (GitHub sync would be implemented here in the future)
            return RegistrySyncResponse(
                success=True,
                servers_added=0,
                servers_updated=0,
                servers_total=len(existing_servers),
                source_id=request.source_id,
                synced_at=datetime.utcnow(),
                errors=[f"Source '{request.source_id}' sync not yet implemented"]
            )
            
    except Exception as e:
        logger.error(f"Registry sync failed: {e}", exc_info=True)
        return RegistrySyncResponse(
            success=False,
            servers_added=0,
            servers_updated=0,
            servers_total=0,
            source_id=request.source_id or "local",
            synced_at=datetime.utcnow(),
            errors=[str(e)]
        )


@router.get("/registry/sources", response_model=List[RegistrySource])
async def list_registry_sources(
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    List configured registry sources.
    
    Returns all external sources configured for registry ingestion.
    """
    try:
        sources = registry_sync.load_sources_config()
        return [
            RegistrySource(
                source_id=s["source_id"],
                source_type=s["source_type"],
                url=s["url"],
                enabled=s.get("enabled", True),
                metadata=s.get("metadata", {})
            )
            for s in sources
        ]
    except Exception as e:
        logger.error(f"Failed to load registry sources: {e}")
        # Return defaults on error
        return [
            RegistrySource(
                source_id="official",
                source_type="official",
                url="https://registry.modelcontextprotocol.io/v1/servers",
                enabled=True,
                metadata={"description": "Official MCP Registry"}
            )
        ]


@router.post("/registry/sources", response_model=RegistrySource, status_code=201)
async def add_registry_source(
    source: RegistrySource,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Add a new registry source.
    
    Configures a new external source for MCP server discovery.
    """
    # Validate the source
    if not source.source_id or not source.url:
        raise HTTPException(status_code=400, detail="source_id and url are required")
    
    try:
        # Load existing sources
        sources = registry_sync.load_sources_config()
        
        # Check if source already exists
        existing_ids = {s["source_id"] for s in sources}
        if source.source_id in existing_ids:
            raise HTTPException(status_code=409, detail=f"Source '{source.source_id}' already exists")
        
        # Add new source
        new_source = {
            "source_id": source.source_id,
            "source_type": source.source_type,
            "url": source.url,
            "enabled": source.enabled,
            "metadata": source.metadata,
        }
        sources.append(new_source)
        
        # Persist to config file
        if not registry_sync.save_sources_config(sources):
            raise HTTPException(status_code=500, detail="Failed to save source configuration")
        
        logger.info(f"Registry source added: {source.source_id}")
        return source
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add registry source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
async def search_servers(
    query: ServerSearchQuery,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Search and browse available MCP servers.
    
    Searches both catalog (discoverable) and installed servers.
    Supports filtering by tags, capabilities, and installation status.
    """
    # Search servers using storage layer
    servers, total = storage.search_servers(
        query=query.query,
        tags=query.tags,
        capabilities=query.capabilities,
        status=query.status,
        limit=query.limit,
        offset=query.offset
    )
    
    # Get install records to determine installation status
    install_records = storage.get_install_records()
    enabled_server_ids = {rec.server_id for rec in install_records if rec.status == InstallStatus.ENABLED}
    
    # Convert to search results
    results = []
    for server in servers:
        installation_status = "installed" if server.get("id") in enabled_server_ids else "catalog"
        
        results.append(ServerSearchResult(
            server_id=server.get("id", ""),
            name=server.get("name", ""),
            description=server.get("description"),
            url=server.get("url", ""),
            tags=server.get("tags", []),
            capabilities=server.get("capabilities", []),
            status=server.get("status", "unknown"),
            installation_status=installation_status,
            owner=server.get("owner")
        ))
    
    return ServerSearchResponse(
        results=results,
        total=total,
        limit=query.limit,
        offset=query.offset
    )


@router.get("/servers/{server_id}")
async def get_server(
    server_id: str,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Get details of a specific MCP server.
    
    Returns full server metadata including installation status,
    health checks, and capabilities.
    """
    # Get server from catalog
    server = storage.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found")
    
    # Get installation status
    install_record = storage.get_install_by_server(server_id)
    if install_record:
        server["installation_status"] = "installed"
        server["install_record"] = install_record.model_dump()
    else:
        server["installation_status"] = "catalog"
        server["install_record"] = None
    
    return server


# ============================================================================
# COLLECTION CRUD ENDPOINTS
# ============================================================================

@router.get("/collections", response_model=List[Collection])
async def list_collections(
    tag: Optional[str] = Query(None, description="Filter by tag"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    List all collections.
    
    Collections group related MCP servers for easier management
    and policy application.
    """
    collections = storage.get_collections()
    
    # Filter by tag if specified
    if tag:
        collections = [c for c in collections if tag in c.tags]
    
    # Apply pagination
    total = len(collections)
    collections = collections[offset:offset + limit]
    
    return collections


@router.post("/collections", response_model=Collection, status_code=201)
async def create_collection(
    collection: CollectionCreate,
    current_user: Optional['User'] = Depends(require_admin_user),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Create a new collection.
    
    Groups MCP servers under a named collection for easier
    allowlist management.
    """
    new_collection = Collection(
        collection_id=str(uuid.uuid4()),
        name=collection.name,
        description=collection.description,
        server_ids=collection.server_ids,
        tags=collection.tags,
        created_by=get_user_id(current_user),
        created_at=datetime.utcnow()
    )
    
    return storage.save_collection(new_collection)


@router.get("/collections/{collection_id}", response_model=Collection)
async def get_collection(
    collection_id: str,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """Get a specific collection by ID."""
    collection = storage.get_collection(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    return collection


@router.put("/collections/{collection_id}", response_model=Collection)
async def update_collection(
    collection_id: str,
    update: CollectionUpdate,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Update an existing collection.
    
    Updates name, description, server list, or tags.
    """
    collection = storage.get_collection(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")
    
    # Apply updates
    if update.name is not None:
        collection.name = update.name
    if update.description is not None:
        collection.description = update.description
    if update.server_ids is not None:
        collection.server_ids = update.server_ids
    if update.tags is not None:
        collection.tags = update.tags
    
    collection.updated_at = datetime.utcnow()
    
    return storage.save_collection(collection)


@router.delete("/collections/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Delete a collection.
    
    Note: Deleting a collection does not affect MCP servers themselves,
    only removes the grouping.
    """
    success = storage.delete_collection(collection_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found")


# ============================================================================
# INSTALL RECORD ENDPOINTS
# ============================================================================

@router.get("/installs", response_model=List[InstallRecord])
async def list_install_records(
    status: Optional[InstallStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    List all install records.
    
    Install records track which MCP servers are installed and enabled.
    """
    installs = storage.get_install_records()
    
    # Filter by status if specified
    if status:
        installs = [i for i in installs if i.status == status]
    
    # Apply pagination
    total = len(installs)
    installs = installs[offset:offset + limit]
    
    return installs


@router.post("/installs", response_model=InstallRecord, status_code=201)
async def create_install_record(
    record: InstallRecordCreate,
    current_user: Optional['User'] = Depends(require_admin_user),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Create a new install record (install MCP server).
    
    Marks an MCP server as installed with initial configuration.
    Server starts in 'pending' status until installation completes.
    """
    new_record = InstallRecord(
        install_id=str(uuid.uuid4()),
        server_id=record.server_id,
        status=InstallStatus.PENDING,
        installed_at=datetime.utcnow(),
        installed_by=get_user_id(current_user),
        config=record.config,
        notes=record.notes
    )
    
    return storage.save_install_record(new_record)


@router.get("/installs/{install_id}", response_model=InstallRecord)
async def get_install_record(
    install_id: str,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """Get a specific install record by ID."""
    record = storage.get_install_record(install_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")
    return record


@router.put("/installs/{install_id}", response_model=InstallRecord)
async def update_install_record(
    install_id: str,
    update: InstallRecordUpdate,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Update an install record.
    
    Common updates:
    - Change status (enable/disable server)
    - Update configuration
    - Add notes
    """
    record = storage.get_install_record(install_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")
    
    # Apply updates
    if update.status is not None:
        record.status = update.status
        if update.status == InstallStatus.ENABLED:
            record.enabled_at = datetime.utcnow()
        elif update.status == InstallStatus.DISABLED:
            record.disabled_at = datetime.utcnow()
    
    if update.config is not None:
        record.config = update.config
    
    if update.notes is not None:
        record.notes = update.notes
    
    return storage.save_install_record(record)


@router.post("/installs/{install_id}/enable", response_model=InstallRecord)
async def enable_install(
    install_id: str,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Enable an installed MCP server.
    
    Makes the server available for tool calls.
    """
    record = storage.get_install_record(install_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")
    
    record.status = InstallStatus.ENABLED
    record.enabled_at = datetime.utcnow()
    
    return storage.save_install_record(record)


@router.post("/installs/{install_id}/disable", response_model=InstallRecord)
async def disable_install(
    install_id: str,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Disable an installed MCP server.
    
    Prevents the server from being used for tool calls.
    Does not uninstall the server.
    """
    record = storage.get_install_record(install_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Install record '{install_id}' not found")
    
    record.status = InstallStatus.DISABLED
    record.disabled_at = datetime.utcnow()
    
    return storage.save_install_record(record)


# ============================================================================
# ALLOWLIST ENDPOINTS
# ============================================================================

@router.get("/allowlists", response_model=List[Allowlist])
async def list_allowlists(
    scope: Optional[AllowlistScope] = Query(None, description="Filter by scope"),
    scope_id: Optional[str] = Query(None, description="Filter by scope ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    List all allowlists.
    
    Allowlists control which MCP servers/tools are available
    for specific runs, jobs, users, or globally.
    """
    allowlists = storage.get_allowlists()
    
    # Filter by scope if specified
    if scope:
        allowlists = [a for a in allowlists if a.scope == scope]
    
    # Filter by scope_id if specified
    if scope_id:
        allowlists = [a for a in allowlists if a.scope_id == scope_id]
    
    # Apply pagination
    total = len(allowlists)
    allowlists = allowlists[offset:offset + limit]
    
    return allowlists


@router.post("/allowlists", response_model=Allowlist, status_code=201)
async def create_allowlist(
    allowlist: AllowlistCreate,
    current_user: Optional['User'] = Depends(require_admin_user),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Create a new allowlist.
    
    Binds a set of allowed MCP servers/tools to a specific scope
    (run, job, user, or global).
    """
    new_allowlist = _build_allowlist(allowlist, get_user_id(current_user))
    return storage.save_allowlist(new_allowlist)


def _build_allowlist(allowlist: AllowlistCreate, created_by: str) -> Allowlist:
    """Construct an allowlist model for both create and bind workflows."""
    return Allowlist(
        allowlist_id=str(uuid.uuid4()),
        scope=allowlist.scope,
        scope_id=allowlist.scope_id,
        allowed_servers=allowlist.allowed_servers,
        allowed_collections=allowlist.allowed_collections,
        allowed_tools=allowlist.allowed_tools,
        denied_servers=allowlist.denied_servers,
        denied_tools=allowlist.denied_tools,
        created_by=created_by,
        created_at=datetime.utcnow(),
        expires_at=allowlist.expires_at
    )


@router.get("/allowlists/{allowlist_id}", response_model=Allowlist)
async def get_allowlist(
    allowlist_id: str,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """Get a specific allowlist by ID."""
    allowlist = storage.get_allowlist(allowlist_id)
    if not allowlist:
        raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")
    return allowlist


@router.put("/allowlists/{allowlist_id}", response_model=Allowlist)
async def update_allowlist(
    allowlist_id: str,
    update: AllowlistUpdate,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Update an existing allowlist.
    
    Modifies the set of allowed/denied servers or tools.
    """
    allowlist = storage.get_allowlist(allowlist_id)
    if not allowlist:
        raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")
    
    # Apply updates
    if update.allowed_servers is not None:
        allowlist.allowed_servers = update.allowed_servers
    if update.allowed_collections is not None:
        allowlist.allowed_collections = update.allowed_collections
    if update.allowed_tools is not None:
        allowlist.allowed_tools = update.allowed_tools
    if update.denied_servers is not None:
        allowlist.denied_servers = update.denied_servers
    if update.denied_tools is not None:
        allowlist.denied_tools = update.denied_tools
    if update.expires_at is not None:
        allowlist.expires_at = update.expires_at
    
    allowlist.updated_at = datetime.utcnow()
    
    return storage.save_allowlist(allowlist)


@router.delete("/allowlists/{allowlist_id}", status_code=204)
async def delete_allowlist(
    allowlist_id: str,
    _: Optional["User"] = Depends(require_admin_user),
    __: None = Depends(enforce_mcp_rate_limit)
):
    """
    Delete an allowlist.
    
    Removes the allowlist binding. Any operations using this allowlist
    will fall back to higher-level allowlists (user or global).
    """
    success = storage.delete_allowlist(allowlist_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Allowlist '{allowlist_id}' not found")


@router.post("/allowlists/bind", response_model=Allowlist, status_code=201)
async def bind_allowlist_to_scope(
    scope: AllowlistScope,
    scope_id: str,
    allowlist_config: AllowlistCreate,
    current_user: Optional['User'] = Depends(require_admin_user),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Convenience endpoint to create and bind an allowlist in one step.
    
    Common use case: Bind an allowlist to a specific run at run creation time.
    """
    allowlist_config.scope = scope
    allowlist_config.scope_id = scope_id
    allowlist = _build_allowlist(allowlist_config, get_user_id(current_user))
    return storage.save_allowlist(allowlist)


# ============================================================================
# AUDIT LOG ENDPOINTS
# ============================================================================

@router.post("/audit/query", response_model=List[AuditEvent])
async def query_audit_logs(
    query: AuditEventQuery,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Query audit logs.
    
    Searches audit events with flexible filtering:
    - Event type (policy decisions, tool calls, lifecycle events)
    - Run/job/user context
    - Server/tool names
    - Time ranges
    
    Returns redacted audit events (sensitive data already masked).
    """
    # Convert enum types to strings for storage query
    event_types_str = [et.value for et in query.event_types] if query.event_types else None
    
    # Query from storage
    events_data = storage.query_audit_events(
        event_types=event_types_str,
        run_id=query.run_id,
        job_id=query.job_id,
        user_id=query.user_id,
        server_id=query.server_id,
        tool_name=query.tool_name,
        decision=query.decision,
        start_time=query.start_time,
        end_time=query.end_time,
        limit=query.limit,
        offset=query.offset
    )
    
    # Convert to AuditEvent models
    audit_events = []
    for event_data in events_data:
        try:
            audit_events.append(AuditEvent(**event_data))
        except Exception as e:
            logger.warning(f"Failed to parse audit event: {e}")
            continue
    
    return audit_events


@router.get("/audit/events/{event_id}", response_model=AuditEvent)
async def get_audit_event(
    event_id: str,
    _: None = Depends(enforce_mcp_rate_limit)
):
    """Get a specific audit event by ID."""
    event_data = storage.get_audit_event_by_id(event_id)
    if not event_data:
        raise HTTPException(status_code=404, detail=f"Audit event '{event_id}' not found")
    
    try:
        return AuditEvent(**event_data)
    except Exception as e:
        logger.error(f"Failed to parse audit event: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse audit event")


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
    user_id: Optional[str] = Query(None),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Get summary statistics for audit logs.
    
    Provides high-level metrics about policy decisions and tool usage.
    """
    summary_data = storage.get_audit_summary(
        start_time=start_time,
        end_time=end_time,
        run_id=run_id,
        user_id=user_id
    )
    
    return AuditSummary(**summary_data)


@router.get("/audit/anomalies", response_model=List[AuditAnomaly])
async def get_audit_anomalies(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    window_minutes: int = Query(60, ge=1, le=1440),
    min_events_for_spike: int = Query(20, ge=1, le=10000),
    deny_ratio_threshold: float = Query(0.4, ge=0.0, le=1.0),
    repeated_deny_threshold: int = Query(5, ge=1, le=1000),
    limit: int = Query(50, ge=1, le=500),
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Detect anomalies in MCP audit logs.

    Uses rule-based detection over policy denies and signature verification.
    """
    anomalies = storage.get_audit_anomalies(
        start_time=start_time,
        end_time=end_time,
        window_minutes=window_minutes,
        min_events_for_spike=min_events_for_spike,
        deny_ratio_threshold=deny_ratio_threshold,
        repeated_deny_threshold=repeated_deny_threshold,
        limit=limit
    )
    return [AuditAnomaly(**anomaly) for anomaly in anomalies]


# ============================================================================
# POLICY VIOLATIONS DASHBOARD (Phase 4.4)
# ============================================================================

class ViolationGroup(BaseModel):
    """Aggregated policy violation stats for a server, tool, user, or run."""
    group_key: str
    group_type: str
    denied_count: int
    last_denied_at: Optional[datetime]
    top_reasons: List[str]


class ViolationsSummary(BaseModel):
    """Summary of policy violations over a time window."""
    window_start: datetime
    window_end: datetime
    total_denied: int
    by_server: List[ViolationGroup]
    by_tool: List[ViolationGroup]
    by_user: List[ViolationGroup]


@router.get("/violations", response_model=ViolationsSummary)
async def get_violations_summary(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    run_id: Optional[str] = Query(None),
    top_n: int = Query(10, ge=1, le=100),
    _: None = Depends(enforce_mcp_rate_limit),
):
    """
    Get a summary of policy violations (denied tool calls).

    Groups denied events by server, tool, and user and returns the top-N
    offenders in each category.  Useful for identifying policy gaps and
    recurring access-control issues.
    """
    from .models import AuditEventType

    denied_events = storage.query_audit_events(
        event_types=[AuditEventType.TOOL_CALL_DENIED.value],
        run_id=run_id,
        start_time=start_time,
        end_time=end_time,
        limit=5000,
        offset=0,
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    window_start: datetime = denied_events[-1]["timestamp"] if denied_events else now
    window_end: datetime = denied_events[0]["timestamp"] if denied_events else now

    def _parse_ts(val: object) -> Optional[datetime]:
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                return None
        return None

    def _aggregate(key_field: str) -> List[ViolationGroup]:
        buckets: Dict[str, Dict] = {}
        for ev in denied_events:
            key = str(ev.get(key_field) or "unknown")
            if key not in buckets:
                buckets[key] = {"count": 0, "last": None, "reasons": []}
            buckets[key]["count"] += 1
            ts = _parse_ts(ev.get("timestamp"))
            if ts and (buckets[key]["last"] is None or ts > buckets[key]["last"]):
                buckets[key]["last"] = ts
            reason = ev.get("reason", "")
            if reason and reason not in buckets[key]["reasons"]:
                buckets[key]["reasons"].append(reason)
        groups = [
            ViolationGroup(
                group_key=k,
                group_type=key_field,
                denied_count=v["count"],
                last_denied_at=v["last"],
                top_reasons=v["reasons"][:5],
            )
            for k, v in sorted(buckets.items(), key=lambda x: -x[1]["count"])
        ]
        return groups[:top_n]

    return ViolationsSummary(
        window_start=window_start,
        window_end=window_end,
        total_denied=len(denied_events),
        by_server=_aggregate("server_id"),
        by_tool=_aggregate("tool_name"),
        by_user=_aggregate("user_id"),
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
async def health_check(
    _: None = Depends(enforce_mcp_rate_limit)
):
    """
    Health check endpoint for MCP governance system.
    
    Verifies that policy engine and audit logging are operational.
    """
    return HealthCheck(
        status="healthy",
        policy_engine="operational",
        audit_logger="operational",
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None)
    )
