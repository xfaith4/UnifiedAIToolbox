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
# Find repository root by looking for marker files
def find_repo_root():
    """Find repository root by looking for .git or other markers."""
    current = pathlib.Path(__file__).parent.absolute()
    for _ in range(10):  # Max 10 levels up
        # Check for repository root markers
        if (current / ".git").exists():
            return current
        # Check if data/mcp directory exists here
        if (current / "data" / "mcp" / "servers.json").exists():
            return current
        if current.parent == current:  # Reached filesystem root
            break
        current = current.parent
    # Fallback to relative path (6 levels up from storage.py)
    return pathlib.Path(__file__).parent.parent.parent.parent.parent.parent

REPO_ROOT = find_repo_root()
DATA_DIR = REPO_ROOT / "data" / "mcp"
SERVERS_FILE = DATA_DIR / "servers.json"
COLLECTIONS_FILE = DATA_DIR / "collections.json"
INSTALLS_FILE = DATA_DIR / "installs.json"
ALLOWLISTS_FILE = DATA_DIR / "allowlists.json"
AUDIT_LOG_FILE = DATA_DIR / "audit_log.jsonl"


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


# ============================================================================
# AUDIT LOG OPERATIONS
# ============================================================================

def log_audit_event(event: 'AuditEvent'):
    """Append an audit event to the JSONL log file."""
    from .models import AuditEvent
    ensure_data_dir()
    
    with open(AUDIT_LOG_FILE, 'a', encoding='utf-8') as f:
        event_dict = event.dict()
        # Convert datetime objects to ISO strings
        event_dict['timestamp'] = event.timestamp.isoformat()
        f.write(json.dumps(event_dict, default=str) + '\n')


def query_audit_events(
    event_types: Optional[List[str]] = None,
    run_id: Optional[str] = None,
    job_id: Optional[str] = None,
    user_id: Optional[str] = None,
    server_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    decision: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Query audit events from JSONL log file.
    
    Returns:
        List of audit event dictionaries matching the query
    """
    if not AUDIT_LOG_FILE.exists():
        return []
    
    events = []
    
    try:
        with open(AUDIT_LOG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                
                try:
                    event = json.loads(line)
                    
                    # Apply filters
                    if event_types and event.get('event_type') not in event_types:
                        continue
                    if run_id and event.get('run_id') != run_id:
                        continue
                    if job_id and event.get('job_id') != job_id:
                        continue
                    if user_id and event.get('user_id') != user_id:
                        continue
                    if server_id and event.get('server_id') != server_id:
                        continue
                    if tool_name and event.get('tool_name') != tool_name:
                        continue
                    if decision and event.get('decision') != decision:
                        continue
                    
                    # Time range filters (parse once for efficiency)
                    event_timestamp = event.get('timestamp')
                    if event_timestamp and (start_time or end_time):
                        try:
                            event_time = datetime.fromisoformat(event_timestamp)
                            if start_time and event_time < start_time:
                                continue
                            if end_time and event_time > end_time:
                                continue
                        except ValueError:
                            # Skip events with invalid timestamps
                            continue
                    
                    events.append(event)
                except (json.JSONDecodeError, ValueError):
                    # Skip malformed lines
                    continue
    except FileNotFoundError:
        return []
    
    # Apply pagination
    total = len(events)
    paginated = events[offset:offset + limit]
    
    return paginated


def get_audit_event_by_id(event_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific audit event by ID."""
    if not AUDIT_LOG_FILE.exists():
        return None
    
    try:
        with open(AUDIT_LOG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                
                try:
                    event = json.loads(line)
                    if event.get('event_id') == event_id:
                        return event
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        pass
    
    return None


def get_audit_summary(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    run_id: Optional[str] = None,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate summary statistics for audit logs.
    
    Returns:
        Dictionary with summary metrics
    """
    if not AUDIT_LOG_FILE.exists():
        return {
            'total_events': 0,
            'policy_decisions': 0,
            'tools_allowed': 0,
            'tools_denied': 0,
            'tools_executed': 0,
            'tools_failed': 0,
            'unique_servers': 0,
            'unique_users': 0,
            'time_range_start': start_time or datetime.utcnow(),
            'time_range_end': end_time or datetime.utcnow()
        }
    
    events = query_audit_events(
        run_id=run_id,
        user_id=user_id,
        start_time=start_time,
        end_time=end_time,
        limit=10000  # High limit for summary
    )
    
    policy_decisions = 0
    tools_allowed = 0
    tools_denied = 0
    tools_executed = 0
    tools_failed = 0
    servers = set()
    users = set()
    
    for event in events:
        event_type = event.get('event_type', '')
        
        if 'policy' in event_type.lower():
            policy_decisions += 1
        if event_type == 'tool.call.allowed':
            tools_allowed += 1
        if event_type == 'tool.call.denied':
            tools_denied += 1
        if event_type == 'tool.call.executed':
            tools_executed += 1
        if event_type == 'tool.call.failed':
            tools_failed += 1
        
        if event.get('server_id'):
            servers.add(event['server_id'])
        if event.get('user_id'):
            users.add(event['user_id'])
    
    return {
        'total_events': len(events),
        'policy_decisions': policy_decisions,
        'tools_allowed': tools_allowed,
        'tools_denied': tools_denied,
        'tools_executed': tools_executed,
        'tools_failed': tools_failed,
        'unique_servers': len(servers),
        'unique_users': len(users),
        'time_range_start': start_time or datetime.utcnow(),
        'time_range_end': end_time or datetime.utcnow()
    }
