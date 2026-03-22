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
import hashlib
import hmac
import os
import pathlib
import threading
import uuid
from datetime import datetime, timedelta, timezone
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
AUDIT_LOG_ROTATED_GLOB = "audit_log.*.jsonl"
AUDIT_SIGNATURE_ALGORITHM = "hmac-sha256"
_AUDIT_IO_LOCK = threading.Lock()


def ensure_data_dir():
    """Ensure data directory exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "y"}


def _canonical_event_payload(event_dict: Dict[str, Any]) -> str:
    """Generate deterministic payload used for audit event signing."""
    payload = dict(event_dict)
    payload.pop("signature", None)
    payload.pop("signature_valid", None)
    payload.pop("signature_algorithm", None)
    payload.pop("signature_key_id", None)
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def _audit_signing_key() -> bytes:
    key = os.environ.get("MCP_AUDIT_SIGNING_KEY", "").strip()
    if not key:
        key = os.environ.get("PROMPT_API_ADMIN_TOKEN", "").strip()
    if not key:
        key = "mcp-dev-signing-key"
    return key.encode("utf-8")


def _audit_signing_key_id() -> str:
    return os.environ.get("MCP_AUDIT_SIGNING_KEY_ID", "default")


def _sign_event(event_dict: Dict[str, Any]) -> str:
    payload = _canonical_event_payload(event_dict)
    return hmac.new(_audit_signing_key(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_event_signature(event_dict: Dict[str, Any]) -> bool:
    """
    Validate the event signature.

    Returns False for unsigned events to flag legacy/invalid records.
    """
    signature = event_dict.get("signature")
    if not signature:
        return False
    expected = _sign_event(event_dict)
    return hmac.compare_digest(str(signature), expected)


def _iter_audit_log_files() -> List[pathlib.Path]:
    """
    Return all audit log files (active + rotated), newest first.
    """
    files = []
    if AUDIT_LOG_FILE.exists():
        files.append(AUDIT_LOG_FILE)
    files.extend(DATA_DIR.glob(AUDIT_LOG_ROTATED_GLOB))
    files = sorted(
        {f.resolve() for f in files},
        key=lambda p: p.stat().st_mtime if p.exists() else 0,
        reverse=True
    )
    return files


def _cleanup_rotated_logs() -> None:
    keep_files = _env_int("MCP_AUDIT_ROTATE_KEEP_FILES", default=14)
    rotated = sorted(
        DATA_DIR.glob(AUDIT_LOG_ROTATED_GLOB),
        key=lambda p: p.stat().st_mtime if p.exists() else 0,
        reverse=True
    )
    for old_file in rotated[keep_files:]:
        try:
            old_file.unlink()
        except OSError:
            continue


def _rotate_audit_log_if_needed() -> None:
    if not AUDIT_LOG_FILE.exists():
        return

    max_bytes = _env_int("MCP_AUDIT_ROTATE_MAX_BYTES", default=10 * 1024 * 1024)
    rotate_daily = _env_bool("MCP_AUDIT_ROTATE_DAILY", default=True)
    stat = AUDIT_LOG_FILE.stat()

    rotate_for_size = stat.st_size >= max_bytes
    rotate_for_day = False
    if rotate_daily:
        file_day = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).date()
        rotate_for_day = file_day < datetime.now(timezone.utc).date()

    if not (rotate_for_size or rotate_for_day):
        return

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rotated_path = DATA_DIR / f"audit_log.{timestamp}.jsonl"
    AUDIT_LOG_FILE.rename(rotated_path)
    _cleanup_rotated_logs()


def _parse_event_time(raw_value: Any) -> Optional[datetime]:
    if not raw_value:
        return None
    raw_str = str(raw_value)
    if raw_str.endswith("Z"):
        raw_str = raw_str[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw_str)
    except ValueError:
        return None


def _normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


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
    data = {"collections": [c.model_dump() for c in collections]}
    save_json_file(COLLECTIONS_FILE, data)
    
    return collection


def delete_collection(collection_id: str) -> bool:
    """Delete a collection."""
    collections = get_collections()
    original_count = len(collections)
    
    collections = [c for c in collections if c.collection_id != collection_id]
    
    if len(collections) < original_count:
        data = {"collections": [c.model_dump() for c in collections]}
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
    data = {"installs": [i.model_dump() for i in installs]}
    save_json_file(INSTALLS_FILE, data)
    
    return record


def delete_install_record(install_id: str) -> bool:
    """Delete an install record."""
    installs = get_install_records()
    original_count = len(installs)
    
    installs = [i for i in installs if i.install_id != install_id]
    
    if len(installs) < original_count:
        data = {"installs": [i.model_dump() for i in installs]}
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
    data = {"allowlists": [a.model_dump() for a in allowlists]}
    save_json_file(ALLOWLISTS_FILE, data)
    
    return allowlist


def delete_allowlist(allowlist_id: str) -> bool:
    """Delete an allowlist."""
    allowlists = get_allowlists()
    original_count = len(allowlists)
    
    allowlists = [a for a in allowlists if a.allowlist_id != allowlist_id]
    
    if len(allowlists) < original_count:
        data = {"allowlists": [a.model_dump() for a in allowlists]}
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
    event_dict = event.model_dump()
    event_dict["timestamp"] = event.timestamp.isoformat()
    event_dict["signature_algorithm"] = AUDIT_SIGNATURE_ALGORITHM
    event_dict["signature_key_id"] = _audit_signing_key_id()
    event_dict.pop("signature_valid", None)
    event_dict["signature"] = _sign_event(event_dict)

    with _AUDIT_IO_LOCK:
        _rotate_audit_log_if_needed()
        with open(AUDIT_LOG_FILE, 'a', encoding='utf-8') as f:
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
    normalized_start = _normalize_datetime(start_time)
    normalized_end = _normalize_datetime(end_time)
    events = []

    for log_file in _iter_audit_log_files():
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if not line.strip():
                        continue

                    try:
                        event = json.loads(line)
                    except (json.JSONDecodeError, ValueError):
                        continue

                    event_time = _normalize_datetime(_parse_event_time(event.get("timestamp")))
                    if (normalized_start or normalized_end) and event_time is None:
                        continue
                    if normalized_start and event_time and event_time < normalized_start:
                        continue
                    if normalized_end and event_time and event_time > normalized_end:
                        continue

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

                    event["signature_valid"] = verify_event_signature(event)
                    events.append(event)
        except FileNotFoundError:
            continue

    events.sort(key=lambda e: str(e.get("timestamp", "")), reverse=True)
    return events[offset:offset + limit]


def get_audit_event_by_id(event_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific audit event by ID."""
    for log_file in _iter_audit_log_files():
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if not line.strip():
                        continue

                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if event.get('event_id') == event_id:
                        event["signature_valid"] = verify_event_signature(event)
                        return event
        except FileNotFoundError:
            continue
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
    if not _iter_audit_log_files():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return {
            'total_events': 0,
            'policy_decisions': 0,
            'tools_allowed': 0,
            'tools_denied': 0,
            'tools_executed': 0,
            'tools_failed': 0,
            'unique_servers': 0,
            'unique_users': 0,
            'time_range_start': start_time or now,
            'time_range_end': end_time or now
        }
    
    scan_limit = _env_int("MCP_AUDIT_SUMMARY_SCAN_LIMIT", default=50000)
    events = query_audit_events(
        run_id=run_id,
        user_id=user_id,
        start_time=start_time,
        end_time=end_time,
        limit=scan_limit
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
        'time_range_start': start_time or datetime.now(timezone.utc).replace(tzinfo=None),
        'time_range_end': end_time or datetime.now(timezone.utc).replace(tzinfo=None)
    }


