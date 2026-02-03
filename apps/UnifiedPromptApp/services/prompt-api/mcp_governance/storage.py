"""
Simple file-based storage for MCP governance data.

Stores:
- Server catalog (from registry ingestion)
- Collections
- Install records
- Allowlists

All data stored as JSON files in data/mcp/ directory.
"""

import json
import pathlib
from datetime import datetime
from typing import List, Optional, Dict, Any
from .models import (
    Collection, InstallRecord, Allowlist, InstallStatus, AllowlistScope
)


# Storage paths
# Navigate from mcp_governance/storage.py (6 levels up) to repo root
# storage.py -> mcp_governance -> prompt-api -> services -> UnifiedPromptApp -> apps -> repo_root
REPO_ROOT = pathlib.Path(__file__).parent.parent.parent.parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "mcp"
SERVERS_FILE = DATA_DIR / "servers.json"
COLLECTIONS_FILE = DATA_DIR / "collections.json"
INSTALLS_FILE = DATA_DIR / "installs.json"
ALLOWLISTS_FILE = DATA_DIR / "allowlists.json"


def ensure_data_dir():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_json_file(file_path: pathlib.Path, default: Any = None) -> Any:
    """Load JSON file with default fallback."""
    if not file_path.exists():
        return default if default is not None else {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return default if default is not None else {}


def save_json_file(file_path: pathlib.Path, data: Any):
    """Save data to JSON file."""
    ensure_data_dir()
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)


# ============================================================================
# SERVER CATALOG OPERATIONS
# ============================================================================

def get_servers() -> List[Dict[str, Any]]:
    """Load all servers from catalog."""
    data = load_json_file(SERVERS_FILE, {"metadata": {}, "servers": []})
    return data.get("servers", [])


def get_server(server_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific server by ID."""
    servers = get_servers()
    for server in servers:
        if server.get("id") == server_id:
            return server
    return None


def search_servers(
    query: Optional[str] = None,
    tags: Optional[List[str]] = None,
    capabilities: Optional[List[str]] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> tuple[List[Dict[str, Any]], int]:
    """
    Search servers with filters.
    
    Returns:
        Tuple of (filtered_servers, total_count)
    """
    servers = get_servers()
    
    # Apply filters
    filtered = []
    for server in servers:
        # Text search
        if query:
            query_lower = query.lower()
            name = server.get("name", "").lower()
            desc = server.get("description", "").lower()
            if query_lower not in name and query_lower not in desc:
                continue
        
        # Tag filter
        if tags:
            server_tags = server.get("tags", [])
            if not any(tag in server_tags for tag in tags):
                continue
        
        # Capability filter
        if capabilities:
            server_caps = server.get("capabilities", [])
            if not any(cap in server_caps for cap in capabilities):
                continue
        
        # Status filter
        if status:
            if server.get("status") != status:
                continue
        
        filtered.append(server)
    
    total = len(filtered)
    
    # Apply pagination
    paginated = filtered[offset:offset + limit]
    
    return paginated, total


# ============================================================================
# COLLECTION OPERATIONS
# ============================================================================

def get_collections() -> List[Collection]:
    """Load all collections."""
    data = load_json_file(COLLECTIONS_FILE, {"collections": []})
    collections_data = data.get("collections", [])
    return [Collection(**col) for col in collections_data]


def get_collection(collection_id: str) -> Optional[Collection]:
    """Get a specific collection by ID."""
    collections = get_collections()
    for collection in collections:
        if collection.collection_id == collection_id:
            return collection
    return None


def save_collection(collection: Collection) -> Collection:
    """Save or update a collection."""
    collections = get_collections()
    
    # Remove existing if updating
    collections = [c for c in collections if c.collection_id != collection.collection_id]
    
    # Add new/updated collection
    collections.append(collection)
    
    # Save to file
    data = {"collections": [c.dict() for c in collections]}
    save_json_file(COLLECTIONS_FILE, data)
    
    return collection


def delete_collection(collection_id: str) -> bool:
    """Delete a collection."""
    collections = get_collections()
    original_count = len(collections)
    
    collections = [c for c in collections if c.collection_id != collection_id]
    
    if len(collections) < original_count:
        data = {"collections": [c.dict() for c in collections]}
        save_json_file(COLLECTIONS_FILE, data)
        return True
    
    return False


# ============================================================================
# INSTALL RECORD OPERATIONS
# ============================================================================

def get_install_records() -> List[InstallRecord]:
    """Load all install records."""
    data = load_json_file(INSTALLS_FILE, {"installs": []})
    installs_data = data.get("installs", [])
    return [InstallRecord(**inst) for inst in installs_data]


def get_install_record(install_id: str) -> Optional[InstallRecord]:
    """Get a specific install record by ID."""
    installs = get_install_records()
    for install in installs:
        if install.install_id == install_id:
            return install
    return None


def get_install_by_server(server_id: str) -> Optional[InstallRecord]:
    """Get install record for a specific server."""
    installs = get_install_records()
    for install in installs:
        if install.server_id == server_id:
            return install
    return None


def save_install_record(record: InstallRecord) -> InstallRecord:
    """Save or update an install record."""
    installs = get_install_records()
    
    # Remove existing if updating
    installs = [i for i in installs if i.install_id != record.install_id]
    
    # Add new/updated record
    installs.append(record)
    
    # Save to file
    data = {"installs": [i.dict() for i in installs]}
    save_json_file(INSTALLS_FILE, data)
    
    return record


def delete_install_record(install_id: str) -> bool:
    """Delete an install record."""
    installs = get_install_records()
    original_count = len(installs)
    
    installs = [i for i in installs if i.install_id != install_id]
    
    if len(installs) < original_count:
        data = {"installs": [i.dict() for i in installs]}
        save_json_file(INSTALLS_FILE, data)
        return True
    
    return False


# ============================================================================
# ALLOWLIST OPERATIONS
# ============================================================================

def get_allowlists() -> List[Allowlist]:
    """Load all allowlists."""
    data = load_json_file(ALLOWLISTS_FILE, {"allowlists": []})
    allowlists_data = data.get("allowlists", [])
    return [Allowlist(**al) for al in allowlists_data]


def get_allowlist(allowlist_id: str) -> Optional[Allowlist]:
    """Get a specific allowlist by ID."""
    allowlists = get_allowlists()
    for allowlist in allowlists:
        if allowlist.allowlist_id == allowlist_id:
            return allowlist
    return None


def get_allowlist_for_scope(scope: AllowlistScope, scope_id: str) -> Optional[Allowlist]:
    """Get allowlist for a specific scope."""
    allowlists = get_allowlists()
    for allowlist in allowlists:
        if allowlist.scope == scope and allowlist.scope_id == scope_id:
            return allowlist
    return None


def save_allowlist(allowlist: Allowlist) -> Allowlist:
    """Save or update an allowlist."""
    allowlists = get_allowlists()
    
    # Remove existing if updating
    allowlists = [a for a in allowlists if a.allowlist_id != allowlist.allowlist_id]
    
    # Add new/updated allowlist
    allowlists.append(allowlist)
    
    # Save to file
    data = {"allowlists": [a.dict() for a in allowlists]}
    save_json_file(ALLOWLISTS_FILE, data)
    
    return allowlist


def delete_allowlist(allowlist_id: str) -> bool:
    """Delete an allowlist."""
    allowlists = get_allowlists()
    original_count = len(allowlists)
    
    allowlists = [a for a in allowlists if a.allowlist_id != allowlist_id]
    
    if len(allowlists) < original_count:
        data = {"allowlists": [a.dict() for a in allowlists]}
        save_json_file(ALLOWLISTS_FILE, data)
        return True
    
    return False