def get_audit_anomalies(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    window_minutes: int = 60,
    min_events_for_spike: int = 20,
    deny_ratio_threshold: float = 0.4,
    repeated_deny_threshold: int = 5,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Detect anomalies in audit logs.

    Heuristics:
    - Deny ratio spike in a time window
    - Repeated denials by user/server/tool combination
    - Invalid/missing signature events
    """
    from .models import AuditAnomalySeverity

    normalized_end = _normalize_datetime(end_time) or datetime.now(timezone.utc).replace(tzinfo=None)
    normalized_start = _normalize_datetime(start_time) or (
        normalized_end - timedelta(minutes=max(1, window_minutes))
    )

    scan_limit = _env_int("MCP_AUDIT_ANOMALY_SCAN_LIMIT", default=50000)
    events = query_audit_events(
        start_time=normalized_start,
        end_time=normalized_end,
        limit=scan_limit
    )

    anomalies: List[Dict[str, Any]] = []

    # 1) Signature integrity anomalies.
    bad_signature_events = [e for e in events if e.get("signature_valid") is False]
    if bad_signature_events:
        severity = (
            AuditAnomalySeverity.CRITICAL.value
            if len(bad_signature_events) >= 10
            else AuditAnomalySeverity.HIGH.value
        )
        anomalies.append({
            "anomaly_id": f"anom-{uuid.uuid4().hex[:12]}",
            "anomaly_type": "audit.signature.invalid",
            "severity": severity,
            "summary": f"{len(bad_signature_events)} audit events failed signature validation",
            "detected_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "count": len(bad_signature_events),
            "window_start": normalized_start,
            "window_end": normalized_end,
            "metadata": {
                "sample_event_ids": [e.get("event_id") for e in bad_signature_events[:5]],
            },
        })

    # 2) Deny spike anomaly.
    deny_events = [
        e for e in events
        if e.get("decision") == "deny" or e.get("event_type") in {"tool.call.denied", "policy.deny"}
    ]
    total_events = len(events)
    deny_ratio = (len(deny_events) / total_events) if total_events else 0.0
    if total_events >= max(1, min_events_for_spike) and deny_ratio >= deny_ratio_threshold:
        severity = (
            AuditAnomalySeverity.CRITICAL.value
            if deny_ratio >= 0.75
            else AuditAnomalySeverity.HIGH.value
        )
        anomalies.append({
            "anomaly_id": f"anom-{uuid.uuid4().hex[:12]}",
            "anomaly_type": "policy.deny_ratio_spike",
            "severity": severity,
            "summary": (
                f"Deny ratio spike detected: {len(deny_events)}/{total_events} "
                f"({deny_ratio:.1%}) in the active window"
            ),
            "detected_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "count": len(deny_events),
            "window_start": normalized_start,
            "window_end": normalized_end,
            "metadata": {
                "deny_ratio": round(deny_ratio, 4),
                "total_events": total_events,
            },
        })

    # 3) Repeated denials by same actor/server/tool.
    deny_by_key: Dict[str, List[Dict[str, Any]]] = {}
    for event in deny_events:
        key = f"{event.get('user_id') or 'unknown'}|{event.get('server_id') or 'unknown'}|{event.get('tool_name') or 'unknown'}"
        deny_by_key.setdefault(key, []).append(event)

    for key, deny_group in deny_by_key.items():
        if len(deny_group) < max(1, repeated_deny_threshold):
            continue
        user_id, server_id, tool_name = key.split("|", 2)
        anomalies.append({
            "anomaly_id": f"anom-{uuid.uuid4().hex[:12]}",
            "anomaly_type": "policy.repeated_denials",
            "severity": AuditAnomalySeverity.MEDIUM.value,
            "summary": (
                f"Repeated denials detected ({len(deny_group)}) for "
                f"user={user_id}, server={server_id}, tool={tool_name}"
            ),
            "detected_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "count": len(deny_group),
            "window_start": normalized_start,
            "window_end": normalized_end,
            "metadata": {
                "user_id": user_id,
                "server_id": server_id,
                "tool_name": tool_name,
                "sample_event_ids": [e.get("event_id") for e in deny_group[:5]],
            },
        })

    severity_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    anomalies.sort(
        key=lambda a: (severity_rank.get(str(a.get("severity", "low")).lower(), 0), a.get("count", 0)),
        reverse=True
    )
    return anomalies[:limit]
