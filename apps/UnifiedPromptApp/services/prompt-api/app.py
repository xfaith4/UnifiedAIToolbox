### BEGIN FILE: app.py
import os, json, hashlib, hmac, sqlite3, datetime, textwrap, pathlib, sys, subprocess, re, uuid, time, threading, shutil, logging, asyncio, io, zipfile
from typing import cast
import openai
from dataclasses import dataclass
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any, Tuple, Callable
from functools import wraps

from fastapi import FastAPI, HTTPException, Path, Query, Header, Depends, status, Request # pyright: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator # pyright: ignore[reportMissingImports]
from pydantic_settings import BaseSettings, SettingsConfigDict
import uvicorn # pyright: ignore[reportMissingImports]
import yaml # pyright: ignore[reportMissingModuleSource]
import requests # pyright: ignore[reportMissingModuleSource]
from urllib.parse import urlparse
from html.parser import HTMLParser

from auth_github import ensure_github_token

try:
    from mcp_governance import storage as mcp_storage
    from mcp_governance.models import Allowlist, AllowlistScope
    from orchestration_mcp_middleware import OrchestrationMCPMiddleware
    MCP_ENFORCEMENT_IMPORTS_AVAILABLE = True
except ImportError:
    mcp_storage = None  # type: ignore
    Allowlist = None  # type: ignore
    AllowlistScope = None  # type: ignore
    OrchestrationMCPMiddleware = None  # type: ignore
    MCP_ENFORCEMENT_IMPORTS_AVAILABLE = False

# Configure logging at module level
logger = logging.getLogger(__name__)

# Import orchestrator logging utilities
try:
    from orchestrator_logger import OrchestratorLogger, compute_prompt_hash, detect_stacks, compute_file_hash
    from orchestrator_verifier import OrchestratorVerifier
    ORCHESTRATOR_LOGGING_AVAILABLE = True
except ImportError:
    ORCHESTRATOR_LOGGING_AVAILABLE = False
    logger.warning("Orchestrator logging modules not available")

# Import migrations module
try:
    from migrations import apply_migrations
except ImportError:
    apply_migrations = None  # Migrations module not available

# ----------------------------
# Simple In-Memory Cache
# ----------------------------
_cache: Dict[str, Tuple[Any, float]] = {}
CACHE_TTL = 60  # seconds

def simple_cache(ttl: int = CACHE_TTL):
    """Simple in-memory cache decorator for read-only endpoints."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key = f"{func.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"
            
            # Check if cached value exists and is still valid
            if cache_key in _cache:
                cached_value, cached_time = _cache[cache_key]
                if time.time() - cached_time < ttl:
                    return cached_value
            
            # Call function and cache result
            result = func(*args, **kwargs)
            _cache[cache_key] = (result, time.time())
            
            # Simple cache size management - keep last 100 entries
            if len(_cache) > 100:
                oldest_key = min(_cache.items(), key=lambda x: x[1][1])[0]
                del _cache[oldest_key]
            
            return result
        return wrapper
    return decorator

# ----------------------------
# Safe JSON Loading Utilities
# ----------------------------
def safe_json_load(file_path: pathlib.Path, default: Any = None, context: str = "") -> Any:
    """
    Safely load JSON from a file with enhanced error reporting.
    
    Args:
        file_path: Path to the JSON file
        default: Default value to return on error (None by default)
        context: Context string for error messages (e.g., "agent_status", "run_manifest")
    
    Returns:
        Parsed JSON data or default value on error
    
    Raises:
        ValueError: If file is empty or contains invalid JSON (with detailed error message)
    """
    content = None
    file_size = None
    
    try:
        if not file_path.exists():
            raise FileNotFoundError(f"JSON file not found: {file_path}")
        
        file_size = file_path.stat().st_size
        if file_size == 0:
            error_msg = f"Empty JSON file (0 bytes): {file_path}"
            if context:
                error_msg = f"[{context}] {error_msg}"
            raise ValueError(error_msg)
        
        content = file_path.read_text(encoding="utf-8")
        if not content.strip():
            error_msg = f"JSON file contains only whitespace: {file_path}"
            if context:
                error_msg = f"[{context}] {error_msg}"
            raise ValueError(error_msg)
        
        return json.loads(content)
    
    except json.JSONDecodeError as e:
        # Enhanced error message with file details and content preview
        content_preview = content[:200] if content else "<unable to read>"
        error_msg = (
            f"Invalid JSON in file: {file_path}\n"
            f"  Size: {file_size if file_size is not None else 'unknown'} bytes\n"
            f"  Error: {e.msg} at line {e.lineno}, column {e.colno}\n"
            f"  Content preview: {content_preview}..."
        )
        if context:
            error_msg = f"[{context}] {error_msg}"
        
        if default is not None:
            print(f"WARNING: {error_msg}\nReturning default value.", file=sys.stderr)
            return default
        raise ValueError(error_msg)
    
    except Exception as e:
        error_msg = f"Failed to load JSON from {file_path}: {type(e).__name__}: {e}"
        if context:
            error_msg = f"[{context}] {error_msg}"
        
        if default is not None:
            print(f"WARNING: {error_msg}\nReturning default value.", file=sys.stderr)
            return default
        raise ValueError(error_msg)

# ----------------------------
# Configuration
# ----------------------------
BASE_DIR = pathlib.Path(__file__).parent.resolve()
# Project root (repo root), not the service folder
ROOT_DIR = BASE_DIR.parents[3]

# On Windows, avoid noisy Proactor connection_lost stack traces
if sys.platform.startswith("win"):
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class ServiceSettings(BaseSettings):
    """Runtime configuration loaded from .env / environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="PROMPT_API_",
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    db_path: pathlib.Path = BASE_DIR / "workbench.db"
    template_dir: pathlib.Path = BASE_DIR / "templates"
    data_dir: pathlib.Path = BASE_DIR / "data"
    openai_model: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # fallback for legacy env var
    openai_api_key: Optional[str] = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY"))
    openai_api_base: str = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1")
    provider: str = Field(
        default_factory=lambda: os.environ.get("PROMPT_API_PROVIDER") or os.environ.get("AI_PROVIDER") or "openai"
    )
    bridge_dir: pathlib.Path = ROOT_DIR / "apps" / "orchestration-bridge"
    admin_token: Optional[str] = Field(default_factory=lambda: os.environ.get("PROMPT_API_ADMIN_TOKEN"))


settings = ServiceSettings()
settings.template_dir.mkdir(parents=True, exist_ok=True)
settings.data_dir.mkdir(parents=True, exist_ok=True)

DB_PATH = settings.db_path
TEMPLATE_DIR = settings.template_dir
DATA_DIR = settings.data_dir
DEFAULT_MODEL = settings.openai_model
OPENAI_API_KEY = settings.openai_api_key or ""
OPENAI_API_BASE = settings.openai_api_base.rstrip("/")
if OPENAI_API_BASE in ("https://api.openai.com", "http://api.openai.com"):
    # OpenAI public API expects `/v1` (e.g. `/v1/responses`). Avoid 404s like `/responses`.
    OPENAI_API_BASE = f"{OPENAI_API_BASE}/v1"
PROVIDER = (settings.provider or "openai").lower()
PROMPT_SYNC_FILE = DATA_DIR / "prompt-library.json"
AGENT_SYNC_FILE = DATA_DIR / "agent-library.json"


def _normalized_runtime_env() -> str:
    """Normalize environment name across legacy and new env vars."""
    return (
        os.environ.get("PROMPT_API_ENV")
        or os.environ.get("ENVIRONMENT")
        or "development"
    ).strip().lower()


def _is_development_environment() -> bool:
    return _normalized_runtime_env() in {"dev", "development", "local", "test", "testing"}


def _is_truthy(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _allow_insecure_local() -> bool:
    """
    Whether insecure/no-token access is allowed.

    Backwards-compatible default:
    - dev/test/local: allowed unless explicitly disabled
    - non-dev: denied unless explicitly enabled
    """
    raw = os.environ.get("ALLOW_INSECURE_LOCAL")
    if raw is None:
        return _is_development_environment()
    return _is_truthy(raw)


def _constant_time_equals(left: Optional[str], right: Optional[str]) -> bool:
    if not left or not right:
        return False
    return hmac.compare_digest(left, right)


def _get_execution_token() -> Optional[str]:
    """
    Resolve token used for process-executing orchestration routes.

    Priority:
    1. PROMPT_API_EXECUTION_TOKEN
    2. PROMPT_API_ADMIN_TOKEN (settings.admin_token)
    """
    return os.environ.get("PROMPT_API_EXECUTION_TOKEN") or settings.admin_token

BRIDGE_DIR = settings.bridge_dir
BRIDGE_RUN_DIR = BRIDGE_DIR / "runs"
BRIDGE_RUN_DIR.mkdir(parents=True, exist_ok=True)
PS_REFINER = BRIDGE_DIR / "OpenAI_Refiner.ps1"
# Prefer in-repo orchestrator; fallback to external path or env override
def _resolve_env_path(env_key: str, default_path: pathlib.Path) -> pathlib.Path:
    value = os.environ.get(env_key)
    if value:
        return pathlib.Path(value).expanduser().resolve()
    return default_path

DEFAULT_UNIFIED_ORCHESTRATOR = (
    ROOT_DIR / "Orchestration" / "scripts" / "Unified-Orchestration.ps1"
).resolve()
DEFAULT_POF = (ROOT_DIR / "Orchestration" / "scripts" / "POF.ps1").resolve()
POF_PS1 = _resolve_env_path("POF_PS1", DEFAULT_POF)
ORCH_PS1 = _resolve_env_path("ORCHESTRATOR_PS1", DEFAULT_UNIFIED_ORCHESTRATOR)
CODEX_SWARM_PS1 = os.environ.get("CODEX_SWARM_PS1") or str(
    (ROOT_DIR / "Orchestration" / "engine" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1").resolve()
)
REPO_ROOT_DEFAULT = str((ROOT_DIR.parent).resolve())

REGISTRY_SRC = ROOT_DIR / "packages" / "prompt-registry" / "src"
if REGISTRY_SRC.exists():
    sys.path.insert(0, str(REGISTRY_SRC))
try:
    from prompt_registry import (
        PromptSpec,
        list_prompts as registry_list_prompts,
        find_prompt_by_id as registry_find_prompt,
    )  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    PromptSpec = Any  # type: ignore
    registry_list_prompts = None  # type: ignore
    registry_find_prompt = None  # type: ignore


@dataclass
class SyncedPromptSpec:
    id: str
    version: str
    raw: Dict[str, Any]
    payload: Dict[str, Any]
    path: Optional[pathlib.Path] = None

    def to_ui_payload(self) -> Dict[str, Any]:
        return self.payload

# ----------------------------
# Data Models
# ----------------------------
class InputData(BaseModel):
    # Free-form bag for your scenario inputs
    log_snippet: Optional[str] = None
    timestamp: Optional[str] = None
    # Add more keys as your use cases expand (metrics, regions, etc.)
    # Example:
    # metrics: Optional[Dict[str, Any]] = None

class RequestPayload(BaseModel):
    template_id: str = Field(..., description="e.g., agent_webrtc_disconnect_v1.0.0")
    role: str = Field(..., description="e.g., Genesys Cloud Monitoring Assistant")
    task: str = Field(..., description="e.g., Explain likely causes and mitigations for WebRTC disconnects")
    context: Dict[str, Any] = Field(..., description="e.g., {'environment':'Prod','audience':['Executives','NOC Engineers'],'scale':'100k agents, 12 BPO partners'}")
    input_data: InputData = Field(default_factory=InputData)
    desired_output: List[str] = Field(default_factory=lambda: ["executive_summary","technical_json","chart_recommendations"])
    modes: List[str] = Field(default_factory=lambda: ["exec","engineer","viz"])  # Presentation modes
    model: Optional[str] = None

    @field_validator("desired_output")
    @classmethod
    def at_least_one_output(cls, value):
        if not value:
            raise ValueError("desired_output must have at least one item")
        return value

class GenerateResponse(BaseModel):
    cached: bool
    cache_key: str
    template_id: str
    model: str
    output: Dict[str, Any]
    audit_id: int

class PromptSyncRequest(BaseModel):
    prompts: List[Dict[str, Any]] = Field(default_factory=list)

class RenderRequest(BaseModel):
    prompt_id: str
    variables: Dict[str, Any] = Field(default_factory=dict)

class RenderResponse(BaseModel):
    prompt: Dict[str, Any]
    rendered_blocks: Dict[str, Any]

class RefinerRunRequest(BaseModel):
    prompt_id: str
    invoke_refiner: bool = True
    dry_run: bool = False
    reviewers: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

class RefinerRunResponse(BaseModel):
    prompt_id: str
    manifest: Optional[str]
    refiner_invoked: bool
    dry_run: bool
    reviewers: List[str]
    notes: Optional[str]


class ReviewRecordRequest(BaseModel):
    status: str
    reviewers: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    manifest: Optional[str] = None
    timestamp: Optional[str] = None
    runbook: Optional[Dict[str, Any]] = None


class AgentSyncRequest(BaseModel):
    agents: List[Dict[str, Any]] = Field(default_factory=list)


class PromptSearchResult(BaseModel):
    id: str
    title: str
    version: str
    category: Optional[str] = None
    owner: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    updated: str
    relevance: Optional[float] = None


class SearchPromptsResponse(BaseModel):
    results: List[PromptSearchResult]
    total: int
    query: Optional[str] = None
    filters: Dict[str, Any] = Field(default_factory=dict)


class OrchestratorTask(BaseModel):
    supervisor: Dict[str, Any]
    agents: List[Dict[str, Any]] = Field(default_factory=list)
    prompts: List[Dict[str, Any]] = Field(default_factory=list)

# ----------------------------
# DB helpers (cache + audit)
# ----------------------------
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS cache (
            cache_key TEXT PRIMARY KEY,
            template_id TEXT,
            model TEXT,
            input_json TEXT,
            output_json TEXT,
            created_at TEXT
        )
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT,
            model TEXT,
            input_json TEXT,
            output_json TEXT,
            cached INTEGER,
            status TEXT,
            created_at TEXT,
            token_prompt INTEGER,
            token_completion INTEGER
        )
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS orchestrator_tasks (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL
        )
        """)
        conn.commit()
    _migrate_legacy_task_queue()
    
    # Apply database migrations for new features
    if apply_migrations:
        try:
            apply_migrations(DB_PATH)
        except Exception as e:
            print(f"Warning: Could not apply migrations: {e}")

def now_iso():
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

def normalize(obj: Any) -> str:
    """Deterministic JSON for hashing & storage."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def sanitize_run_id(raw: str, max_length: int = 120) -> str:
    """
    Sanitize a run ID/goal string to be safe for Windows filesystem paths.
    
    Windows filesystem has strict constraints on valid path characters, and certain
    characters like newlines, colons, and other control characters cause errors when
    creating directories (e.g., WinError 123).
    
    This function:
    - Treats None as empty string
    - Strips leading/trailing whitespace including \\r and \\n
    - Replaces any whitespace (spaces, tabs, newlines) with a single underscore
    - Replaces invalid Windows path characters (<>:"/\\|?*) with underscores
    - Collapses multiple consecutive underscores into a single underscore
    - Strips trailing dots and spaces (Windows doesn't allow these at the end of names)
    - Defaults to "run" if the result is empty
    - Enforces a maximum length to avoid excessively long path segments
    
    Args:
        raw: The raw string to sanitize (e.g., a goal or prompt ID)
        max_length: Maximum length for the sanitized result (default: 120)
    
    Returns:
        A filesystem-safe string suitable for use as a single path component
    """
    if raw is None:
        raw = ""
    
    # Strip leading/trailing whitespace including carriage returns and newlines
    result = raw.strip()
    
    # Replace any whitespace character (space, tab, newline, carriage return) with underscore
    result = re.sub(r'\s+', '_', result)
    
    # Define invalid Windows path characters
    INVALID_PATH_CHARS = '<>:"/\\|?*'
    
    # Replace each invalid character with underscore
    for char in INVALID_PATH_CHARS:
        result = result.replace(char, '_')

    # Replace any remaining unsafe characters (including [] and commas) with underscores
    # Keep only letters, numbers, dot, dash, and underscore to avoid shell/glob issues.
    result = re.sub(r'[^A-Za-z0-9._-]+', '_', result)
    
    # Collapse multiple consecutive underscores into a single underscore
    result = re.sub(r'_+', '_', result)
    
    # Strip trailing dots, spaces, and underscores (Windows doesn't allow dots/spaces at end)
    result = result.rstrip('_. ')
    
    # If the result is empty, default to "run"
    if not result:
        result = "run"
    
    # Enforce maximum length
    if len(result) > max_length:
        result = result[:max_length].rstrip('_. ')
    
    return result

def hash_payload(template_id: str, model: str, payload: Dict[str, Any]) -> str:
    h = hashlib.sha256()
    h.update(template_id.encode("utf-8"))
    h.update(model.encode("utf-8"))
    h.update(normalize(payload).encode("utf-8"))
    return h.hexdigest()

def cache_get(cache_key: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT output_json FROM cache WHERE cache_key = ?", (cache_key,))
        row = c.fetchone()
        if row:
            return json.loads(row[0])
    return None

def cache_put(cache_key: str, template_id: str, model: str, input_json: str, output: Dict[str, Any]):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO cache(cache_key, template_id, model, input_json, output_json, created_at) VALUES (?,?,?,?,?,?)",
        (cache_key, template_id, model, input_json, json.dumps(output), now_iso()))
        conn.commit()

def audit_log(
    template_id: str, 
    model: str, 
    input_json: str, 
    output: Optional[Dict[str, Any]], 
    cached: bool, 
    status: str, 
    token_prompt: Optional[int], 
    token_completion: Optional[int],
    run_id: Optional[str] = None,
    agent_name: Optional[str] = None
) -> int:
    """
    Log API call to audit table and optionally record environmental metrics.
    
    Args:
        template_id: Template/prompt ID
        model: Model name
        input_json: JSON serialized input
        output: Output dictionary
        cached: Whether result was cached
        status: Status string
        token_prompt: Input/prompt tokens
        token_completion: Output/completion tokens
        run_id: Optional orchestration run ID
        agent_name: Optional agent name
        
    Returns:
        Audit log entry ID
    """
    timestamp = now_iso()
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        INSERT INTO audit(template_id, model, input_json, output_json, cached, status, created_at, token_prompt, token_completion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (template_id, model, input_json, json.dumps(output) if output else None, 1 if cached else 0, status, timestamp, token_prompt, token_completion))
        audit_id = c.lastrowid
        conn.commit()
    
    # Record environmental metrics if tokens available and not cached (to avoid double-counting)
    if token_prompt is not None and token_completion is not None and not cached:
        try:
            # Import is at module level at top of file
            import cost_metrics
            cost_metrics.record_call_metrics(
                db_path=DB_PATH,
                model=model,
                tokens_input=token_prompt,
                tokens_output=token_completion,
                run_id=run_id,
                agent_name=agent_name,
                timestamp=timestamp
            )
        except Exception as e:
            # Don't fail the audit log if metrics recording fails
            print(f"Warning: Failed to record cost metrics: {e}")
    
    return audit_id

def read_templates() -> Dict[str, Dict[str, Any]]:
    templates = {}
    for p in TEMPLATE_DIR.glob("*.yaml"):
        with open(p, "r", encoding="utf-8") as f:
            y = yaml.safe_load(f)
            templates[y["id"]] = y
    return templates

def load_registry_payloads() -> List[Dict[str, Any]]:
    if registry_list_prompts is None:
        return []
    try:
        return [spec.to_ui_payload() for spec in registry_list_prompts()]
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to load registry prompts: {exc}")
        return []

def load_synced_payloads() -> List[Dict[str, Any]]:
    if not PROMPT_SYNC_FILE.exists():
        return []
    try:
        with open(PROMPT_SYNC_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to read synced prompts: {exc}")
        return []

def save_synced_payloads(payload: List[Dict[str, Any]]) -> None:
    with open(PROMPT_SYNC_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _migrate_legacy_task_queue() -> None:
    queue_file = DATA_DIR / "orchestrator-tasks.json"
    if not queue_file.exists():
        return
    try:
        legacy_data = json.loads(queue_file.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to migrate legacy task queue ({exc})")
        return
    if not isinstance(legacy_data, list):
        legacy_data = []
    with sqlite3.connect(DB_PATH) as conn:
        for entry in legacy_data:
            if not isinstance(entry, dict):
                continue
            task_id = entry.get("id")
            if not task_id:
                continue
            conn.execute(
                "INSERT OR IGNORE INTO orchestrator_tasks(id, payload) VALUES (?, ?)",
                (task_id, json.dumps(entry)),
            )
        conn.commit()
    try:
        queue_file.rename(queue_file.with_suffix(".legacy.json"))
    except FileNotFoundError:
        pass


def _build_blocks_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    blocks = payload.get("blocks")
    if isinstance(blocks, dict):
        return blocks
    template = payload.get("template") or payload.get("description") or ""
    style = payload.get("style") or ""
    system_role = payload.get("role")
    system_msg = style if system_role == "system" and style else f"You are {system_role or 'a helpful assistant'}."
    constructed = {
        "system": system_msg,
        "instructions": template,
    }
    if style and system_role != "system":
        constructed["style"] = style
    few_shot = payload.get("fewShot")
    if isinstance(few_shot, list) and few_shot:
        examples = []
        current_input: Optional[str] = None
        for message in few_shot:
            if not isinstance(message, dict):
                continue
            role = message.get("role")
            content = message.get("content")
            if role == "user":
                current_input = content
            elif role == "assistant":
                entry = {"output": content}
                if current_input:
                    entry["input"] = {"raw": current_input}
                examples.append(entry)
                current_input = None
        constructed["examples"] = [ex for ex in examples if ex.get("output")]
    return constructed


def _build_variables_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    variables: Dict[str, Any] = {}
    raw_vars = payload.get("variables")
    if isinstance(raw_vars, list):
        for idx, entry in enumerate(raw_vars):
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or f"var{idx+1}"
            variables[name] = {
                "type": entry.get("type") or "string",
                "label": entry.get("label"),
                "description": entry.get("description"),
                "required": bool(entry.get("required")),
                "default": entry.get("default"),
            }
    return variables


def _synced_prompt_spec(prompt_id: str) -> Optional[SyncedPromptSpec]:
    for payload in load_synced_payloads():
        if payload.get("id") != prompt_id:
            continue
        version = str(payload.get("version") or "0.0.0")
        raw = {
            "id": prompt_id,
            "version": version,
            "blocks": _build_blocks_from_payload(payload),
            "variables": _build_variables_from_payload(payload),
        }
        return SyncedPromptSpec(id=prompt_id, version=version, raw=raw, payload=payload)
    return None


def load_synced_agents() -> List[Dict[str, Any]]:
    if not AGENT_SYNC_FILE.exists():
        return []
    try:
        with open(AGENT_SYNC_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except Exception as exc:  # pragma: no cover
        print(f"[prompt-api] Failed to read agent library: {exc}")
        return []


def save_synced_agents(payload: List[Dict[str, Any]]) -> None:
    with open(AGENT_SYNC_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _require_admin_access(header_token: Optional[str]) -> None:
    expected = settings.admin_token
    if not expected:
        if _allow_insecure_local():
            return
        raise HTTPException(
            status_code=401,
            detail=(
                "Admin token is not configured. Set PROMPT_API_ADMIN_TOKEN or "
                "explicitly set ALLOW_INSECURE_LOCAL=true for local-only development."
            ),
        )
    if not _constant_time_equals(header_token, expected):
        raise HTTPException(status_code=401, detail="Admin token missing or invalid.")


def _require_execution_access(header_token: Optional[str]) -> None:
    expected = _get_execution_token()
    if not expected:
        if _allow_insecure_local():
            return
        raise HTTPException(
            status_code=401,
            detail=(
                "Execution token is not configured. Set PROMPT_API_EXECUTION_TOKEN "
                "(or PROMPT_API_ADMIN_TOKEN), or explicitly set ALLOW_INSECURE_LOCAL=true."
            ),
        )
    if not _constant_time_equals(header_token, expected):
        raise HTTPException(status_code=401, detail="Execution token missing or invalid.")


def _validate_prompt_sync_payload(prompts: List[Dict[str, Any]]) -> None:
    if len(prompts) > 1000:
        raise HTTPException(status_code=400, detail="Prompt sync limit exceeded (max 1000 records).")
    for idx, prompt in enumerate(prompts):
        if not isinstance(prompt, dict):
            raise HTTPException(status_code=400, detail=f"Prompt at index {idx} is not an object.")
        prompt_id = prompt.get("id")
        if not isinstance(prompt_id, str) or not prompt_id.strip():
            raise HTTPException(status_code=400, detail=f"Prompt at index {idx} is missing a valid 'id'.")
        has_template = any(
            isinstance(prompt.get(key), (str, dict))
            for key in ("template", "prompt", "blocks")
        )
        if not has_template:
            raise HTTPException(status_code=400, detail=f"Prompt '{prompt_id}' must include template content.")


def _validate_agent_payload(agents: List[Dict[str, Any]]) -> None:
    if len(agents) > 500:
        raise HTTPException(status_code=400, detail="Agent sync limit exceeded (max 500 records).")
    for idx, agent in enumerate(agents):
        if not isinstance(agent, dict):
            raise HTTPException(status_code=400, detail=f"Agent at index {idx} is not an object.")
        agent_id = agent.get("id")
        if not isinstance(agent_id, str) or not agent_id.strip():
            raise HTTPException(status_code=400, detail=f"Agent at index {idx} is missing a valid 'id'.")


def load_task_queue() -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT payload FROM orchestrator_tasks ORDER BY rowid").fetchall()
    tasks: List[Dict[str, Any]] = []
    for (payload_json,) in rows:
        try:
            tasks.append(json.loads(payload_json))
        except json.JSONDecodeError:  # pragma: no cover
            continue
    return tasks


def append_task_queue(task: Dict[str, Any]) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO orchestrator_tasks(id, payload) VALUES (?, ?)",
            (task["id"], json.dumps(task)),
        )
        conn.commit()


def update_task_queue(task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT payload FROM orchestrator_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        payload = json.loads(row[0])
        payload.update(updates)
        conn.execute(
            "UPDATE orchestrator_tasks SET payload = ? WHERE id = ?",
            (json.dumps(payload), task_id),
        )
        conn.commit()
        return payload

VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")

def _get_prompt_or_404(prompt_id: str, allow_synced: bool = False):
    registry_missing = registry_find_prompt is None
    spec = None
    if not registry_missing:
        spec = registry_find_prompt(prompt_id)
    if spec:
        return spec
    if allow_synced:
        synced_spec = _synced_prompt_spec(prompt_id)
        if synced_spec:
            return synced_spec
    if registry_missing:
        raise HTTPException(status_code=503, detail="Prompt registry not available")
    raise HTTPException(status_code=404, detail=f"Prompt not found: {prompt_id}")

def _render_text(value: Any, variables: Dict[str, Any]) -> Any:
    if not isinstance(value, str):
        return value
    def repl(match: re.Match) -> str:
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return VAR_PATTERN.sub(repl, value)

def render_blocks(spec, variables: Dict[str, Any]) -> Dict[str, Any]:
    blocks = spec.raw.get("blocks", {})
    rendered = {}
    for key, value in blocks.items():
        if isinstance(value, list):
            rendered[key] = [_render_text(v, variables) for v in value]
        elif isinstance(value, dict):
            rendered[key] = {k: _render_text(v, variables) for k, v in value.items()}
        else:
            rendered[key] = _render_text(value, variables)
    return rendered


def _block_to_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(str(item) for item in value)
    return str(value)


def _template_from_spec(spec: PromptSpec) -> Dict[str, Any]:
    blocks = spec.raw.get("blocks", {}) or {}
    examples = []
    for example in blocks.get("examples", []) or []:
        raw_input = example.get("input")
        if isinstance(raw_input, (dict, list)):
            input_value = json.dumps(raw_input, ensure_ascii=False)
        else:
            input_value = str(raw_input or "")
        examples.append(
            {
                "input": input_value,
                "output": example.get("output", ""),
            }
        )
    return {
        "id": spec.id,
        "version": spec.version,
        "system": blocks.get("system", ""),
        "instructions": _block_to_string(blocks.get("instructions")),
        "constraints": _block_to_string(blocks.get("constraints")),
        "style": _block_to_string(blocks.get("style")),
        "few_shot": examples,
    }


def _resolve_template_payload(template_id: str) -> Tuple[Dict[str, Any], str]:
    """
    Return a template-like payload for message building.

    Prefers the canonical prompt registry. Falls back to legacy YAML templates.
    """

    if registry_find_prompt is not None:
        try:
            spec = registry_find_prompt(template_id)
        except Exception as exc:  # pragma: no cover
            print(f"[prompt-api] registry lookup failed for {template_id}: {exc}")
            spec = None
        if spec:
            return _template_from_spec(spec), "registry"

    templates = read_templates()
    tpl = templates.get(template_id)
    if tpl:
        return tpl, "legacy"

    raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")

METRICS = {
    "renders_total": 0,
    "render_errors": 0,
    "refiner_runs": 0,
    "refiner_errors": 0,
    "review_records": 0,
}

def _write_manifest(spec, review_policy: str) -> pathlib.Path:
    manifest = {
        "prompt_id": spec.id,
        "version": spec.version,
        "source_path": str(spec.path),
        "requested_at": now_iso(),
        "review_policy": review_policy,
        "status": "queued",
    }
    target = BRIDGE_RUN_DIR / f"{spec.id.replace('.', '_')}.{spec.version}.json"
    target.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return target

def _invoke_power_shell_refiner(spec, manifest: pathlib.Path, dry_run: bool) -> None:
    """
    Invoke the PowerShell refiner script to process a prompt.
    
    This intentionally uses PowerShell as a worker process to leverage the existing
    OpenAI_Refiner.ps1 script that handles goal refinement and AI interaction.
    The design allows the Python API to orchestrate PowerShell-based AI workflows
    without reimplementing the refinement logic.
    
    For language-agnostic orchestration, consider using the orchestration-bridge
    service which provides a more flexible task queue system.
    """
    if dry_run:
        return
    if not PS_REFINER.exists():
        raise HTTPException(status_code=500, detail="Refiner script missing; cannot invoke.")
    cmd = [
        "pwsh" if os.name != "nt" else "powershell",
        "-File",
        str(PS_REFINER),
        "-PromptPath",
        str(spec.path),
        "-Manifest",
        str(manifest),
    ]
    subprocess.run(cmd, check=False)

def _refiner_queue_depth() -> int:
    return len(list(BRIDGE_RUN_DIR.glob("*.json")))


def _append_review_run(spec: PromptSpec, entry: Dict[str, Any]) -> Dict[str, Any]:
    with open(spec.path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}

    telemetry = data.setdefault("telemetry", {})
    audit = telemetry.setdefault("audit", {})
    runs = audit.setdefault("runs", [])
    runs.append(entry)

    telemetry["audit"] = audit
    data["telemetry"] = telemetry

    with open(spec.path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)
    return entry

# ----------------------------
# Prompt assembly
# ----------------------------
def build_messages(tpl: Dict[str, Any], req: RequestPayload) -> List[Dict[str, str]]:
    """Assemble system + few-shot + user messages."""
    # 1) System message (strict behavior contract)
    system_msg = tpl.get("system", "You are a helpful assistant.")
    # Interpolate lite tokens
    system_msg = system_msg.replace("{role}", req.role)

    messages = [{"role": "system", "content": system_msg}]

    # 2) Few-shot scaffolding (gold examples)
    for ex in tpl.get("few_shot", []):
        messages.append({"role": "user", "content": ex.get("input", "")})
        messages.append({"role": "assistant", "content": ex.get("output", "")})

    # 3) Output contract (enforce response shape)
    contract = textwrap.dedent("""\
    Output Contract:
    - Always return a JSON object with keys requested in 'desired_output'. 
    - If 'executive_summary' is requested, provide 2-4 crisp bullets with trend direction and business impact.
    - If 'technical_json' is requested, include fields: probable_cause, recommended_action (1-3 sentences each).
    - If 'chart_recommendations' is requested, return a small array of chart specs with 'type','metric','granularity'.
    - Always include both "C-Suite Summary" and "Engineer Drill-down" perspectives when applicable.
    - If data is insufficient, set probable_cause='unknown' and recommended_action='collect additional signals: <list>'.
    """)

    # 4) User message (task, context, inputs)
    user_msg = {
        "Task": req.task,
        "Context": req.context,
        "Modes": req.modes,
        "DesiredOutput": req.desired_output,
        "InputData": req.input_data.model_dump()
    }

    user_content = f"""\
You are acting as: {req.role}
Task: {req.task}
Context: {json.dumps(req.context, ensure_ascii=False)}
Modes: {", ".join(req.modes)}
DesiredOutput: {", ".join(req.desired_output)}

InputData (JSON):
{json.dumps(req.input_data.model_dump(), ensure_ascii=False, indent=2)}

{contract}

Return ONLY the JSON. No extra text.
"""
    supplemental = []
    for label, key in [("Instructions", "instructions"), ("Constraints", "constraints"), ("Style", "style")]:
        text_value = tpl.get(key)
        if text_value:
            supplemental.append(f"{label}:\n{text_value}")
    if supplemental:
        user_content += "\n" + "\n\n".join(supplemental) + "\n"

    messages.append({"role": "user", "content": user_content})
    return messages

# ----------------------------
# OpenAI call
# ----------------------------
def call_openai_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    client = openai.OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_API_BASE)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
        )
    except Exception as exc:
        error_id = uuid.uuid4().hex[:8]
        print(f"[prompt-api] OpenAI error {error_id}: {exc}")
        raise HTTPException(status_code=502, detail=f"OpenAI error (id: {error_id})")

    choice = resp.choices[0].message
    content = cast(str, choice.content or "")
    usage = {
        "prompt_tokens": resp.usage.prompt_tokens if resp.usage else None,
        "completion_tokens": resp.usage.completion_tokens if resp.usage else None,
        "total_tokens": resp.usage.total_tokens if resp.usage else None,
    }

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(content[start:end+1])
        else:
            raise HTTPException(status_code=500, detail="Model did not return valid JSON.")

    return parsed, usage


def call_anthropic_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Placeholder for Anthropic provider. Extend with real SDK when available.
    """
    raise HTTPException(status_code=501, detail="Anthropic provider not yet implemented")


def call_azure_openai_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Placeholder for Azure OpenAI provider. Extend with Azure client configuration.
    """
    raise HTTPException(status_code=501, detail="Azure OpenAI provider not yet implemented")


def call_provider_chat(model: str, messages: List[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Simple provider router. Defaults to OpenAI; other providers stubbed for now.
    """
    provider = PROVIDER
    if provider == "openai":
        return call_openai_chat(model, messages)
    if provider in ("anthropic", "claude"):
        return call_anthropic_chat(model, messages)
    if provider in ("azure", "azure-openai"):
        return call_azure_openai_chat(model, messages)
    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


def _raise_openai_error(resp: requests.Response) -> None:
    error_id = uuid.uuid4().hex[:8]
    snippet = (resp.text or "")[:500]
    print(f"[prompt-api] OpenAI error {error_id} ({resp.status_code}): {snippet}")
    raise HTTPException(status_code=502, detail=f"Upstream provider error (id: {error_id})")

# ----------------------------
# FastAPI app
# ----------------------------

# Security and Performance Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
import time

# Import security utilities
try:
    from security import (
        RateLimitMiddleware, AuditLoggingMiddleware, 
        get_security_headers, initialize_security
    )
    SECURITY_ENABLED = True
except ImportError as security_import_error:
    if not _allow_insecure_local():
        raise RuntimeError(
            "Security middleware is required in non-local environments. "
            "Ensure prompt-api/security.py is importable, or set ALLOW_INSECURE_LOCAL=true explicitly."
        ) from security_import_error
    print(f"Warning: Security module not available: {security_import_error}")
    SECURITY_ENABLED = False

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Apply security headers
        if SECURITY_ENABLED:
            headers = get_security_headers()
            for key, value in headers.items():
                response.headers[key] = value
        else:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Allow caching for static resources but not for API responses with sensitive data
        if request.url.path.startswith("/static/") or request.url.path.endswith((".css", ".js", ".png", ".jpg", ".svg")):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

class PerformanceMiddleware(BaseHTTPMiddleware):
    """Middleware to track request performance metrics."""
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))  # milliseconds
        return response
def create_app() -> FastAPI:
    fastapi_app = FastAPI(title="AI Prompt Workbench", version="1.0.0")

    # Initialize security features
    if SECURITY_ENABLED:
        initialize_security()

    # Add compression middleware (first for response compression)
    fastapi_app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Add security middleware (rate limiting and audit logging)
    if SECURITY_ENABLED:
        fastapi_app.add_middleware(AuditLoggingMiddleware)
        fastapi_app.add_middleware(RateLimitMiddleware)
    
    # Add performance tracking middleware
    fastapi_app.add_middleware(PerformanceMiddleware)
    
    # Add security headers middleware
    fastapi_app.add_middleware(SecurityHeadersMiddleware)

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://localhost:8501",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        ensure_github_token()
        init_db()
        yield

    fastapi_app.router.lifespan_context = lifespan
    return fastapi_app


app = create_app()

# Initialize authentication system
try:
    from auth import (
        initialize_auth, authenticate_user, create_access_token, create_refresh_token,
        UserLogin, Token, User, UserCreate, create_user, get_current_user, get_current_active_user,
        require_admin, require_user, require_readonly, UserRole
    )
    initialize_auth()
    AUTH_ENABLED = True
except ImportError as e:
    print(f"Warning: Authentication not available: {e}")
    AUTH_ENABLED = False

# Include GitHub integration router
try:
    from github_api import router as github_router
    app.include_router(github_router)
except ImportError as e:
    print(f"Warning: GitHub integration not available: {e}")

# Include webhook handler router
try:
    from webhook_handler import router as webhook_router
    app.include_router(webhook_router)
except ImportError as e:
    print(f"Warning: Webhook handler not available: {e}")

# Include MCP governance router
try:
    from mcp_governance.api_routes import router as mcp_router
    app.include_router(mcp_router)
except ImportError as e:
    print(f"Warning: MCP governance not available: {e}")

# ----------------------------
# Authentication Endpoints
# ----------------------------
if AUTH_ENABLED:
    @app.post("/auth/login", response_model=Token)
    def login(credentials: UserLogin):
        """Authenticate user and return access and refresh tokens."""
        user = authenticate_user(credentials.username, credentials.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token = create_access_token(data={"sub": user.username, "role": user.role.value})
        refresh_token = create_refresh_token(data={"sub": user.username, "role": user.role.value})
        
        return Token(access_token=access_token, refresh_token=refresh_token)

    @app.post("/auth/register", response_model=User)
    def register(user_data: UserCreate, current_user: User = Depends(require_admin)):
        """Register a new user (admin only)."""
        return create_user(user_data)

    @app.get("/auth/me", response_model=User)
    def get_me(current_user: User = Depends(get_current_active_user)):
        """Get current user information."""
        return current_user

    @app.get("/auth/status")
    def auth_status():
        """Check if authentication is enabled."""
        return {"enabled": True, "message": "Authentication is enabled"}
else:
    @app.get("/auth/status")
    def auth_status():
        """Check if authentication is disabled."""
        return {"enabled": False, "message": "Authentication is disabled"}

@app.get("/health")
def health():
    return {"ok": True, "time": now_iso()}

# ----------------------------
# Telemetry Endpoint
# ----------------------------
class TelemetryEventModel(BaseModel):
    timestamp: str
    eventType: str
    source: str
    metadata: Dict[str, Any]
    schema_version: str = "1.0"

class TelemetryBatchRequest(BaseModel):
    events: List[TelemetryEventModel]

@app.post("/api/telemetry")
def receive_telemetry(batch: TelemetryBatchRequest):
    """
    Receive telemetry events from dashboard and other clients.
    Writes events to JSONL file in artifacts/telemetry directory.
    
    Note: In high-concurrency scenarios, consider using a message queue
    or database for better reliability.
    """
    try:
        # Ensure telemetry directory exists
        telemetry_dir = ROOT_DIR / "artifacts" / "telemetry"
        telemetry_dir.mkdir(parents=True, exist_ok=True)
        
        # Get today's telemetry file
        date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        telemetry_file = telemetry_dir / f"telemetry_{date_str}.jsonl"
        
        # Write events as JSONL with atomic-like operation
        # Serialize all events first
        json_lines = []
        for event in batch.events:
            event_dict = event.model_dump()
            json_lines.append(json.dumps(event_dict) + "\n")
        
        # Write all lines in one operation to minimize race window
        with open(telemetry_file, "a", encoding="utf-8") as f:
            f.writelines(json_lines)
        
        return {
            "ok": True,
            "events_received": len(batch.events),
            "file": str(telemetry_file.name)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write telemetry: {str(e)}"
        )

@app.get("/api/telemetry/stats")
def get_telemetry_stats(days: int = Query(7, ge=1, le=90)):
    """
    Get telemetry statistics for the specified number of days.
    Returns aggregated metrics from cost, quality, and run data.
    
    Compatible with migrations 4-6 (cost metrics, run aggregates, quality tracking).
    Returns sane defaults when no data exists.
    """
    try:
        # Calculate date range
        end_date = datetime.datetime.now(datetime.timezone.utc)
        start_date = end_date - datetime.timedelta(days=days)
        
        # Initialize response with safe defaults
        stats = {
            "total_events": 0,
            "period_days": days,
            "start_date": start_date.isoformat().replace("+00:00", "Z"),
            "end_date": end_date.isoformat().replace("+00:00", "Z"),
            "by_event_type": {},
            "by_source": {},
            "by_day": {}
        }
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Check if new tables exist (from migrations 4-6)
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN (
                    'orchestration_cost_metrics',
                    'orchestration_run_aggregates', 
                    'run_quality_metrics'
                )
            """)
            available_tables = {row[0] for row in cursor.fetchall()}
            
            # Query run aggregates if table exists (migration 5)
            if 'orchestration_run_aggregates' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as run_count,
                            SUM(total_cost_usd) as total_cost,
                            SUM(total_tokens_input + total_tokens_output) as total_tokens,
                            COUNT(DISTINCT run_id) as unique_runs
                        FROM orchestration_run_aggregates
                        WHERE datetime(created_at) >= datetime(?)
                          AND datetime(created_at) <= datetime(?)
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    row = cursor.fetchone()
                    if row and row['run_count'] > 0:
                        stats['total_events'] = row['run_count'] or 0
                        stats['by_event_type']['OrchestrationRun.Completed'] = row['run_count'] or 0
                        
                        # Add cost summary to metadata (not breaking schema)
                        if row['total_cost'] is not None:
                            stats['by_event_type']['OrchestrationRun.TotalCost'] = float(row['total_cost'])
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query run_aggregates: {e}")
            
            # Query quality metrics if table exists (migration 6)
            if 'run_quality_metrics' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            COUNT(*) as total_runs,
                            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_runs,
                            AVG(quality_score) as avg_quality
                        FROM run_quality_metrics
                        WHERE datetime(created_at) >= datetime(?)
                          AND datetime(created_at) <= datetime(?)
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    row = cursor.fetchone()
                    if row and row['total_runs'] > 0:
                        stats['by_event_type']['QualityMetrics.Total'] = row['total_runs'] or 0
                        stats['by_event_type']['QualityMetrics.Successful'] = row['successful_runs'] or 0
                        
                        failed_runs = (row['total_runs'] or 0) - (row['successful_runs'] or 0)
                        if failed_runs > 0:
                            stats['by_event_type']['QualityMetrics.Failed'] = failed_runs
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query quality_metrics: {e}")
            
            # Query cost metrics for daily breakdown if table exists (migration 4)
            if 'orchestration_cost_metrics' in available_tables:
                try:
                    cursor.execute("""
                        SELECT 
                            DATE(timestamp) as day,
                            COUNT(*) as call_count,
                            SUM(cost_usd) as daily_cost
                        FROM orchestration_cost_metrics
                        WHERE datetime(timestamp) >= datetime(?)
                          AND datetime(timestamp) <= datetime(?)
                        GROUP BY DATE(timestamp)
                        ORDER BY day ASC
                    """, (start_date.isoformat(), end_date.isoformat()))
                    
                    for row in cursor.fetchall():
                        day = row['day']
                        count = row['call_count'] or 0
                        if day:
                            stats['by_day'][day] = count
                            stats['total_events'] += count
                
                except sqlite3.OperationalError as e:
                    logger.warning(f"Failed to query cost_metrics: {e}")
            
            # Fallback: Try reading JSONL telemetry files if no database data
            if stats['total_events'] == 0:
                try:
                    telemetry_dir = ROOT_DIR / "artifacts" / "telemetry"
                    if telemetry_dir.exists():
                        # Read JSONL files for the date range
                        for jsonl_file in telemetry_dir.glob("telemetry_*.jsonl"):
                            try:
                                with open(jsonl_file, 'r', encoding='utf-8') as f:
                                    for line in f:
                                        if not line.strip():
                                            continue
                                        try:
                                            event = json.loads(line)
                                            event_time = datetime.datetime.fromisoformat(
                                                event.get('timestamp', '').replace('Z', '+00:00')
                                            )
                                            
                                            if start_date <= event_time <= end_date:
                                                stats['total_events'] += 1
                                                
                                                # Count by event type
                                                event_type = event.get('eventType', 'Unknown')
                                                stats['by_event_type'][event_type] = \
                                                    stats['by_event_type'].get(event_type, 0) + 1
                                                
                                                # Count by source
                                                source = event.get('source', 'Unknown')
                                                stats['by_source'][source] = \
                                                    stats['by_source'].get(source, 0) + 1
                                                
                                                # Count by day
                                                day = event_time.strftime('%Y-%m-%d')
                                                stats['by_day'][day] = stats['by_day'].get(day, 0) + 1
                                        
                                        except (json.JSONDecodeError, ValueError, KeyError) as e:
                                            # Skip malformed events
                                            logger.debug(f"Skipping malformed event: {e}")
                                            continue
                            
                            except Exception as e:
                                logger.warning(f"Failed to read telemetry file {jsonl_file}: {e}")
                                continue
                
                except Exception as e:
                    logger.warning(f"Failed to read JSONL telemetry files: {e}")
        
        # Ensure all values are JSON-safe (no None, Decimal, etc.)
        stats['total_events'] = int(stats['total_events'] or 0)
        
        return stats
        
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Telemetry stats endpoint error: {e}", exc_info=True)
        
        # Return safe fallback response instead of raising
        return {
            "total_events": 0,
            "period_days": days,
            "start_date": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat().replace("+00:00", "Z"),
            "end_date": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "by_event_type": {},
            "by_source": {},
            "by_day": {}
        }

@app.get("/prompts")
def list_prompt_payloads():
    """
    Return the union of canonical registry prompts and any synced overrides.

    Synced payloads (from the React editor) override registry entries with the
    same id and introduce additional drafts for local development.
    """
    registry_payloads = load_registry_payloads()
    synced_payloads = load_synced_payloads()

    if not registry_payloads:
        return synced_payloads
    if not synced_payloads:
        return registry_payloads

    overrides = {payload.get("id"): payload for payload in synced_payloads if payload.get("id")}
    merged: List[Dict[str, Any]] = []

    for payload in registry_payloads:
        prompt_id = payload.get("id")
        if prompt_id and prompt_id in overrides:
            merged.append(overrides.pop(prompt_id))
        else:
            merged.append(payload)

    # Append new prompts that exist only in the synced cache
    merged.extend(overrides.values())
    return merged


@app.get("/prompts/search", response_model=SearchPromptsResponse)
def search_prompts(
    q: Optional[str] = Query(None, description="Full-text search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    owner: Optional[str] = Query(None, description="Filter by owner"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter"),
    limit: int = Query(10, ge=1, le=100, description="Number of results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """
    Search prompts using SQLite FTS5 when available; fallback to in-memory template search.
    """
    prompts_db = ROOT_DIR / "data" / "prompts.db"

    # FTS / DB-backed search
    if prompts_db.exists():
        try:
            with sqlite3.connect(prompts_db) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_clauses = []
                params = {}

                if q:
                    # Prefer FTS if available
                    try:
                        fts_query = """
                            SELECT p.id, p.title, p.version, p.category, p.owner, p.tags, 
                                   p.description, p.updated_utc, rank AS relevance
                            FROM prompts p
                            JOIN prompts_fts fts ON p.rowid = fts.rowid
                            WHERE prompts_fts MATCH :query
                        """
                        params[":query"] = q

                        if category:
                            where_clauses.append("p.category = :category")
                            params[":category"] = category
                        if owner:
                            where_clauses.append("p.owner = :owner")
                            params[":owner"] = owner
                        if tags:
                            tag_list = [t.strip() for t in tags.split(",")]
                            tag_conditions = [f"p.tags LIKE :tag{i}" for i in range(len(tag_list))]
                            where_clauses.append(f"({' OR '.join(tag_conditions)})")
                            for i, tag in enumerate(tag_list):
                                params[f":tag{i}"] = f"%{tag}%"

                        if where_clauses:
                            fts_query += " AND " + " AND ".join(where_clauses)
                        fts_query += " ORDER BY rank LIMIT :limit OFFSET :offset"
                        params[":limit"] = limit
                        params[":offset"] = offset
                        cursor.execute(fts_query, params)
                    except sqlite3.OperationalError:
                        # FTS missing -> fallback to LIKE
                        fallback = """
                            SELECT id, title, version, category, owner, tags, description, updated_utc
                            FROM prompts
                            WHERE (title LIKE :query OR description LIKE :query OR tags LIKE :query)
                        """
                        params[":query"] = f"%{q}%"
                        if category:
                            fallback += " AND category = :category"
                            params[":category"] = category
                        if owner:
                            fallback += " AND owner = :owner"
                            params[":owner"] = owner
                        if tags:
                            tag_list = [t.strip() for t in tags.split(",")]
                            tag_conditions = [f"tags LIKE :tag{i}" for i in range(len(tag_list))]
                            fallback += f" AND ({' OR '.join(tag_conditions)})"
                            for i, tag in enumerate(tag_list):
                                params[f":tag{i}"] = f"%{tag}%"
                        fallback += " ORDER BY updated_utc DESC LIMIT :limit OFFSET :offset"
                        params[":limit"] = limit
                        params[":offset"] = offset
                        cursor.execute(fallback, params)
                else:
                    filter_query = """
                        SELECT id, title, version, category, owner, tags, description, updated_utc
                        FROM prompts
                    """
                    if category:
                        where_clauses.append("category = :category")
                        params[":category"] = category
                    if owner:
                        where_clauses.append("owner = :owner")
                        params[":owner"] = owner
                    if tags:
                        tag_list = [t.strip() for t in tags.split(",")]
                        tag_conditions = [f"tags LIKE :tag{i}" for i in range(len(tag_list))]
                        where_clauses.append(f"({' OR '.join(tag_conditions)})")
                        for i, tag in enumerate(tag_list):
                            params[f":tag{i}"] = f"%{tag}%"
                    if where_clauses:
                        filter_query += " WHERE " + " AND ".join(where_clauses)
                    filter_query += " ORDER BY updated_utc DESC LIMIT :limit OFFSET :offset"
                    params[":limit"] = limit
                    params[":offset"] = offset
                    cursor.execute(filter_query, params)

                rows = cursor.fetchall()
                results: List[PromptSearchResult] = []
                for row in rows:
                    tags_list: List[str] = []
                    if row["tags"]:
                        try:
                            tags_list = json.loads(row["tags"])
                        except (json.JSONDecodeError, TypeError) as e:
                            # If tags are malformed, use empty list - non-critical for search results
                            logger.debug(f"Failed to parse tags for prompt {row.get('id', 'unknown')}: {e}")
                    results.append(
                        PromptSearchResult(
                            id=row["id"],
                            title=row["title"],
                            version=row["version"],
                            category=row["category"] or None,
                            owner=row["owner"] or None,
                            tags=tags_list if isinstance(tags_list, list) else [],
                            description=row["description"] or None,
                            updated=row["updated_utc"],
                            relevance=row["relevance"] if "relevance" in row.keys() else None,
                        )
                    )
                return SearchPromptsResponse(
                    results=results,
                    total=len(results),
                    query=q,
                    filters={
                        "category": category,
                        "owner": owner,
                        "tags": tags.split(",") if tags else []
                    }
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")

    # Fallback: search loaded templates in-memory (registry + synced)
    templates = read_templates()
    q_lower = (q or "").strip().lower()
    results = []
    for tpl_id, payload in templates.items():
        title = payload.get("title", "") or tpl_id
        cat_val = payload.get("category", "") or ""
        desc = payload.get("description", "") or ""
        ctx = payload.get("context", "") or ""
        tag_list = payload.get("telemetry", {}).get("tags", []) if isinstance(payload.get("telemetry"), dict) else payload.get("tags", [])
        haystacks = [tpl_id, title, cat_val, desc, ctx, " ".join(tag_list) if tag_list else ""]
        if q_lower and not any(q_lower in (h or "").lower() for h in haystacks):
            continue
        if category and cat_val != category:
            continue
        results.append(
            PromptSearchResult(
                id=tpl_id,
                title=title,
                version=payload.get("version") or "",
                category=cat_val or None,
                owner=None,
                tags=tag_list if isinstance(tag_list, list) else [],
                description=desc or None,
                updated=payload.get("updatedAt") or payload.get("createdAt") or now_iso(),
                relevance=None,
            )
        )
    # naive relevance: sort by updated desc
    results = sorted(results, key=lambda r: r.updated or "", reverse=True)
    paged = results[offset: offset + limit]
    return SearchPromptsResponse(
        results=paged,
        total=len(results),
        query=q,
        filters={
            "category": category,
            "owner": owner,
            "tags": tags.split(",") if tags else []
        }
    )


@app.get("/prompts/{prompt_id}")
def get_prompt(prompt_id: str):
    spec = _get_prompt_or_404(prompt_id, allow_synced=True)
    return spec.to_ui_payload()

@app.post("/prompts/render", response_model=RenderResponse)
def render_prompt(req: RenderRequest):
    try:
        spec = _get_prompt_or_404(req.prompt_id, allow_synced=True)
        rendered = render_blocks(spec, req.variables)
        METRICS["renders_total"] += 1
        return RenderResponse(prompt=spec.to_ui_payload(), rendered_blocks=rendered)
    except HTTPException:
        METRICS["render_errors"] += 1
        raise

@app.post("/refiner/run", response_model=RefinerRunResponse)
def queue_refiner(req: RefinerRunRequest):
    try:
        spec = _get_prompt_or_404(req.prompt_id)
        review_policy = (spec.raw.get("integrations") or {}).get("orchestration", {}).get("review_policy", "manual")
        manifest = _write_manifest(spec, review_policy)
        if req.invoke_refiner:
            _invoke_power_shell_refiner(spec, manifest, req.dry_run)
        METRICS["refiner_runs"] += 1
        return RefinerRunResponse(
            prompt_id=spec.id,
            manifest=str(manifest),
            refiner_invoked=req.invoke_refiner,
            dry_run=req.dry_run,
            reviewers=req.reviewers,
            notes=req.notes,
        )
    except HTTPException:
        METRICS["refiner_errors"] += 1
        raise


@app.post("/prompts/{prompt_id}/refine")
def refine_single_prompt(prompt_id: str):
    """Refine a single prompt using AIRefiner"""
    try:
        req = RefinerRunRequest(prompt_id=prompt_id, invoke_refiner=True, dry_run=False)
        result = queue_refiner(req)
        return {"status": "success", "prompt_id": prompt_id, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/prompts/refine-bulk")
def refine_bulk_prompts(request: Dict[str, Any]):
    """Refine multiple prompts using AIRefiner"""
    prompt_ids = request.get("prompt_ids", [])
    if not prompt_ids:
        raise HTTPException(status_code=400, detail="No prompt_ids provided")
    
    results = []
    for prompt_id in prompt_ids:
        try:
            req = RefinerRunRequest(prompt_id=prompt_id, invoke_refiner=True, dry_run=False)
            result = queue_refiner(req)
            results.append({"prompt_id": prompt_id, "status": "success", "result": result})
        except Exception as e:
            results.append({"prompt_id": prompt_id, "status": "error", "error": str(e)})
    
    return {"status": "completed", "results": results}


@app.get("/prompts/{prompt_id}/reviews")
def get_prompt_reviews(prompt_id: str):
    """Get review history for a prompt"""
    spec = _get_prompt_or_404(prompt_id)
    reviews = (spec.raw.get("integrations") or {}).get("orchestration", {}).get("reviews", [])
    return {"prompt_id": spec.id, "reviews": reviews}


@app.post("/prompts/{prompt_id}/reviews")
def record_prompt_review(prompt_id: str, req: ReviewRecordRequest):
    spec = _get_prompt_or_404(prompt_id)
    entry = {
        "timestamp": req.timestamp or now_iso(),
        "status": req.status,
        "reviewers": req.reviewers,
        "notes": req.notes,
        "manifest": req.manifest,
        "runbook": req.runbook,
    }
    entry = {k: v for k, v in entry.items() if v is not None}
    _append_review_run(spec, entry)
    METRICS["review_records"] += 1
    return {"prompt_id": spec.id, "run": entry}

@app.get("/metrics")
def metrics():
    return {
        **METRICS,
        "refiner_queue_depth": _refiner_queue_depth(),
    }

@app.post("/prompts:sync")
def sync_prompt_payloads(
    request: PromptSyncRequest,
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    _validate_prompt_sync_payload(request.prompts)
    save_synced_payloads(request.prompts)
    return {"status": "ok", "count": len(request.prompts)}


@app.get("/agents")
def list_agents():
    return load_synced_agents()


@app.post("/agents:sync")
def sync_agents(
    request: AgentSyncRequest,
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    _validate_agent_payload(request.agents)
    save_synced_agents(request.agents)
    return {"status": "ok", "count": len(request.agents)}


@app.post("/orchestrator/tasks")
def ingest_orchestrator_task(task: OrchestratorTask):
    payload = {
        "id": task.supervisor.get("id") or f"task-{datetime.datetime.now(datetime.timezone.utc).timestamp()}",
        "supervisor": task.supervisor,
        "agents": task.agents,
        "prompts": task.prompts,
        "received_at": now_iso(),
        "status": task.supervisor.get("status") or "queued",
    }
    append_task_queue(payload)
    return {"status": "queued", "task_id": payload["id"]}


@app.get("/orchestrator/tasks")
def list_orchestrator_tasks():
    return load_task_queue()


class OrchestratorTaskUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


@app.patch("/orchestrator/tasks/{task_id}")
def update_orchestrator_task(task_id: str, update: OrchestratorTaskUpdate):
    updates: Dict[str, Any] = {}
    if update.status:
        updates["status"] = update.status
    if update.notes is not None:
        updates["notes"] = update.notes
    updates["updated_at"] = now_iso()
    task = update_task_queue(task_id, updates)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "updated", "task": task}
@app.get("/api/templates")
def list_templates():
    return {"templates": list(read_templates().keys())}

@app.get("/api/audit")
def list_audit(limit: int = 50):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT id, template_id, model, created_at, status, cached FROM audit ORDER BY id DESC LIMIT ?", (limit,))
        rows = c.fetchall()
    items = [{"id": r[0], "template_id": r[1], "model": r[2], "created_at": r[3], "status": r[4], "cached": bool(r[5])} for r in rows]
    return {"items": items}
@app.get("/", include_in_schema=False)
def root():
    """Landing page with quick links."""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>AI Prompt Workbench</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 2em; }
            h1 { color: #2c3e50; }
            ul { line-height: 1.6; }
            a { color: #2980b9; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>AI Prompt Workbench</h1>
        <p>Welcome! Quick links:</p>
        <ul>
            <li><a href="/health">Health Check</a></li>
            <li><a href="/api/templates">Templates API</a></li>
            <li><a href="/api/audit">Audit API</a></li>
            <li><a href="/docs">Swagger UI (Interactive Docs)</a></li>
            <li><a href="/redoc">ReDoc API Docs</a></li>
        </ul>
    </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=200)
from fastapi import Body

def _write_yaml(path: pathlib.Path, data: dict):
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")

@app.post("/api/templates/install-defaults")
def install_default_templates(overwrite: bool = False):
    """Create a couple of example templates under ./templates."""
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

    examples = [
        {
            "file": TEMPLATE_DIR / "agent_webrtc_disconnect_v1.0.0.yaml",
            "data": {
                "id": "agent_webrtc_disconnect_v1.0.0",
                "system": (
                    "You are {role}. Be concise, actionable, and accurate for Genesys Cloud ops. "
                    "Assume logs may be partial; ask for missing signals only if critical."
                ),
                "few_shot": [
                    {
                        "input": "Task: Diagnose WebRTC disconnect spike around 14:00Z; InputData: {\"log_snippet\":\"ICE failures; TURN timeouts\"}",
                        "output": json.dumps({
                            "executive_summary": [
                                "Spike at 14:00Z linked to ICE/TURN failures",
                                "Likely regional egress network degradation",
                                "Impact contained to ~12% WebRTC sessions"
                            ],
                            "technical_json": {
                                "probable_cause": "ISP packet loss impacting STUN/TURN; elevated RTT",
                                "recommended_action": "Validate TURN reachability; compare MOS pre/post; apply QoS rules; notify NOC"
                            },
                            "chart_recommendations": [
                                {"type":"line","metric":"webrtc_disconnects","granularity":"5m"},
                                {"type":"heatmap","metric":"mos_agent_leg<=3.5","granularity":"hour"}
                            ]
                        })
                    }
                ]
            }
        },
        {
            "file": TEMPLATE_DIR / "volume_anomaly_summary_v1.0.0.yaml",
            "data": {
                "id": "volume_anomaly_summary_v1.0.0",
                "system": (
                    "You are {role}. Produce crisp incident-ready summaries for contact volume anomalies. "
                    "Prefer bullet points and concrete next steps."
                ),
                "few_shot": [
                    {
                        "input": "Task: Summarize inbound spike vs forecast; InputData: {\"timestamp\":\"2025-08-18T12:00:00Z\"}",
                        "output": json.dumps({
                            "executive_summary": [
                                "Inbound volume +28% vs forecast (10:00–12:00 local)",
                                "AHT flat; SLA dipped 5 pts; staffing shortfall main driver"
                            ],
                            "technical_json": {
                                "probable_cause": "Marketing push not reflected in forecast + partial IVR outage",
                                "recommended_action": "Engage WFM for surge staffing; update forecast; validate IVR path latency"
                            },
                            "chart_recommendations": [
                                {"type":"line","metric":"inbound_offered_vs_forecast","granularity":"15m"},
                                {"type":"bar","metric":"abandon_rate_by_queue","granularity":"hour"}
                            ]
                        })
                    }
                ]
            }
        }
    ]

    created, skipped = [], []
    for ex in examples:
        p = ex["file"]
        if p.exists() and not overwrite:
            skipped.append(p.name)
            continue
        _write_yaml(p, ex["data"])
        created.append(p.name)

    return {"created": created, "skipped": skipped, "dir": str(TEMPLATE_DIR)}
@app.post("/api/templates/reload")
def reload_templates():
    """Force re-read of template files (stateless, but useful for debugging)."""
    t = read_templates()
    return {"count": len(t), "ids": list(t.keys())}

@app.get("/api/templates/{template_id}")
def get_template(template_id: str = Path(..., description="Template id (matches YAML 'id')")):
    """Return the parsed YAML/JSON for a single template."""
    t = read_templates()
    if template_id not in t:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    return t[template_id]


@app.post("/api/generate/dry-run")
def generate_dry_run(req: RequestPayload):
    """
    Build the final messages but do NOT call OpenAI.
    Useful to verify substitutions and output contract before billing tokens.
    """
    tpl, _ = _resolve_template_payload(req.template_id)
    messages = build_messages(tpl, req)
    return {"model": req.model or DEFAULT_MODEL, "messages": messages}
@app.get("/audit", include_in_schema=False)
def audit_htm(limit: int = Query(100, ge=1, le=500)):
    # Simple, zero-dependency HTML to eyeball recent runs
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        SELECT id, created_at, template_id, model, status, cached, 
               IFNULL(token_prompt,0), IFNULL(token_completion,0)
        FROM audit ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = c.fetchall()

    rows_html = "\n".join(
        f"<tr><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>"
        f"<td>{r[4]}</td><td>{'yes' if r[5] else 'no'}</td><td>{r[6]}</td><td>{r[7]}</td></tr>"
        for r in rows
    )
    html = f"""
    <html><head><title>Audit - AI Prompt Workbench</title>
    <style>
    body {{ font-family: Arial, sans-serif; margin: 1.5rem; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ddd; padding: .5rem; }}
    th {{ background: #f7f7f7; text-align: left; }}
    </style></head>
    <body>
      <h1>Audit (latest {limit})</h1>
      <p><a href="/docs">/docs</a> · <a href="/api/templates">/api/templates</a> · <a href="/health">/health</a></p>
      <table>
        <thead><tr><th>Id</th><th>Time</th><th>Template</th><th>Model</th><th>Status</th><th>Cached</th><th>PromptTok</th><th>CompTok</th></tr></thead>
        <tbody>{rows_html}</tbody>
      </table>
    </body></html>
    """
    return HTMLResponse(html)

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Return empty response to silence browser favicon requests."""
    return Response(status_code=204, media_type="image/x-icon")

@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: RequestPayload):
    tpl, _ = _resolve_template_payload(req.template_id)

    model = req.model or DEFAULT_MODEL
    payload_for_hash = {
        "template_id": req.template_id,
        "role": req.role,
        "task": req.task,
        "context": req.context,
        "input_data": req.input_data.model_dump(),
        "desired_output": req.desired_output,
        "modes": req.modes,
        "model": model,
        "tpl_version": tpl.get("version") or tpl.get("id", "")
    }
    cache_key = hash_payload(req.template_id, model, payload_for_hash)

    # Try cache first
    cached_output = cache_get(cache_key)
    input_json = normalize(payload_for_hash)

    if cached_output:
        audit_id = audit_log(
            req.template_id, model, input_json, cached_output, True, "ok", None, None,
            run_id=None, agent_name=None
        )
        return GenerateResponse(
            cached=True,
            cache_key=cache_key,
            template_id=req.template_id,
            model=model,
            output=cached_output,
            audit_id=audit_id
        )

    # Build messages & call provider
    messages = build_messages(tpl, req)
    try:
        output, usage = call_provider_chat(model, messages)
        # Cache + audit
        cache_put(cache_key, req.template_id, model, input_json, output)
        audit_id = audit_log(
            req.template_id, model, input_json, output, False, "ok",
            usage.get("prompt_tokens"), usage.get("completion_tokens"),
            run_id=None, agent_name=None
        )
        return GenerateResponse(
            cached=False,
            cache_key=cache_key,
            template_id=req.template_id,
            model=model,
            output=output,
            audit_id=audit_id
        )
    except HTTPException as e:
        audit_id = audit_log(
            req.template_id, model, input_json, None, False, f"error:{e.detail}", None, None,
            run_id=None, agent_name=None
        )
        raise e


# ----------------------------
# Cost Tracking Endpoints
# ----------------------------
from cost_tracker import CostTracker

cost_tracker = CostTracker(DB_PATH)


class CostSummaryResponse(BaseModel):
    """Response model for cost summaries."""
    total_cost: float
    period_days: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    provider: Optional[str] = None


class CostBreakdownResponse(BaseModel):
    """Response model for cost breakdowns."""
    by_provider: List[Dict[str, Any]]
    by_model: List[Dict[str, Any]]
    daily: List[Dict[str, Any]]


class BudgetStatusResponse(BaseModel):
    """Response model for budget status."""
    budget_amount: float
    period_days: int
    current_cost: float
    remaining: float
    percentage_used: float
    status: str
    provider: Optional[str] = None


@app.get("/admin/costs/summary", response_model=CostSummaryResponse)
def get_cost_summary(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Get total cost summary for a time period."""
    _require_admin_access(admin_token)
    
    total_cost = cost_tracker.get_total_cost(
        start_date=start_date,
        end_date=end_date,
        provider=provider,
        user_id=user_id
    )
    
    return CostSummaryResponse(
        total_cost=total_cost,
        start_date=start_date,
        end_date=end_date,
        provider=provider
    )


@app.get("/admin/costs/breakdown", response_model=CostBreakdownResponse)
def get_cost_breakdown(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    days: int = Query(30, description="Number of days for daily breakdown"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Get detailed cost breakdown by provider, model, and day."""
    _require_admin_access(admin_token)
    
    by_provider = cost_tracker.get_cost_by_provider(
        start_date=start_date,
        end_date=end_date
    )
    
    by_model = cost_tracker.get_cost_by_model(
        start_date=start_date,
        end_date=end_date,
        provider=provider
    )
    
    daily = cost_tracker.get_daily_costs(
        days=days,
        provider=provider
    )
    
    return CostBreakdownResponse(
        by_provider=by_provider,
        by_model=by_model,
        daily=daily
    )


@app.get("/admin/costs/budget", response_model=BudgetStatusResponse)
def check_budget_status(
    budget_amount: float = Query(..., description="Budget amount in USD"),
    period_days: int = Query(30, description="Budget period in days"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """Check if costs are within budget."""
    _require_admin_access(admin_token)
    
    budget_status = cost_tracker.check_budget(
        budget_amount=budget_amount,
        period_days=period_days,
        provider=provider
    )
    
    return BudgetStatusResponse(**budget_status)


@app.get("/admin/costs/by-run")
def get_costs_by_run(
    run_id: Optional[str] = Query(None, description="Filter by specific run ID"),
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get cost breakdown by orchestration run.
    Shows token usage and costs attributed to each run.
    """
    _require_admin_access(admin_token)
    
    return cost_tracker.get_cost_by_run(
        run_id=run_id,
        start_date=start_date,
        end_date=end_date
    )


# ----------------------------
# Environmental Impact Metrics Endpoints
# ----------------------------
from routes_cost_metrics import (
    get_metrics_summary, get_runs_metrics, get_models_metrics, get_prometheus_metrics,
    MetricsSummaryResponse, RunMetricsResponse, ModelMetricsResponse
)


@app.get("/metrics/cost/summary", response_model=MetricsSummaryResponse)
def metrics_cost_summary(
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    project: Optional[str] = Query(None, description="Filter by project name"),
    app: Optional[str] = Query(None, description="Filter by app name"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get comprehensive summary of cost and environmental impact metrics.
    
    Returns:
    - Total cost, energy (kWh), and water usage (liters)
    - Top models and agents by cost
    - Daily timeseries data
    """
    _require_admin_access(admin_token)
    return get_metrics_summary(
        db_path=DB_PATH,
        start_date=start_date,
        end_date=end_date,
        project=project,
        app=app,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/cost/runs", response_model=RunMetricsResponse)
def metrics_cost_runs(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    model: Optional[str] = Query(None, description="Filter by model"),
    agent: Optional[str] = Query(None, description="Filter by agent"),
    app: Optional[str] = Query(None, description="Filter by app"),
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get paginated list of orchestration runs with cost and environmental metrics.
    
    Supports filtering by:
    - Model name
    - Agent name
    - App name
    - Date range
    """
    _require_admin_access(admin_token)
    return get_runs_metrics(
        db_path=DB_PATH,
        page=page,
        per_page=per_page,
        model=model,
        agent=agent,
        app=app,
        start_date=start_date,
        end_date=end_date,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/cost/models", response_model=ModelMetricsResponse)
def metrics_cost_models(
    start_date: Optional[str] = Query(None, description="Start date (ISO 8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO 8601)"),
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Get aggregated cost and environmental metrics by model.
    
    Returns per-model aggregates including:
    - Total tokens, cost, energy, and water
    - Average cost per call
    - Number of calls and runs
    """
    _require_admin_access(admin_token)
    return get_models_metrics(
        db_path=DB_PATH,
        start_date=start_date,
        end_date=end_date,
        admin_token=admin_token,
        settings=settings
    )


# Quality Metrics Endpoints
from routes_quality_metrics import (
    record_quality_rating, record_automated_test, get_run_quality,
    get_quality_summary as get_quality_summary_route, get_cost_quality_efficiency as get_efficiency_route,
    get_runs_with_quality,
    QualityRatingRequest, AutomatedTestRequest, QualityMetricsResponse,
    QualitySummaryResponse, CostQualityEfficiencyResponse
)


@app.post("/metrics/quality/runs/{run_id}/rating")
def quality_rating(
    run_id: str,
    rating: QualityRatingRequest,
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Submit a human quality rating for a run.
    
    Records success status, quality score, notes, and whether manual fixes were needed.
    This endpoint is designed for web UI integration to capture human feedback.
    """
    _require_admin_access(admin_token)
    return record_quality_rating(
        db_path=DB_PATH,
        run_id=run_id,
        rating=rating,
        admin_token=admin_token,
        settings=settings
    )


@app.post("/metrics/quality/runs/{run_id}/automated")
def automated_test(
    run_id: str,
    test_result: AutomatedTestRequest,
    admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Record automated test results for a run.
    
    Captures boolean success status and numeric test scores from automated test suites.
    Use this when runs are part of a test suite that can programmatically assess quality.
    """
    _require_admin_access(admin_token)
    return record_automated_test(
        db_path=DB_PATH,
        run_id=run_id,
        test_result=test_result,
        admin_token=admin_token,
        settings=settings
    )


@app.get("/metrics/quality/runs/{run_id}", response_model=QualityMetricsResponse)
def quality_metrics_for_run(run_id: str):
    """
    Get quality metrics for a specific run.
    
    Returns all quality data including success status, scores, and ratings.
    """
    result = get_run_quality(db_path=DB_PATH, run_id=run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Quality metrics not found for run {run_id}")
    return result


@app.get("/metrics/quality/summary", response_model=QualitySummaryResponse)
def quality_summary(
    strategy: Optional[str] = Query(None, description="Filter by strategy"),
    min_quality_score: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum quality score"),
    success_only: bool = Query(False, description="Only include successful runs")
):
    """
    Get summary statistics for quality metrics.
    
    Returns:
    - Overall success rate and average quality
    - Breakdown by strategy
    - Breakdown by model
    - Number of runs requiring manual fixes
    """
    return get_quality_summary_route(
        db_path=DB_PATH,
        strategy=strategy,
        min_quality_score=min_quality_score,
        success_only=success_only
    )


@app.get("/metrics/quality/efficiency", response_model=CostQualityEfficiencyResponse)
def cost_quality_efficiency(
    quality_threshold: float = Query(0.7, ge=0.0, le=1.0, description="Quality threshold for 'high-quality' runs")
):
    """
    Get cost efficiency metrics based on quality outcomes.
    
    Computes:
    - Cost per successful run
    - Cost per high-quality run (quality >= threshold)
    - Quality-adjusted cost index (lower is better)
    
    This endpoint helps identify which strategies and models provide
    the best value by balancing cost with outcome quality.
    """
    return get_efficiency_route(
        db_path=DB_PATH,
        quality_threshold=quality_threshold
    )


@app.get("/metrics/quality/runs")
def runs_with_quality(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    strategy: Optional[str] = Query(None, description="Filter by strategy"),
    min_quality: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum quality score"),
    success_only: bool = Query(False, description="Only successful runs")
):
    """
    Get paginated list of runs with both cost and quality metrics.
    
    Joins cost data with quality data to provide a complete view of run efficiency.
    Includes computed cost_efficiency metric (cost / quality).
    """
    return get_runs_with_quality(
        db_path=DB_PATH,
        page=page,
        per_page=per_page,
        strategy=strategy,
        min_quality=min_quality,
        success_only=success_only
    )


@app.get("/metrics/cost/prometheus", response_class=Response)
def metrics_cost_prometheus():
    """
    Export metrics in Prometheus text format for scraping.
    
    Metrics include:
    - unified_ai_cost_usd_total
    - unified_ai_energy_kwh_total
    - unified_ai_water_liters_total
    - unified_ai_tokens_total
    """
    metrics_text = get_prometheus_metrics(DB_PATH)
    return Response(
        content=metrics_text,
        media_type="text/plain; version=0.0.4"
    )


# ----------------------------
# GitHub Integration
# ----------------------------

# Initialize GitHub cloner (lazy initialization)
_github_cloner = None

def get_github_cloner():
    """Get or initialize the GitHub cloner."""
    global _github_cloner
    if _github_cloner is None:
        github_token = os.environ.get("GITHUB_TOKEN")
        _github_cloner = GitHubCloner(token=github_token)
    return _github_cloner


class GitHubCloner:
    """Placeholder for GitHub cloner - import from orchestration-bridge."""
    pass


# Try to import GitHub cloner from orchestration-bridge
try:
    orchestration_bridge_path = ROOT_DIR / "apps" / "orchestration-bridge"
    if orchestration_bridge_path not in sys.path:
        sys.path.insert(0, str(orchestration_bridge_path))
    from github.clone import GitHubCloner, CloneStatus  # type: ignore
except ImportError:
    # Fallback if module not available
    class GitHubCloner:  # type: ignore
        def __init__(self, token=None, base_clone_dir=None):
            pass
        def search_repositories(self, query, max_results=30):
            return []
        def get_repository_info(self, owner, repo_name):
            return {}
        def clone_repository(self, repo_url, branch=None, depth=None):
            return "mock_id"
        def get_progress(self, clone_id):
            return None


class GitHubSearchRequest(BaseModel):
    """Request model for GitHub repository search."""
    query: str = Field(..., description="Search query")
    max_results: int = Field(30, description="Maximum results", ge=1, le=100)


class GitHubRepoInfo(BaseModel):
    """Repository information model."""
    full_name: str
    name: str
    owner: str
    description: Optional[str]
    url: str
    clone_url: str
    stars: int
    forks: int
    language: Optional[str]
    size_kb: int
    updated_at: Optional[str]
    default_branch: str
    branches: Optional[List[str]] = None
    topics: Optional[List[str]] = None
    license: Optional[str] = None


class CloneRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL")
    branch: Optional[str] = Field(None, description="Branch to clone")

# ----------------------------
# Orchestration Bridge Imports
# ----------------------------
_orchestration_bridge_path = ROOT_DIR / "apps" / "orchestration-bridge"
if _orchestration_bridge_path not in sys.path:
    sys.path.insert(0, str(_orchestration_bridge_path))

try:
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError  # type: ignore
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError  # type: ignore
    from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError  # type: ignore
    from github_integration.task_executor import TaskExecutor, TaskExecutionError  # type: ignore
    from github_integration.merge_coordinator import MergeCoordinator, MergeCoordinatorError  # type: ignore
    from github_integration.pr_service import PRCreationError  # type: ignore
    from github_integration.codex_service import CodexSwarmService  # type: ignore
except Exception as orchestration_import_error:  # pragma: no cover - optional dependency
    GitHubCloneService = None  # type: ignore
    RepositoryCloneError = Exception  # type: ignore
    RepoIntakeService = None  # type: ignore
    RepoIntakeError = Exception  # type: ignore
    SupervisorPlanner = None  # type: ignore
    SupervisorPlannerError = Exception  # type: ignore
    TaskExecutor = None  # type: ignore
    TaskExecutionError = Exception  # type: ignore
    MergeCoordinator = None  # type: ignore
    MergeCoordinatorError = Exception  # type: ignore
    PRCreationError = Exception  # type: ignore
    CodexSwarmService = None  # type: ignore


# ----------------------------
# Orchestration Run Stub
# ----------------------------
class OrchestrationRequest(BaseModel):
    prompt_id: Optional[str] = None
    version: Optional[str] = None
    review_policy: Optional[str] = None
    status: Optional[str] = "queued"
    dataset_id: Optional[str] = None
    dataset_name: Optional[str] = None
    agents: Optional[List[str]] = None
    notes: Optional[str] = None
    goal: Optional[str] = None
    model: Optional[str] = None
    run_mode: Optional[str] = "default"  # default | codex-swarm | swarms
    repo_root: Optional[str] = None
    max_iterations: Optional[int] = None
    mcp_allowed_servers: List[str] = Field(default_factory=list)
    mcp_allowed_collections: List[str] = Field(default_factory=list)


def _create_run_allowlist_if_requested(run_id: str, req: OrchestrationRequest) -> Optional[str]:
    """Create a run-scoped MCP allowlist if requested by run creation payload."""
    if not MCP_ENFORCEMENT_IMPORTS_AVAILABLE or not mcp_storage:
        return None

    if not req.mcp_allowed_servers and not req.mcp_allowed_collections:
        return None

    allowlist_id = f"run-{run_id}-allowlist"
    existing = mcp_storage.get_allowlist(allowlist_id)
    if existing:
        return allowlist_id

    allowlist = Allowlist(
        allowlist_id=allowlist_id,
        scope=AllowlistScope.RUN,
        scope_id=run_id,
        allowed_servers=req.mcp_allowed_servers,
        allowed_collections=req.mcp_allowed_collections,
        created_by="system",
        metadata={"source": "orchestrate_run"},
    )
    mcp_storage.save_allowlist(allowlist)
    return allowlist_id


class RepoOrchestrationOptions(BaseModel):
    """Options for repository-first orchestration."""

    branch: Optional[str] = None
    base_branch: Optional[str] = None
    integration_branch: Optional[str] = None
    allowed_paths: List[str] = Field(default_factory=list)
    max_parallel: int = 3
    risk_posture: str = "standard"
    github_token: Optional[str] = Field(
        default=None, description="GitHub token (not persisted to disk)"
    )
    model: Optional[str] = None
    pr_title: Optional[str] = None
    pr_body: Optional[str] = None


class RepoOrchestrationRequest(BaseModel):
    """Request to orchestrate a repo workflow end-to-end."""

    repo: str = Field(..., description="Repository URL or owner/repo slug")
    goal: str = Field(..., description="Goal for the orchestration")
    options: RepoOrchestrationOptions = Field(default_factory=RepoOrchestrationOptions)


_repo_orchestration_state: Dict[str, Dict[str, Any]] = {}
_repo_state_lock = asyncio.Lock()
_mcp_middleware: Optional["OrchestrationMCPMiddleware"] = None


def get_orchestration_mcp_middleware() -> Optional["OrchestrationMCPMiddleware"]:
    """Lazy-initialize runtime MCP middleware for orchestration integrations."""
    global _mcp_middleware
    if not MCP_ENFORCEMENT_IMPORTS_AVAILABLE or OrchestrationMCPMiddleware is None:
        return None
    if _mcp_middleware is None:
        try:
            _mcp_middleware = OrchestrationMCPMiddleware.from_environment(
                audit_log_dir=str(ROOT_DIR / "data" / "audit")
            )
        except Exception as exc:
            logger.warning("Failed to initialize orchestration MCP middleware: %s", exc)
            return None
    return _mcp_middleware


@app.post("/orchestrate/run")
def orchestrate_run(
    req: OrchestrationRequest,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """
    Queue an orchestration run (lightweight orchestrator). Writes a manifest and kicks off a
    background task that executes the external orchestrator (Unified-Orchestration.ps1 by default), otherwise
    simulates a completion.
    """
    _require_execution_access(execution_token or admin_token)

    # Sanitize the raw run base to ensure it's safe for filesystem use on Windows
    raw_run_base = req.prompt_id or req.goal or "run"
    safe_run_base = sanitize_run_id(raw_run_base)
    run_id = f"{safe_run_base}.{now_iso().replace(':','-')}"
    out_dir = BRIDGE_RUN_DIR / run_id
    log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
    out_dir.mkdir(parents=True, exist_ok=True)

    allowlist_id = _create_run_allowlist_if_requested(run_id, req)
    middleware = get_orchestration_mcp_middleware()

    # Initialize orchestrator logger if available
    orch_logger = None
    if ORCHESTRATOR_LOGGING_AVAILABLE:
        try:
            artifacts_root = ROOT_DIR / "artifacts"
            orch_logger = OrchestratorLogger(artifacts_root, run_id=run_id)
            
            # Log run metadata
            prompt_library_hash = compute_prompt_hash(str(PROMPT_SYNC_FILE.read_text() if PROMPT_SYNC_FILE.exists() else ""))
            orch_logger.log_run_metadata(
                orchestrator_version="1.5.0",
                prompt_library_hash=prompt_library_hash,
                user_goal=req.goal or req.prompt_id or "Orchestration run",
                context_payload={
                    "prompt_id": req.prompt_id,
                    "model": req.model or DEFAULT_MODEL,
                    "run_mode": req.run_mode or "default",
                    "repo_root": req.repo_root or REPO_ROOT_DEFAULT,
                    "agents": req.agents or [],
                },
                definition_of_done=["Complete orchestration execution", "Generate artifacts", "Log final synthesis"],
            )
        except Exception as e:
            logger.warning(f"Failed to initialize orchestrator logger: {e}")
            orch_logger = None

    manifest = {
        "run_id": run_id,
        "prompt_id": req.prompt_id,
        "version": req.version or "latest",
        "review_policy": req.review_policy or "standard",
        "dataset_id": req.dataset_id,
        "dataset_name": req.dataset_name,
        "agents": req.agents or [],
        "notes": req.notes,
        "requested_at": now_iso(),
        "source": "api",
        "status": "queued",
        "goal": req.goal,
        "model": req.model or DEFAULT_MODEL,
        "run_mode": req.run_mode or "default",
        "mode": "simulated",
        "mcp_allowlist_id": allowlist_id,
        "mcp_allowed_servers": req.mcp_allowed_servers,
        "mcp_allowed_collections": req.mcp_allowed_collections,
        "mcp_enforcement_enabled": bool(getattr(middleware, "enabled", False)),
        "run_dir": str(out_dir),
        "log_path": str(log_path),
        "events": [
            {"ts": now_iso(), "type": "status", "message": "queued"},
        ],
        "scratchpad": [],
    }
    path = BRIDGE_RUN_DIR / f"{run_id}.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    def _update_manifest(update_fn):
        try:
            data = safe_json_load(path, default={}, context=f"update_manifest:{run_id}")
            data = update_fn(data) or data
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[orchestrate] Failed to update manifest {path}: {e}", file=sys.stderr)

    def _append_events(events: List[Dict[str, Any]]):
        def _inner(data):
            data.setdefault("events", [])
            data["events"].extend(events)
            return data
        _update_manifest(_inner)

    def _append_scratchpad(entries: List[Dict[str, Any]]):
        def _inner(data):
            data.setdefault("scratchpad", [])
            data["scratchpad"].extend(entries)
            return data
        _update_manifest(_inner)

    def _ingest_status_file(status_file: pathlib.Path, processed: int):
        if not status_file.exists():
            return processed
        try:
            lines = status_file.read_text(encoding="utf-8").splitlines()
        except Exception as e:
            print(f"[orchestrate] Failed to read status file {status_file}: {e}", file=sys.stderr)
            return processed
        if processed >= len(lines):
            return processed
        new_lines = lines[processed:]
        processed = len(lines)
        entries = []
        events = []
        for line_num, line in enumerate(new_lines, start=processed+1):
            if not line.strip():  # Skip empty lines
                continue
            try:
                rec = json.loads(line)
                entries.append(rec)
                events.append(
                    {
                        "ts": rec.get("timestamp") or now_iso(),
                        "type": f"agent:{rec.get('agent')}",
                        "message": rec.get("status") or "",
                    }
                )
                
                # Log agent step if orchestrator logger is available
                if orch_logger and rec.get("agent"):
                    try:
                        step_id = f"{run_id}_step_{processed + line_num}"
                        orch_logger.log_step(
                            step_id=step_id,
                            agent_id=rec.get("agent", "unknown"),
                            model=manifest.get("model", DEFAULT_MODEL),
                            prompt_text=rec.get("prompt", ""),
                            input_payload={"status": rec.get("status"), "timestamp": rec.get("timestamp")},
                            raw_output=rec.get("output", ""),
                            parsed_output=rec if isinstance(rec, dict) else None,
                            timing_ms=rec.get("duration_ms"),
                        )
                    except Exception as log_err:
                        logger.warning(f"Failed to log step: {log_err}")
                
            except json.JSONDecodeError as e:
                print(f"[orchestrate] Invalid JSON in {status_file} at line {line_num}: {e.msg} - Content: {line[:100]}", file=sys.stderr)
                continue
            except Exception as e:
                print(f"[orchestrate] Error processing line {line_num} in {status_file}: {e}", file=sys.stderr)
                continue
        if entries:
            _append_scratchpad(entries)
        if events:
            _append_events(events)
        return processed

    def _execute(path: pathlib.Path, manifest: Dict[str, Any]):
        nonlocal orch_logger
        start_time = time.time()
        try:
            data = safe_json_load(path, context=f"execute_start:{run_id}")
            data["status"] = "running"
            data["started_at"] = now_iso()
            data.setdefault("events", []).append({"ts": data["started_at"], "type": "status", "message": "running"})
            data["mode"] = "executed"
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")

            goal_text = manifest.get("goal") or manifest.get("prompt_id") or ""
            repo_root = req.repo_root or REPO_ROOT_DEFAULT
            ps_exe = shutil.which("pwsh") or shutil.which("powershell")

            # choose orchestrator script based on run_mode (default => unified orchestrator)
            run_mode = (req.run_mode or "default").lower()
            ps1_candidate = pathlib.Path(CODEX_SWARM_PS1 if run_mode == "codex-swarm" else ORCH_PS1)
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Resolved ORCH_PS1={ORCH_PS1}, POF_PS1={POF_PS1}",
            })
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Resolving orchestrator script: ROOT={ROOT_DIR}, candidate={ps1_candidate}, exists={ps1_candidate.exists()}, run_mode={run_mode}",
            })
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            env_snapshot = {
                "root": str(ROOT_DIR),
                "candidate": str(ps1_candidate),
                "exists": ps1_candidate.exists(),
                "cwd": str(ps1_candidate.parent),
                "pwsh_path": ps_exe,
                "run_mode": run_mode,
            }
            with open(log_path, "w", encoding="utf-8") as logf:
                logf.write(f"PRE-EXEC ENV: {json.dumps(env_snapshot)}\n")
            try:
                ps1 = ps1_candidate.resolve(strict=True)
            except FileNotFoundError:
                raise FileNotFoundError(f"Orchestrator script not found: {ps1_candidate.as_posix()}")

            status_file = out_dir / "agent_status.json"
            final_synthesis = out_dir / "Final_Synthesis.txt"
            processed_status = 0
            stop_event = threading.Event()

            def _poll_status():
                nonlocal processed_status
                while not stop_event.is_set():
                    processed_status = _ingest_status_file(status_file, processed_status)
                    stop_event.wait(1.0)

            poller = threading.Thread(target=_poll_status, daemon=True)
            poller.start()

            if not ps_exe:
                raise RuntimeError("PowerShell executable not found (pwsh or powershell)")

            data["events"].append({"ts": now_iso(), "type": "info", "message": f"Executing {ps1.name}"})
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            args = [ps_exe, "-NoLogo", "-File", str(ps1)]
            if run_mode in ("codex-swarm", "swarms"):
                args += [
                    "-RepoRoot",
                    repo_root,
                    "-Goal",
                    str(goal_text),
                    "-Model",
                    manifest.get("model") or DEFAULT_MODEL,
                    "-OutputDir",
                    str(out_dir),
                ]
            else:
                args += [
                    "-Goal", str(goal_text),
                    "-Model", manifest.get("model") or DEFAULT_MODEL,
                ]
                notes = manifest.get("notes")
                if notes:
                    args += ["-Instruction", notes]
                args += [
                    "-OutputDir", str(out_dir),
                ]
            data.setdefault("events", []).append({
                "ts": now_iso(),
                "type": "debug",
                "message": f"Prepared orchestration run with script {ps1} and args {args}",
            })
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            with open(log_path, "a", encoding="utf-8") as logf:
                logf.write(f"READY TO EXECUTE: {json.dumps({'script': str(ps1), 'args': args})}\n")
                subprocess.run(args, check=True, stdout=logf, stderr=logf)

            stop_event.set()
            poller.join(timeout=2.0)
            processed_status = _ingest_status_file(status_file, processed_status)

            # Try to populate final_synthesis from various sources
            final_synthesis_text = None
            
            # First try Final_Synthesis.txt (legacy location)
            if final_synthesis.exists():
                try:
                    final_synthesis_text = final_synthesis.read_text(encoding="utf-8")
                except Exception as e:
                    print(f"[orchestrate] Failed to read Final_Synthesis.txt: {e}", file=sys.stderr)
            
            # If not found, try orchestration-summary.json from run_dir
            if not final_synthesis_text:
                orchestration_summary = out_dir / "orchestration-summary.json"
                if orchestration_summary.exists():
                    try:
                        summary_data = safe_json_load(orchestration_summary, context=f"final_synthesis:{run_id}")
                        if summary_data is not None:
                            # Format the summary as readable text
                            summary_lines = [
                                f"Goal: {summary_data.get('Goal', 'N/A')}",
                                f"Status: {summary_data.get('Status', 'N/A')}",
                                f"Model: {summary_data.get('Model', 'N/A')}",
                                f"Duration: {summary_data.get('DurationSeconds', 'N/A')} seconds",
                                f"Milestones: {summary_data.get('CompletedMilestones', 0)}/{summary_data.get('MilestonesCount', 0)} completed",
                            ]
                            final_synthesis_text = "\n".join(summary_lines)
                    except Exception as e:
                        print(f"[orchestrate] Failed to read orchestration-summary.json: {e}", file=sys.stderr)
            
            # Update manifest with final synthesis if found
            if final_synthesis_text:
                try:
                    _update_manifest(lambda d: {**d, "final_synthesis": final_synthesis_text})
                except Exception as e:
                    print(f"[orchestrate] Failed to update manifest with final synthesis: {e}", file=sys.stderr)

            data = safe_json_load(path, context=f"execute_complete:{run_id}")
            data["status"] = "completed"
            data["completed_at"] = now_iso()
            data.setdefault("events", []).append({"ts": data["completed_at"], "type": "status", "message": "completed"})
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            
            # Log artifact manifest and run verification if logger is available
            if orch_logger:
                try:
                    # Collect generated files
                    generated_files = []
                    if out_dir.exists():
                        for file_path in out_dir.rglob("*"):
                            if file_path.is_file() and file_path.name not in ["run.json", "steps.jsonl", "decisions.jsonl", "conflicts.jsonl"]:
                                try:
                                    generated_files.append({
                                        "path": str(file_path.relative_to(out_dir)),
                                        "sha256": compute_file_hash(file_path),
                                        "size_bytes": file_path.stat().st_size,
                                    })
                                except Exception:
                                    pass
                    
                    # Detect stacks
                    detected = detect_stacks(out_dir)
                    
                    # Find entrypoints
                    entrypoints = []
                    for common_entry in ["main.py", "index.js", "app.py", "server.js", "index.html"]:
                        if (out_dir / common_entry).exists():
                            entrypoints.append(common_entry)
                    
                    # Log artifact manifest
                    orch_logger.log_artifact_manifest(
                        files=generated_files,
                        detected_stacks=detected,
                        entrypoints_found=entrypoints,
                        warnings=[],
                    )
                    
                    # Run verification (optional)
                    try:
                        verifier = OrchestratorVerifier(out_dir)
                        verification_results = verifier.run_all_verifications()
                        orch_logger.log_verification(**verification_results)
                    except Exception as verify_err:
                        logger.warning(f"Verification failed: {verify_err}")
                        
                except Exception as log_err:
                    logger.warning(f"Failed to log artifacts/verification: {log_err}")
            
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(f"Orchestration run {run_id} completed in {elapsed_ms:.2f}ms")
            
        except Exception as exc:
            error_detail = f"orchestrator failed: {exc}"
            print(f"[orchestrate] {error_detail}", file=sys.stderr)
            try:
                _append_events(
                    [{"ts": now_iso(), "type": "error", "message": error_detail, "error_detail": str(exc), "traceback": str(type(exc).__name__)}]
                )
                data = safe_json_load(path, default={}, context=f"execute_error:{run_id}")
                data["status"] = f"error:{type(exc).__name__}"
                data["completed_at"] = now_iso()
                data["error_detail"] = str(exc)
                data["last_step"] = "orchestrator execution"
                path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            except Exception as e:
                print(f"[orchestrate] Failed to write error state to manifest: {e}", file=sys.stderr)

    disable_exec = os.environ.get("PROMPT_API_DISABLE_ORCHESTRATION_EXEC") == "1" or bool(
        os.environ.get("PYTEST_CURRENT_TEST")
    )
    if not disable_exec:
        threading.Thread(target=_execute, args=(path, manifest), daemon=True).start()

    return {"run_id": run_id, "manifest": manifest}


def _select_prompt_id(task: Dict[str, Any]) -> Optional[str]:
    prompts = task.get("prompts")
    if isinstance(prompts, list):
        for entry in prompts:
            if isinstance(entry, dict) and entry.get("id"):
                return str(entry.get("id"))
    supervisor = task.get("supervisor") or {}
    if supervisor.get("prompt_id"):
        return str(supervisor.get("prompt_id"))
    return None


def process_orchestrator_queue(limit: int = 5, run_mode: Optional[str] = None) -> Dict[str, Any]:
    """Process queued orchestrator tasks by dispatching them to the orchestrate_run stub."""
    processed: List[Dict[str, Any]] = []
    queue = load_task_queue()
    for task in queue:
        if task.get("status") not in ("queued", "pending"):
            continue
        task_id = task.get("id")
        if not task_id:
            continue
        update_task_queue(task_id, {"status": "running", "started_at": now_iso()})
        try:
            prompt_id = _select_prompt_id(task)
            if not prompt_id:
                raise ValueError("task missing prompt id")
            supervisor = task.get("supervisor") or {}
            goal = supervisor.get("objective") or supervisor.get("task") or prompt_id
            notes = supervisor.get("notes")
            model = supervisor.get("model")
            run_mode_value = run_mode or task.get("run_mode") or supervisor.get("run_mode") or "default"
            run_req = OrchestrationRequest(
                prompt_id=prompt_id,
                goal=goal,
                notes=notes,
                model=model,
                run_mode=run_mode_value,
                repo_root=task.get("repo_root"),
            )
            res = orchestrate_run(run_req)
            run_id = cast(str, res.get("run_id"))
            manifest = res.get("manifest")
            update_task_queue(
                task_id,
                {
                    "status": "dispatched",
                    "run_id": run_id,
                    "manifest": manifest,
                    "updated_at": now_iso(),
                },
            )
            processed.append({"task_id": task_id, "run_id": run_id, "status": "dispatched"})
        except Exception as exc:
            update_task_queue(task_id, {"status": f"error:{exc}", "error": str(exc), "updated_at": now_iso()})
        if len(processed) >= limit:
            break
    return {"processed": len(processed), "results": processed}


@app.post("/orchestrator/tasks:process")
def process_orchestrator_tasks(
    limit: int = Query(1, ge=1, le=20),
    run_mode: Optional[str] = Query(None, description="Override run mode for processed tasks"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_access(admin_token)
    return process_orchestrator_queue(limit=limit, run_mode=run_mode)


@app.get("/orchestrate/runs")
def list_orchestration_runs():
    runs = []
    for f in BRIDGE_RUN_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            data["run_id"] = data.get("run_id") or f.stem
            runs.append(data)
        except Exception:
            continue
    runs = sorted(runs, key=lambda r: r.get("requested_at", ""), reverse=True)
    return {"runs": runs}


@app.get("/orchestrate/run/{run_id}")
def get_orchestration_run(run_id: str):
    path = BRIDGE_RUN_DIR / f"{run_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        data = safe_json_load(path, context=f"get_run:{run_id}")
        data["run_id"] = data.get("run_id") or run_id
        log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
        if log_path.exists():
            log_text = log_path.read_text(encoding="utf-8")
            data["log_path"] = str(log_path)
            data["log_excerpt"] = log_text[-4000:] if len(log_text) > 4000 else log_text
        return data
    except ValueError as exc:
        # Enhanced error for JSON parsing issues
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read run: {exc}")


@app.get("/orchestrate/run/{run_id}/log")
def get_orchestration_log(run_id: str, max_bytes: int = Query(8000, ge=1, le=20000)):
    log_path = BRIDGE_RUN_DIR / f"{run_id}.log"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Log not found")
    try:
        data = log_path.read_bytes()
        if len(data) > max_bytes:
            data = data[-max_bytes:]
        return {
            "run_id": run_id,
            "bytes": len(data),
            "log": data.decode("utf-8", errors="ignore"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read log: {exc}")


# ----------------------------
# Run Feedback and Learning Endpoints
# ----------------------------


# ----------------------------
# Repo Orchestration Workflow
# ----------------------------
def _repo_manifest_path(run_id: str) -> pathlib.Path:
    run_dir = BRIDGE_RUN_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir / "repo-orchestration.json"


def _repo_result_path(run_id: str) -> pathlib.Path:
    return BRIDGE_RUN_DIR / run_id / "repo-result.json"


def _redact_options(options: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(options or {})
    if cleaned.get("github_token"):
        cleaned["github_token"] = "REDACTED"
    return cleaned


def _persist_repo_state(path: pathlib.Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

def _gate_status(result: Any) -> str:
    if result is None:
        return "skipped"
    if isinstance(result, bool):
        return "passed" if result else "failed"
    if isinstance(result, dict):
        return "passed" if result.get("passed") else "failed"
    return "failed"


def _summarize_repo_gates(results: Dict[str, Any]) -> Dict[str, Any]:
    checks = {}
    for key, value in results.items():
        if key == "paths_to_full_logs":
            continue
        checks[key] = {
            "status": _gate_status(value),
            "details": value,
        }

    failed = [name for name, meta in checks.items() if meta["status"] == "failed"]
    return {
        "checks": checks,
        "failed": failed,
        "failed_count": len(failed),
        "passed_count": len([1 for meta in checks.values() if meta["status"] == "passed"]),
        "skipped_count": len([1 for meta in checks.values() if meta["status"] == "skipped"]),
    }


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []
        self._block_tags = {
            "p",
            "div",
            "section",
            "article",
            "header",
            "footer",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "pre",
            "br",
        }

    def handle_starttag(self, tag, attrs):
        if tag in self._block_tags:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("- ")

    def handle_endtag(self, tag):
        if tag in self._block_tags:
            self.parts.append("\n")

    def handle_data(self, data):
        if data:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [line.rstrip() for line in raw.splitlines()]
        cleaned = "\n".join([line for line in lines if line.strip() != ""])
        return cleaned.strip()


def _extract_section_lines(text: str, keywords: List[str]) -> List[str]:
    lines = [line.strip() for line in text.splitlines()]
    matches: List[str] = []
    capture = False
    for line in lines:
        lowered = line.lower()
        if any(keyword in lowered for keyword in keywords):
            capture = True
            continue
        if capture and line == "":
            break
        if capture:
            if line.startswith("- "):
                matches.append(line[2:].strip())
            else:
                matches.append(line.strip())
    return [m for m in matches if m]


def _build_report_from_html(html_text: str) -> Dict[str, Any]:
    parser = _HtmlTextExtractor()
    parser.feed(html_text)
    text = parser.text()
    summary_lines = text.splitlines()[:6]
    summary = " ".join(summary_lines).strip()

    return {
        "summary": summary,
        "key_findings": _extract_section_lines(text, ["finding", "key finding"]),
        "recommended_actions": _extract_section_lines(text, ["recommend", "action"]),
        "risks": _extract_section_lines(text, ["risk"]),
        "next_steps": _extract_section_lines(text, ["next step", "next steps"]),
    }


def _report_md_from_json(report_json: Dict[str, Any]) -> str:
    repo_value = report_json.get("repo")
    repo = repo_value if isinstance(repo_value, dict) else {"url": repo_value} if repo_value else {}
    summary_value = report_json.get("summary")
    summary = summary_value if isinstance(summary_value, dict) else {}
    verification = report_json.get("verification") or {}
    changes = report_json.get("changes") or {}
    findings = report_json.get("findings") or {}
    blockers = report_json.get("blockers") or []

    def _list(values: Any, fallback: str) -> List[str]:
        if isinstance(values, list) and values:
            return [str(v) for v in values if v]
        return [fallback]

    commands = verification.get("commands") if isinstance(verification, dict) else []
    command_lines: List[str] = []
    if isinstance(commands, list) and commands:
        for cmd in commands:
            if not isinstance(cmd, dict):
                continue
            name = cmd.get("name") or "command"
            cmd_text = cmd.get("cmd") or ""
            exit_code = cmd.get("exit_code")
            log_artifact = cmd.get("log_artifact") or "n/a"
            desc = f"- **{name}**"
            if cmd_text:
                desc += f": `{cmd_text}`"
            if exit_code is not None:
                desc += f" (exit {exit_code})"
            desc += f" — log: `{log_artifact}`"
            command_lines.append(desc)
    else:
        command_lines.append("- No verification commands were executed in this run.")

    files_changed = changes.get("files_changed") if isinstance(changes, dict) else []
    files_changed_lines = (
        [f"- `{path}`" for path in files_changed]
        if isinstance(files_changed, list) and files_changed
        else ["- No files changed."]
    )

    high_risk_items = findings.get("high_risk_items") if isinstance(findings, dict) else []
    risk_lines = []
    if isinstance(high_risk_items, list) and high_risk_items:
        for item in high_risk_items:
            if not isinstance(item, dict):
                continue
            path = item.get("path") or "unknown"
            line = item.get("line") or "?"
            kind = item.get("kind") or "note"
            note = item.get("note") or ""
            detail = f"- `{path}:{line}` **{kind}**"
            if note:
                detail += f": {note}"
            risk_lines.append(detail)
    else:
        risk_lines.append("- No high-risk items detected.")

    blocker_lines = []
    if isinstance(blockers, list) and blockers:
        for blocker in blockers:
            if not isinstance(blocker, dict):
                continue
            code = blocker.get("code") or "BLOCKER"
            message = blocker.get("message") or ""
            fix = blocker.get("suggested_fix") or ""
            line = f"- **{code}**: {message}" if message else f"- **{code}**"
            if fix:
                line += f" (fix: {fix})"
            blocker_lines.append(line)
    else:
        blocker_lines.append("- No blockers reported.")

    return "\n".join(
        [
            "# Repo Orchestration Report",
            "",
            f"- **Run ID:** `{report_json.get('run_id')}`",
            f"- **Repo:** `{repo.get('url') or 'unknown'}`",
            f"- **Branch:** `{repo.get('branch') or 'default'}`",
            f"- **Outcome:** `{report_json.get('outcome')}`",
            "",
            "## Summary",
            summary.get("headline") or "Summary not available.",
            "",
            "### What happened",
            *_list(summary.get("what_happened"), "No summary details available."),
            "",
            "### Next actions",
            *_list(summary.get("next_actions"), "No next actions recorded."),
            "",
            "## Verification",
            *command_lines,
            "",
            "## Changes",
            f"- Patch: `{changes.get('patch_artifact') or 'none'}`",
            f"- Files changed: {len(files_changed) if isinstance(files_changed, list) else 0}",
            *files_changed_lines,
            "",
            "## Findings",
            f"- TODO count: {findings.get('todo_count', 0)}",
            f"- Placeholder count: {findings.get('placeholder_count', 0)}",
            f"- Findings artifact: `{findings.get('findings_artifact') or 'none'}`",
            *risk_lines,
            "",
            "## Blockers",
            *blocker_lines,
        ]
    )


def _guess_mime_type(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".md":
        return "text/markdown"
    if suffix == ".json":
        return "application/json"
    if suffix in (".diff", ".patch"):
        return "text/plain"
    if suffix in (".html", ".htm"):
        return "text/html"
    if suffix == ".zip":
        return "application/zip"
    return "application/octet-stream"


def _artifact_record(path: pathlib.Path, artifact_id: str) -> Dict[str, Any]:
    stat_info = path.stat()
    return {
        "artifactId": artifact_id,
        "fileName": path.name,
        "filePath": str(path),
        "mimeType": _guess_mime_type(path),
        "size": stat_info.st_size,
        "createdAt": datetime.datetime.utcfromtimestamp(stat_info.st_mtime).isoformat() + "Z",
    }


def _slugify_artifact_id(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "artifact"


def _write_patch_diff(run_dir: pathlib.Path, execution_result: Dict[str, Any]) -> Optional[pathlib.Path]:
    if not execution_result:
        return None
    tasks = execution_result.get("tasks", [])
    if not isinstance(tasks, list):
        return None
    diff_chunks: List[str] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        artifacts = task.get("artifacts", {})
        diff_path = artifacts.get("diff")
        task_id = task.get("task_id")
        if diff_path and pathlib.Path(diff_path).exists():
            diff_text = pathlib.Path(diff_path).read_text(encoding="utf-8", errors="replace")
            diff_chunks.append(f"# Task {task_id}\n{diff_text}")
    if not diff_chunks:
        return None
    patch_path = run_dir / "PATCH.diff"
    patch_path.write_text("\n\n".join(diff_chunks), encoding="utf-8")
    return patch_path


def _write_evidence_index(
    run_dir: pathlib.Path,
    execution_result: Dict[str, Any],
    manifest_path: pathlib.Path,
    taskgraph_path: Optional[pathlib.Path],
) -> pathlib.Path:
    evidence_dir = run_dir / "EVIDENCE"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence_entries: List[Dict[str, Any]] = []

    evidence_entries.append({"label": "manifest", "path": str(manifest_path)})
    if taskgraph_path:
        evidence_entries.append({"label": "taskgraph", "path": str(taskgraph_path)})

    tasks = execution_result.get("tasks", []) if execution_result else []
    for task in tasks if isinstance(tasks, list) else []:
        if not isinstance(task, dict):
            continue
        artifacts = task.get("artifacts", {})
        for key in ("log", "findings", "diff", "violation"):
            if artifacts.get(key):
                evidence_entries.append({"label": f"task_{key}", "path": artifacts[key]})

    evidence_index = evidence_dir / "files.json"
    evidence_index.write_text(json.dumps(evidence_entries, indent=2), encoding="utf-8")
    return evidence_index


def _to_relpath(path: Optional[pathlib.Path], run_dir: pathlib.Path) -> Optional[str]:
    if not path:
        return None
    try:
        return path.relative_to(run_dir).as_posix()
    except Exception:
        return path.name


def _files_changed_from_patch(patch_path: Optional[pathlib.Path]) -> List[str]:
    if not patch_path or not patch_path.exists():
        return []
    try:
        diff_text = patch_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []
    files: List[str] = []
    seen: set[str] = set()
    for line in diff_text.splitlines():
        if not (line.startswith("+++ ") or line.startswith("--- ")):
            continue
        path = line[4:].strip()
        if not path or path == "/dev/null":
            continue
        if path.startswith("a/") or path.startswith("b/"):
            path = path[2:]
        if path not in seen:
            seen.add(path)
            files.append(path)
    return files


def _git_rev_parse(repo_path: Optional[pathlib.Path], ref: Optional[str]) -> Optional[str]:
    if not repo_path or not ref:
        return None
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", ref],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    return (proc.stdout or "").strip() or None


def _scan_placeholders(repo_path: Optional[pathlib.Path], run_dir: pathlib.Path) -> Tuple[Dict[str, Any], pathlib.Path]:
    scan_payload = {
        "todo_count": 0,
        "placeholder_count": 0,
        "high_risk_items": [],
        "scanned_files": 0,
    }
    scan_path = run_dir / "placeholder-scan.json"
    if not repo_path or not repo_path.exists():
        scan_path.write_text(json.dumps(scan_payload, indent=2), encoding="utf-8")
        return scan_payload, scan_path

    skip_dirs = {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "dist",
        "build",
        "out",
        ".next",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        ".venv",
        "venv",
        "__pycache__",
        ".uaitoolbox",
        "artifacts",
        "runs",
        "codex_runs",
    }
    todo_tokens = {"TODO", "FIXME", "HACK", "XXX"}
    placeholder_tokens = {"PLACEHOLDER", "TBD"}
    token_regex = re.compile(r"\\b(" + "|".join(sorted(todo_tokens | placeholder_tokens)) + r")\\b", re.IGNORECASE)

    high_risk_items: List[Dict[str, Any]] = []
    max_file_size = 1_000_000
    max_risk_items = 50
    max_files = 3000

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for filename in files:
            if scan_payload["scanned_files"] >= max_files:
                break
            file_path = pathlib.Path(root) / filename
            try:
                if file_path.stat().st_size > max_file_size:
                    continue
            except Exception:
                continue
            try:
                with open(file_path, "rb") as handle:
                    sample = handle.read(2048)
                    if b"\\x00" in sample:
                        continue
                text = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if not text:
                continue
            scan_payload["scanned_files"] += 1
            rel_path = str(file_path.relative_to(repo_path))
            for idx, line in enumerate(text.splitlines(), start=1):
                for match in token_regex.finditer(line):
                    token = match.group(1).upper()
                    if token in todo_tokens:
                        scan_payload["todo_count"] += 1
                    if token in placeholder_tokens:
                        scan_payload["placeholder_count"] += 1
                    if token in todo_tokens and len(high_risk_items) < max_risk_items:
                        high_risk_items.append(
                            {
                                "path": rel_path,
                                "line": idx,
                                "kind": token,
                                "note": line.strip()[:240],
                            }
                        )
        if scan_payload["scanned_files"] >= max_files:
            break

    scan_payload["high_risk_items"] = high_risk_items
    scan_path.write_text(json.dumps(scan_payload, indent=2), encoding="utf-8")
    return scan_payload, scan_path


def _build_verification_commands(results: Optional[Dict[str, Any]], run_dir: pathlib.Path) -> List[Dict[str, Any]]:
    if not isinstance(results, dict):
        return []

    mapping = {
        "lint_result": "lint",
        "build_result": "build",
        "unit_test_result": "unit_tests",
        "smoke_test_result": "smoke_tests",
        "normalization_result": "normalization",
        "docker_compose_valid": "docker_compose",
    }
    commands: List[Dict[str, Any]] = []

    for key, name in mapping.items():
        value = results.get(key)
        if value is None:
            continue
        if isinstance(value, dict):
            cmd = value.get("command") or value.get("executed") or value.get("cmd")
            exit_code = value.get("exit_code")
            if exit_code is None:
                exit_code = 0 if value.get("passed") else 1
            log_path = value.get("log_path")
            log_artifact = None
            if log_path:
                log_artifact = _to_relpath(pathlib.Path(log_path), run_dir)
            commands.append(
                {
                    "name": name,
                    "cmd": cmd,
                    "exit_code": exit_code,
                    "log_artifact": log_artifact,
                }
            )
        elif isinstance(value, bool):
            commands.append(
                {
                    "name": name,
                    "cmd": None,
                    "exit_code": 0 if value else 1,
                    "log_artifact": None,
                }
            )

    return commands


def _write_verification_artifacts(run_dir: pathlib.Path, commands: List[Dict[str, Any]]) -> Tuple[pathlib.Path, pathlib.Path]:
    verification_payload = {"commands": commands}
    verification_json_path = run_dir / "verification.json"
    verification_json_path.write_text(json.dumps(verification_payload, indent=2), encoding="utf-8")

    lines = [
        "# Verification",
        "",
        f"- Commands executed: {len(commands)}",
    ]
    if not commands:
        lines.append("")
        lines.append("No verification commands were executed in this run.")
    else:
        lines.append("")
        lines.append("## Commands")
        for cmd in commands:
            name = cmd.get("name") or "command"
            cmd_text = cmd.get("cmd") or ""
            exit_code = cmd.get("exit_code")
            log_artifact = cmd.get("log_artifact") or "n/a"
            detail = f"- **{name}**"
            if cmd_text:
                detail += f": `{cmd_text}`"
            if exit_code is not None:
                detail += f" (exit {exit_code})"
            detail += f" — log: `{log_artifact}`"
            lines.append(detail)

    verification_md_path = run_dir / "verification.md"
    verification_md_path.write_text("\n".join(lines), encoding="utf-8")
    return verification_json_path, verification_md_path


def _map_outcome(status: str, error_message: Optional[str], merge_status: Optional[str]) -> str:
    status_value = (status or "").lower()
    merge_value = (merge_status or "").lower()
    if merge_value == "no_changes" or status_value == "no_changes":
        return "no_changes_by_design"
    if merge_value in ("conflict", "validation_failed") or status_value in ("conflict", "validation_failed"):
        return "blocked"
    if status_value in ("merged", "complete", "completed", "success"):
        return "changes_applied"
    if status_value in ("cancelled", "canceled", "error", "failed"):
        return "failed"
    if error_message:
        return "failed"
    return "failed"

def _build_artifacts_index(
    run_dir: pathlib.Path,
    repo: str,
    branch: Optional[str],
    run_id: str,
    status: str,
    execution_result: Dict[str, Any],
    manifest_path: pathlib.Path,
    taskgraph_path: Optional[pathlib.Path],
    error_message: Optional[str] = None,
    base_branch: Optional[str] = None,
    integration_branch: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    codex_runs: List[str] = []
    tasks = execution_result.get("tasks", []) if execution_result else []
    for task in tasks if isinstance(tasks, list) else []:
        if isinstance(task, dict) and task.get("codex_run_id"):
            codex_runs.append(str(task["codex_run_id"]))

    synthesis_html: List[Dict[str, Any]] = []
    html_text: Optional[str] = None
    html_path: Optional[pathlib.Path] = None
    existing_report_json: Optional[Dict[str, Any]] = None
    existing_report_path = run_dir / "REPORT.json"
    if existing_report_path.exists():
        existing_report_json = safe_json_load(existing_report_path, default=None, context=f"report_json:{run_id}")

    for codex_run_id in codex_runs:
        candidate = run_dir / "codex_runs" / codex_run_id / "swarm-output" / "Final_Synthesis.html"
        entry = {"codex_run_id": codex_run_id, "path": str(candidate), "exists": candidate.exists()}
        synthesis_html.append(entry)
        if html_text is None and candidate.exists():
            html_path = candidate
            html_text = candidate.read_text(encoding="utf-8", errors="replace")

    manifest_data = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_id}") or {}
    merge_info = manifest_data.get("merge") if isinstance(manifest_data.get("merge"), dict) else {}
    merge_status = merge_info.get("status") if isinstance(merge_info, dict) else None
    outcome = _map_outcome(status, error_message, merge_status)

    options = manifest_data.get("options") if isinstance(manifest_data.get("options"), dict) else {}
    branch_name = branch or options.get("branch") or merge_info.get("base_branch") or base_branch
    repo_path_value = manifest_data.get("clone_path")
    repo_path = pathlib.Path(repo_path_value) if repo_path_value else None
    integration_ref = integration_branch or merge_info.get("integration_branch") or manifest_data.get("integration_branch")
    if not integration_ref and run_id:
        integration_ref = f"{run_id}-integration"

    commit_before = _git_rev_parse(repo_path, base_branch or branch_name)
    commit_after = _git_rev_parse(repo_path, integration_ref) or _git_rev_parse(repo_path, "HEAD")

    html_sections = _build_report_from_html(html_text) if html_text else {}

    legacy_summary = ""
    legacy_findings: List[str] = []
    legacy_actions: List[str] = []
    legacy_next_steps: List[str] = []
    legacy_headline = ""
    if existing_report_json:
        if existing_report_json.get("schema_version"):
            summary = existing_report_json.get("summary") if isinstance(existing_report_json.get("summary"), dict) else {}
            if isinstance(summary, dict):
                legacy_headline = summary.get("headline") or ""
                legacy_findings = summary.get("what_happened") or []
                legacy_actions = summary.get("next_actions") or []
        else:
            legacy_summary = existing_report_json.get("summary") or ""
            legacy_findings = existing_report_json.get("keyFindings") or []
            legacy_actions = existing_report_json.get("recommendedActions") or []
            legacy_next_steps = existing_report_json.get("nextSteps") or []

    summary_text = html_sections.get("summary") or legacy_summary or error_message or ""
    key_findings = html_sections.get("key_findings") or legacy_findings or []
    recommended_actions = html_sections.get("recommended_actions") or legacy_actions or []
    next_steps = html_sections.get("next_steps") or legacy_next_steps or []
    if not isinstance(key_findings, list):
        key_findings = []
    if not isinstance(recommended_actions, list):
        recommended_actions = []
    if not isinstance(next_steps, list):
        next_steps = []

    gate_results: Optional[Dict[str, Any]] = None
    gates_report = run_dir / "REPO_GATES_REPORT.json"
    if gates_report.exists():
        gate_results = safe_json_load(gates_report, default=None, context=f"repo_gates:{run_id}")
    elif isinstance(manifest_data.get("repo_gates"), dict):
        gate_results = manifest_data.get("repo_gates", {}).get("results")

    verification_commands = _build_verification_commands(gate_results, run_dir)
    verification_json_path, verification_md_path = _write_verification_artifacts(run_dir, verification_commands)

    patch_path = _write_patch_diff(run_dir, execution_result)
    files_changed = _files_changed_from_patch(patch_path)

    findings_payload, findings_path = _scan_placeholders(repo_path, run_dir)

    blockers: List[Dict[str, Any]] = []
    error_detail = manifest_data.get("error_detail") if isinstance(manifest_data.get("error_detail"), dict) else None
    if error_detail:
        suggested_fix = None
        if isinstance(error_detail.get("suggestedFixes"), list) and error_detail.get("suggestedFixes"):
            suggested_fix = str(error_detail["suggestedFixes"][0])
        blockers.append(
            {
                "code": error_detail.get("code") or error_detail.get("error_code") or "ERROR",
                "message": error_detail.get("userMessage") or error_detail.get("message") or error_message or "Run failed",
                "suggested_fix": suggested_fix,
            }
        )
    if merge_status == "conflict":
        blockers.append(
            {
                "code": "MERGE_CONFLICT",
                "message": f"Merge conflict on task {merge_info.get('failed_task')}",
                "suggested_fix": "Resolve the conflict and re-run the orchestration.",
            }
        )
    if merge_status == "validation_failed":
        blockers.append(
            {
                "code": "VALIDATION_FAILED",
                "message": f"Validation failed on task {merge_info.get('failed_task')}",
                "suggested_fix": "Inspect validation artifacts and address failures.",
            }
        )
    if error_message and not blockers:
        blockers.append({"code": "ERROR", "message": error_message, "suggested_fix": None})

    def _dedupe(items: List[str]) -> List[str]:
        seen: set[str] = set()
        result: List[str] = []
        for item in items:
            if not item:
                continue
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    what_happened: List[str] = []
    if summary_text:
        what_happened.append(summary_text)
    if merge_info.get("message"):
        what_happened.append(str(merge_info.get("message")))
    if tasks and isinstance(tasks, list):
        what_happened.append(f"Tasks executed: {len(tasks)}")
    if verification_commands:
        passed = len([c for c in verification_commands if c.get("exit_code") == 0])
        failed = len([c for c in verification_commands if c.get("exit_code") not in (None, 0)])
        what_happened.append(f"Verification: {len(verification_commands)} commands ({passed} passed, {failed} failed)")
    if patch_path and files_changed:
        what_happened.append(f"Patch generated with {len(files_changed)} files changed.")
    if outcome == "no_changes_by_design":
        what_happened.append("No changes were produced between base and integration branches.")
    if error_message and error_message not in what_happened:
        what_happened.append(error_message)
    if key_findings:
        what_happened.extend(key_findings)
    what_happened = _dedupe(what_happened)

    next_actions: List[str] = []
    next_actions.extend(recommended_actions)
    next_actions.extend(next_steps)
    if patch_path:
        next_actions.append("Review PATCH.diff for change details.")
    if blockers:
        next_actions.append("Resolve blockers and re-run the orchestration.")
    if verification_commands and any(cmd.get("exit_code") not in (None, 0) for cmd in verification_commands):
        next_actions.append("Review verification logs for failed commands.")
    if outcome == "no_changes_by_design":
        next_actions.append("Confirm scope or expand instructions if changes were expected.")
    next_actions = _dedupe(next_actions)

    headline = legacy_headline or summary_text or (
        "No changes produced" if outcome == "no_changes_by_design" else "Repo orchestration completed"
    )

    report_json = {
        "schema_version": "1.0",
        "run_id": run_id,
        "repo": {
            "url": repo,
            "branch": branch_name,
            "commit_before": commit_before,
            "commit_after": commit_after,
        },
        "outcome": outcome,
        "summary": {
            "headline": headline,
            "what_happened": what_happened,
            "next_actions": next_actions,
        },
        "verification": {"commands": verification_commands},
        "changes": {
            "files_changed": files_changed,
            "patch_artifact": _to_relpath(patch_path, run_dir),
        },
        "findings": {
            "todo_count": findings_payload.get("todo_count", 0),
            "placeholder_count": findings_payload.get("placeholder_count", 0),
            "high_risk_items": findings_payload.get("high_risk_items", []),
            "findings_artifact": _to_relpath(findings_path, run_dir),
        },
        "blockers": blockers,
        "artifacts": {
            "report_md": "REPORT.md",
            "verification_md": _to_relpath(verification_md_path, run_dir),
            "verification_json": _to_relpath(verification_json_path, run_dir),
        },
    }

    report_md = _report_md_from_json(report_json)

    report_md_path = run_dir / "REPORT.md"
    report_md_path.write_text(report_md, encoding="utf-8")

    report_json_path = run_dir / "REPORT.json"
    report_json_path.write_text(json.dumps(report_json, indent=2), encoding="utf-8")
    evidence_index = _write_evidence_index(run_dir, execution_result, manifest_path, taskgraph_path)

    artifacts: List[Dict[str, Any]] = []
    used_ids: set[str] = set()

    def _add_artifact(path: pathlib.Path, preferred_id: str) -> None:
        artifact_id = _slugify_artifact_id(preferred_id)
        counter = 1
        while artifact_id in used_ids:
            counter += 1
            artifact_id = f"{_slugify_artifact_id(preferred_id)}-{counter}"
        used_ids.add(artifact_id)
        artifacts.append(_artifact_record(path, artifact_id))

    _add_artifact(report_md_path, "report-md")
    _add_artifact(report_json_path, "report-json")
    _add_artifact(verification_md_path, "verification-md")
    _add_artifact(verification_json_path, "verification-json")
    if findings_path.exists():
        _add_artifact(findings_path, "placeholder-scan")
    if patch_path and patch_path.exists():
        _add_artifact(patch_path, "patch-diff")
    if evidence_index.exists():
        _add_artifact(evidence_index, "evidence-files")
    if html_path and html_path.exists():
        _add_artifact(html_path, "final-synthesis-html")
    if blockers:
        blockers_path = run_dir / "BLOCKERS.md"
        blockers_lines = ["# Blockers", ""]
        for blocker in blockers:
            if not isinstance(blocker, dict):
                continue
            code = blocker.get("code") or "BLOCKER"
            message = blocker.get("message") or ""
            fix = blocker.get("suggested_fix") or ""
            line = f"- **{code}**: {message}" if message else f"- **{code}**"
            if fix:
                line += f" (fix: {fix})"
            blockers_lines.append(line)
        blockers_path.write_text("\n".join(blockers_lines), encoding="utf-8")
        _add_artifact(blockers_path, "blockers-md")

    gates_report = run_dir / "REPO_GATES_REPORT.json"
    if gates_report.exists():
        _add_artifact(gates_report, "repo-gates-report")
    gates_summary = run_dir / "REPO_GATES_SUMMARY.md"
    if gates_summary.exists():
        _add_artifact(gates_summary, "repo-gates-summary")

    return artifacts, {"codex_runs": codex_runs, "synthesis_html": synthesis_html}


def _parse_owner_repo(repo: str) -> Tuple[str, str]:
    candidate = repo.strip()
    parsed = urlparse(candidate)
    parts = [p for p in parsed.path.split("/") if p] if parsed.scheme else [p for p in candidate.split("/") if p]
    if len(parts) < 2:
        raise ValueError("Unable to parse repository identifier")
    owner, name = parts[-2], parts[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return owner, name


def _materialize_task_branches(
    repo_path: pathlib.Path,
    base_branch: str,
    run_id: str,
    task_results: List[Dict[str, Any]],
) -> Dict[str, str]:
    branches: Dict[str, str] = {}
    for task in task_results:
        task_id = task.get("task_id")
        diff_path_str = (task.get("artifacts") or {}).get("diff")
        if not task_id or not diff_path_str:
            continue
        diff_path = pathlib.Path(diff_path_str)
        if not diff_path.exists():
            continue
        try:
            diff_text = diff_path.read_text(encoding="utf-8")
        except Exception:
            continue
        if not diff_text.strip():
            continue

        branch_name = f"{run_id}-{task_id}"
        checkout_base = subprocess.run(
            ["git", "-C", str(repo_path), "checkout", base_branch],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if checkout_base.returncode != 0:
            raise MergeCoordinatorError(f"Failed to checkout {base_branch}: {checkout_base.stderr}")

        branch_create = subprocess.run(
            ["git", "-C", str(repo_path), "checkout", "-B", branch_name, base_branch],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if branch_create.returncode != 0:
            raise MergeCoordinatorError(f"Failed to create branch {branch_name}: {branch_create.stderr}")

        apply_proc = subprocess.run(
            ["git", "-C", str(repo_path), "apply", str(diff_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if apply_proc.returncode != 0:
            raise MergeCoordinatorError(
                f"Failed to apply patch for {task_id}: {apply_proc.stderr or apply_proc.stdout}"
            )

        status_proc = subprocess.run(
            ["git", "-C", str(repo_path), "status", "--porcelain"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if status_proc.stdout.strip():
            git_env = os.environ.copy()
            git_env.setdefault("GIT_COMMITTER_NAME", "repo-orchestrator")
            git_env.setdefault("GIT_COMMITTER_EMAIL", "repo-orchestrator@example.com")
            git_env.setdefault("GIT_AUTHOR_NAME", git_env["GIT_COMMITTER_NAME"])
            git_env.setdefault("GIT_AUTHOR_EMAIL", git_env["GIT_COMMITTER_EMAIL"])
            subprocess.run(["git", "-C", str(repo_path), "add", "-A"], check=True)
            subprocess.run(
                ["git", "-C", str(repo_path), "commit", "-m", f"Task {task_id} changes"],
                check=True,
                env=git_env,
            )
            branches[task_id] = branch_name

        # Reset back to base branch for the next iteration
        subprocess.run(["git", "-C", str(repo_path), "checkout", base_branch], check=False)
    return branches


@app.post("/orchestrate/repo", response_class=StreamingResponse)
async def start_repo_orchestration(
    req: RepoOrchestrationRequest,
    request: Request,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """Start a repository-first orchestration workflow with streaming progress."""
    _require_execution_access(execution_token or admin_token)

    if (
        GitHubCloneService is None
        or RepoIntakeService is None
        or SupervisorPlanner is None
        or TaskExecutor is None
        or CodexSwarmService is None
    ):
        raise HTTPException(status_code=503, detail="orchestration bridge components are unavailable")

    run_suffix = uuid.uuid4().hex[:6]
    safe_slug = sanitize_run_id(req.goal or req.repo)[:40]
    run_id = f"repo-{safe_slug}-{run_suffix}"
    run_dir = BRIDGE_RUN_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "run_id": run_id,
        "repo": req.repo,
        "goal": req.goal,
        "options": _redact_options(req.options.model_dump()),
        "status": "accepted",
        "requested_at": now_iso(),
    }
    _persist_repo_state(_repo_manifest_path(run_id), manifest)

    event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
    loop = asyncio.get_event_loop()
    cancel_event = asyncio.Event()
    try:
        codex_service = CodexSwarmService(
            codex_script_path=pathlib.Path(CODEX_SWARM_PS1),
            output_dir=run_dir / "codex_runs",
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async with _repo_state_lock:
        _repo_orchestration_state[run_id] = {
            "cancel_event": cancel_event,
            "codex_service": codex_service,
            "codex_runs": set(),
        }

    def _enqueue_sync(payload: Dict[str, Any]) -> None:
        payload.setdefault("run_id", run_id)
        loop.call_soon_threadsafe(event_queue.put_nowait, payload)

    async def _enqueue(payload: Dict[str, Any]) -> None:
        payload.setdefault("run_id", run_id)
        await event_queue.put(payload)

    async def _pipeline() -> None:
        manifest_path = _repo_manifest_path(run_id)
        execution_result: Dict[str, Any] = {}
        taskgraph_path: Optional[pathlib.Path] = None
        merge_result: Dict[str, Any] = {}
        try:
            await _enqueue({"type": "status", "message": "accepted"})
            orchestration_token = req.options.github_token or os.environ.get("GITHUB_TOKEN")
            clone_service = GitHubCloneService(
                github_token=orchestration_token,
                clone_base_dir=run_dir,
            )

            def _on_clone_progress(progress: Dict[str, Any]) -> None:
                safe_progress = dict(progress)
                if isinstance(safe_progress.get("message"), str):
                    safe_progress["message"] = safe_progress["message"][:200]
                _enqueue_sync({"type": "clone_progress", "progress": safe_progress})

            clone_path = await asyncio.to_thread(
                clone_service.clone_repository,
                req.repo,
                req.options.branch,
                _on_clone_progress,
                run_id,
            )
            manifest.update({"clone_path": str(clone_path), "status": "cloned"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "cloned", "repo_path": str(clone_path)})

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            intake_service = RepoIntakeService(
                github_token=orchestration_token,
                runs_dir=BRIDGE_RUN_DIR,
            )
            intake = await asyncio.to_thread(
                intake_service.run_intake,
                req.repo,
                run_id,
                req.options.branch,
                clone_path,
            )
            manifest.update({"intake": intake, "status": "intake_complete"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "intake_complete", "artifacts": intake.get("artifacts")})

            planner = SupervisorPlanner(runs_dir=BRIDGE_RUN_DIR)
            constraints = {
                "allowed_paths": req.options.allowed_paths,
                "max_parallel": req.options.max_parallel,
                "risk_posture": req.options.risk_posture,
                "model": req.options.model,
            }
            taskgraph = planner.generate_taskgraph(
                run_id=run_id,
                intake=intake,
                user_goal=req.goal,
                constraints=constraints,
            )
            taskgraph_path = pathlib.Path(taskgraph["artifacts"]["taskgraph_json"])
            manifest.update({"taskgraph": taskgraph, "status": "planned"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "planned", "taskgraph": taskgraph["artifacts"]})

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            executor = TaskExecutor(runs_dir=BRIDGE_RUN_DIR, codex_service=codex_service)

            def _on_task_progress(event: Dict[str, Any]) -> None:
                if event.get("event") == "codex_run_started" and event.get("codex_run_id"):
                    async def _record_codex():
                        async with _repo_state_lock:
                            state = _repo_orchestration_state.get(run_id, {})
                            runs = state.get("codex_runs", set())
                            runs.add(event["codex_run_id"])
                            state["codex_runs"] = runs
                            _repo_orchestration_state[run_id] = state
                    asyncio.run_coroutine_threadsafe(_record_codex(), loop)
                event_type = (
                    str(event.get("event"))
                    if event.get("event") in {"codex_run_started", "codex_summary", "task_failed"}
                    else "task_progress"
                )
                _enqueue_sync({"type": event_type, **event})

            execution_result = await asyncio.to_thread(
                executor.execute_taskgraph,
                repo_path=clone_path,
                run_id=run_id,
                taskgraph_path=taskgraph_path,
                progress_callback=_on_task_progress,
                cancel_event=cancel_event,
            )
            manifest.update({"tasks": execution_result, "status": "executed"})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "tasks_complete", "tasks": execution_result})

            task_results = execution_result.get("tasks") or []
            failed_tasks = [
                task for task in task_results if str(task.get("status") or "").lower() not in {"completed", "success"}
            ]
            if failed_tasks:
                failed_ids = [str(task.get("task_id") or "<unknown>") for task in failed_tasks]
                raise TaskExecutionError(f"task execution failed for: {', '.join(failed_ids)}")

            if cancel_event.is_set():
                raise TaskExecutionError("cancelled")

            repo_gates_enabled = os.environ.get("REPO_ORCHESTRATION_GATES", "false").lower() == "true"
            repo_gates_strict = os.environ.get("REPO_ORCHESTRATION_GATES_STRICT", "false").lower() == "true"
            repo_gates_normalize = os.environ.get("REPO_ORCHESTRATION_GATES_NORMALIZE", "false").lower() == "true"
            if repo_gates_enabled:
                if not ORCHESTRATOR_LOGGING_AVAILABLE:
                    logger.warning("Repo gates requested but OrchestratorVerifier is unavailable")
                else:
                    gate_logs_dir = run_dir / "gate-logs"
                    verifier = OrchestratorVerifier(clone_path, log_dir=gate_logs_dir)
                    if repo_gates_normalize:
                        gate_results = verifier.run_all_verifications()
                    else:
                        gate_results = {
                            "lint_result": verifier.verify_lint(),
                            "build_result": verifier.verify_build(),
                            "unit_test_result": verifier.verify_unit_tests(),
                            "smoke_test_result": verifier.verify_smoke_tests(),
                            "docker_compose_valid": verifier.verify_docker_compose(),
                            "paths_to_full_logs": [],
                        }
                        log_paths = []
                        for key in ["lint_result", "build_result", "unit_test_result", "smoke_test_result"]:
                            result = gate_results.get(key)
                            if result and isinstance(result, dict) and result.get("log_path"):
                                log_paths.append(result["log_path"])
                        gate_results["paths_to_full_logs"] = log_paths

                    gate_summary = _summarize_repo_gates(gate_results)
                    gate_report_path = run_dir / "REPO_GATES_REPORT.json"
                    gate_report_path.write_text(json.dumps(gate_results, indent=2), encoding="utf-8")
                    gate_summary_path = run_dir / "REPO_GATES_SUMMARY.md"
                    gate_summary_lines = [
                        "# Repo Gates Summary",
                        "",
                        f"- Run ID: `{run_id}`",
                        f"- Repo: `{req.repo}`",
                        f"- Branch: `{req.options.branch or 'default'}`",
                        f"- Failed: {gate_summary['failed_count']}",
                        f"- Passed: {gate_summary['passed_count']}",
                        f"- Skipped: {gate_summary['skipped_count']}",
                        "",
                        "## Checks",
                    ]
                    for name, meta in gate_summary["checks"].items():
                        gate_summary_lines.append(f"- **{name}**: {meta['status']}")
                    gate_summary_path.write_text("\n".join(gate_summary_lines), encoding="utf-8")

                    manifest.update(
                        {
                            "repo_gates": {
                                "enabled": True,
                                "strict": repo_gates_strict,
                                "normalize": repo_gates_normalize,
                                "report": str(gate_report_path),
                                "summary": str(gate_summary_path),
                                "results": gate_results,
                            }
                        }
                    )
                    _persist_repo_state(manifest_path, manifest)
                    await _enqueue(
                        {
                            "type": "repo_gates_complete",
                            "summary": gate_summary,
                            "report": str(gate_report_path),
                        }
                    )

                    if repo_gates_strict and gate_summary["failed_count"] > 0:
                        raise TaskExecutionError("repo gates failed")

            coordinator = MergeCoordinator(github_token=orchestration_token, runs_dir=BRIDGE_RUN_DIR)
            base_branch = req.options.base_branch or coordinator._detect_default_branch(clone_path)  # type: ignore[attr-defined]
            integration_branch = req.options.integration_branch or f"{run_id}-integration"
            branch_map = _materialize_task_branches(
                repo_path=clone_path,
                base_branch=base_branch,
                run_id=run_id,
                task_results=execution_result.get("tasks", []),
            )
            if branch_map:
                tg_data = safe_json_load(taskgraph_path, default={}, context=f"taskgraph:{run_id}")
                for task in tg_data.get("tasks", []):
                    task_id = task.get("id")
                    if task_id in branch_map:
                        task["branch"] = branch_map[task_id]
                taskgraph_path.write_text(json.dumps(tg_data, indent=2), encoding="utf-8")

            repo_owner, repo_name = _parse_owner_repo(req.repo)
            merge_result = coordinator.merge_taskgraph(
                repo_path=clone_path,
                run_id=run_id,
                repo_owner=repo_owner,
                repo_name=repo_name,
                base_branch=base_branch,
                integration_branch=integration_branch,
                taskgraph_path=taskgraph_path,
                pr_title=req.options.pr_title,
                pr_body=req.options.pr_body,
                push_integration=True,
            )
            manifest.update({"merge": merge_result, "status": merge_result.get("status")})
            _persist_repo_state(manifest_path, manifest)
            await _enqueue({"type": "merged", "merge": merge_result})

            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status=merge_result.get("status", "unknown"),
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                base_branch=base_branch,
                integration_branch=integration_branch,
            )

            result_payload = {
                "run_id": run_id,
                "status": merge_result.get("status", "unknown"),
                "pr_url": (merge_result.get("pr") or {}).get("pr_url"),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "complete", "final": True, "result": result_payload})
        except RepositoryCloneError as exc:
            error_msg = str(exc)
            manifest.update({"status": "error", "error": error_msg})
            if getattr(exc, "payload", None):
                manifest["error_detail"] = exc.payload
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=error_msg,
            )
            result_payload = {
                "run_id": run_id,
                "status": "error",
                "error": error_msg,
                "error_detail": getattr(exc, "payload", None),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue(
                {
                    "type": "error",
                    "message": getattr(exc, "payload", {}).get("userMessage") if getattr(exc, "payload", None) else error_msg,
                    "error": getattr(exc, "payload", None),
                    "final": True,
                    "result": result_payload,
                }
            )
        except TaskExecutionError as exc:
            error_msg = "cancelled" if str(exc) == "cancelled" else str(exc)
            manifest.update({"status": "cancelled" if str(exc) == "cancelled" else "error", "error": error_msg})
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="cancelled" if str(exc) == "cancelled" else "error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=error_msg,
            )
            result_payload = {
                "run_id": run_id,
                "status": "cancelled" if str(exc) == "cancelled" else "error",
                "error": error_msg,
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "error", "message": error_msg, "final": True, "result": result_payload})
        except Exception as exc:
            manifest.update({"status": "error", "error": str(exc)})
            _persist_repo_state(manifest_path, manifest)
            artifacts_index, synthesis_payload = _build_artifacts_index(
                run_dir=run_dir,
                repo=req.repo,
                branch=req.options.branch,
                run_id=run_id,
                status="error",
                execution_result=execution_result,
                manifest_path=manifest_path,
                taskgraph_path=taskgraph_path,
                error_message=str(exc),
            )
            result_payload = {
                "run_id": run_id,
                "status": "error",
                "error": str(exc),
                "artifacts": {
                    "run_dir": str(run_dir),
                    "manifest": str(manifest_path),
                    "result": str(_repo_result_path(run_id)),
                    **synthesis_payload,
                    "index": artifacts_index,
                },
                "artifacts_index": artifacts_index,
            }
            manifest.update({"artifacts_index": artifacts_index})
            _persist_repo_state(manifest_path, manifest)
            _persist_repo_state(_repo_result_path(run_id), result_payload)
            await _enqueue({"type": "error", "message": str(exc), "final": True, "result": result_payload})
        finally:
            async with _repo_state_lock:
                _repo_orchestration_state.pop(run_id, None)

    asyncio.create_task(_pipeline())

    async def event_generator():
        while True:
            try:
                payload = await event_queue.get()
            except asyncio.CancelledError:
                break
            yield f"data: {json.dumps(payload)}\n\n"
            if payload.get("final"):
                break
            if await request.is_disconnected():
                cancel_event.set()
                break

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@app.get("/orchestrate/repo/{run_id}")
def get_repo_orchestration(run_id: str):
    manifest_path = _repo_manifest_path(run_id)
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    data = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_id}") or {}
    result_path = _repo_result_path(run_id)
    if result_path.exists():
        data["result"] = safe_json_load(result_path, default={}, context=f"repo_result:{run_id}")
    if data.get("result") and not data["result"].get("artifacts_index"):
        artifacts = (data["result"].get("artifacts") or {}).get("index")
        if artifacts:
            data["result"]["artifacts_index"] = artifacts
    return data


@app.get("/orchestrate/repo")
def list_repo_orchestrations(limit: int = Query(50, ge=1, le=200)):
    runs: List[Dict[str, Any]] = []
    for run_dir in BRIDGE_RUN_DIR.iterdir():
        if not run_dir.is_dir():
            continue
        manifest_path = run_dir / "repo-orchestration.json"
        if not manifest_path.exists():
            continue
        manifest = safe_json_load(manifest_path, default={}, context=f"repo_manifest:{run_dir.name}") or {}
        report_path = run_dir / "REPORT.json"
        report_summary = None
        if report_path.exists():
            report = safe_json_load(report_path, default=None, context=f"report_json:{run_dir.name}")
            if isinstance(report, dict) and report.get("schema_version") == "1.0":
                summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
                report_summary = {
                    "outcome": report.get("outcome"),
                    "headline": summary.get("headline") if isinstance(summary, dict) else None,
                    "patch": bool((report.get("changes") or {}).get("patch_artifact")),
                    "commands_executed": len((report.get("verification") or {}).get("commands") or []),
                }

        run_entry = {
            "run_id": manifest.get("run_id") or run_dir.name,
            "repo": manifest.get("repo"),
            "branch": (manifest.get("options") or {}).get("branch") if isinstance(manifest.get("options"), dict) else None,
            "status": manifest.get("status"),
            "requested_at": manifest.get("requested_at"),
            "report_summary": report_summary,
        }
        runs.append(run_entry)

    def _sort_key(item: Dict[str, Any]) -> str:
        return str(item.get("requested_at") or "")

    runs.sort(key=_sort_key, reverse=True)
    return {"runs": runs[:limit]}


@app.get("/orchestrate/repo/{run_id}/synthesis/{codex_run_id}")
def get_repo_synthesis_html(run_id: str, codex_run_id: str):
    if any(sep in run_id for sep in ("/", "\\")) or any(sep in codex_run_id for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid run identifier")

    synthesis_path = (
        BRIDGE_RUN_DIR
        / run_id
        / "codex_runs"
        / codex_run_id
        / "swarm-output"
        / "Final_Synthesis.html"
    )
    if not synthesis_path.exists():
        raise HTTPException(status_code=404, detail="Final synthesis not found")

    html = synthesis_path.read_text(encoding="utf-8", errors="replace")
    return Response(content=html, media_type="text/html")


def _load_artifacts_index(run_id: str) -> List[Dict[str, Any]]:
    result_path = _repo_result_path(run_id)
    if not result_path.exists():
        return []
    data = safe_json_load(result_path, default={}, context=f"repo_result:{run_id}") or {}
    artifacts_index = data.get("artifacts_index")
    if artifacts_index:
        return artifacts_index
    artifacts = (data.get("artifacts") or {}).get("index")
    return artifacts or []


@app.get("/orchestrate/repo/{run_id}/artifacts")
def list_repo_artifacts(run_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    if not artifacts_index:
        raise HTTPException(status_code=404, detail="No artifacts found for run")
    return {"run_id": run_id, "artifacts": artifacts_index}


@app.get("/orchestrate/repo/{run_id}/artifacts/{artifact_id}")
def get_repo_artifact(run_id: str, artifact_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    match = None
    for artifact in artifacts_index:
        if artifact.get("artifactId") == artifact_id:
            match = artifact
            break
    if not match:
        raise HTTPException(status_code=404, detail="Artifact not found")

    path = pathlib.Path(match["filePath"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact file missing")

    run_dir = BRIDGE_RUN_DIR / run_id
    try:
        if not str(path.resolve()).startswith(str(run_dir.resolve())):
            raise HTTPException(status_code=403, detail="Artifact path not allowed")
    except Exception:
        raise HTTPException(status_code=403, detail="Artifact path not allowed")

    content = path.read_text(encoding="utf-8", errors="replace")
    return Response(content=content, media_type=match.get("mimeType") or "text/plain")


@app.get("/orchestrate/repo/{run_id}/artifacts.zip")
def download_repo_artifacts_zip(run_id: str):
    artifacts_index = _load_artifacts_index(run_id)
    if not artifacts_index:
        raise HTTPException(status_code=404, detail="No artifacts found for run")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for artifact in artifacts_index:
            path = pathlib.Path(artifact["filePath"])
            if not path.exists():
                continue
            arcname = pathlib.Path(artifact["fileName"]).name
            zipf.write(path, arcname=arcname)

    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename={run_id}-artifacts.zip"}
    return Response(content=buffer.getvalue(), media_type="application/zip", headers=headers)


@app.post("/orchestrate/repo/{run_id}/cancel")
async def cancel_repo_orchestration(
    run_id: str,
    execution_token: Optional[str] = Header(default=None, alias="X-Execution-Token"),
    admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_execution_access(execution_token or admin_token)

    async with _repo_state_lock:
        state = _repo_orchestration_state.get(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not active or already finished")
    cancel_event: asyncio.Event = state.get("cancel_event")  # type: ignore[assignment]
    cancel_event.set()
    codex_service = state.get("codex_service")
    for codex_run_id in list(state.get("codex_runs", [])):
        try:
            await codex_service.cancel_run(codex_run_id)  # type: ignore[operator]
        except Exception:
            continue
    return {"run_id": run_id, "cancelled": True}

class RunFeedbackRequest(BaseModel):
    """Request model for submitting run feedback (from Supervisor)."""
    run_id: str
    quality_score: float = Field(..., ge=0, le=10)
    feedback: List[str] = Field(default_factory=list)
    insights: List[str] = Field(default_factory=list)
    agent_scores: Dict[str, float] = Field(default_factory=dict)


class RunFeedbackResponse(BaseModel):
    """Response model for run feedback."""
    id: int
    run_id: str
    quality_score: float
    created_at: str


@app.post("/orchestrate/run/{run_id}/feedback", response_model=RunFeedbackResponse)
def submit_run_feedback(run_id: str, feedback: RunFeedbackRequest):
    """
    Submit feedback for a completed orchestration run.
    This is typically called by the Supervisor agent to record quality assessments.
    """
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        now = now_iso()
        
        # Insert feedback
        c.execute("""
            INSERT INTO run_feedback 
            (run_id, quality_score, feedback_json, insights_json, agent_scores_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            run_id,
            feedback.quality_score,
            json.dumps(feedback.feedback),
            json.dumps(feedback.insights),
            json.dumps(feedback.agent_scores),
            now
        ))
        
        feedback_id = c.lastrowid
        conn.commit()
        
        return RunFeedbackResponse(
            id=feedback_id,
            run_id=run_id,
            quality_score=feedback.quality_score,
            created_at=now
        )


@app.get("/orchestrate/run/{run_id}/feedback")
def get_run_feedback(run_id: str):
    """Get feedback for a specific orchestration run."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute("""
            SELECT id, run_id, quality_score, feedback_json, insights_json, 
                   agent_scores_json, created_at
            FROM run_feedback
            WHERE run_id = ?
            ORDER BY created_at DESC
        """, (run_id,))
        
        rows = c.fetchall()
        
        feedback_list = []
        for row in rows:
            feedback_list.append({
                "id": row["id"],
                "run_id": row["run_id"],
                "quality_score": row["quality_score"],
                "feedback": json.loads(row["feedback_json"]) if row["feedback_json"] else [],
                "insights": json.loads(row["insights_json"]) if row["insights_json"] else [],
                "agent_scores": json.loads(row["agent_scores_json"]) if row["agent_scores_json"] else {},
                "created_at": row["created_at"]
            })
        
        return {"run_id": run_id, "feedback": feedback_list}


@app.get("/orchestrate/feedback/recent")
def get_recent_feedback(limit: int = Query(10, ge=1, le=100)):
    """Get recent run feedback across all runs."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute("""
            SELECT id, run_id, quality_score, feedback_json, insights_json,
                   agent_scores_json, created_at
            FROM run_feedback
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        
        rows = c.fetchall()
        
        feedback_list = []
        for row in rows:
            feedback_list.append({
                "id": row["id"],
                "run_id": row["run_id"],
                "quality_score": row["quality_score"],
                "feedback": json.loads(row["feedback_json"]) if row["feedback_json"] else [],
                "insights": json.loads(row["insights_json"]) if row["insights_json"] else [],
                "agent_scores": json.loads(row["agent_scores_json"]) if row["agent_scores_json"] else {},
                "created_at": row["created_at"]
            })
        
        return {"feedback": feedback_list}


@app.get("/orchestrate/learning/patterns")
def get_learning_patterns(pattern_type: Optional[str] = None, limit: int = Query(20, ge=1, le=100)):
    """Get learned patterns from successful runs."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if pattern_type:
            c.execute("""
                SELECT id, pattern_type, pattern_data, source_run_ids, quality_score,
                       usage_count, success_rate, created_at, last_used_at
                FROM learning_patterns
                WHERE pattern_type = ?
                ORDER BY quality_score DESC, usage_count DESC
                LIMIT ?
            """, (pattern_type, limit))
        else:
            c.execute("""
                SELECT id, pattern_type, pattern_data, source_run_ids, quality_score,
                       usage_count, success_rate, created_at, last_used_at
                FROM learning_patterns
                ORDER BY quality_score DESC, usage_count DESC
                LIMIT ?
            """, (limit,))
        
        rows = c.fetchall()
        
        patterns = []
        for row in rows:
            patterns.append({
                "id": row["id"],
                "pattern_type": row["pattern_type"],
                "pattern_data": json.loads(row["pattern_data"]) if row["pattern_data"] else {},
                "source_run_ids": json.loads(row["source_run_ids"]) if row["source_run_ids"] else [],
                "quality_score": row["quality_score"],
                "usage_count": row["usage_count"],
                "success_rate": row["success_rate"],
                "created_at": row["created_at"],
                "last_used_at": row["last_used_at"]
            })
        
        return {"patterns": patterns}


class CloneProgressResponse(BaseModel):
    """Response model for clone progress."""
    clone_id: str
    repo_url: str
    status: str
    progress_percent: float
    message: str
    clone_path: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    error: Optional[str] = None
    size_mb: Optional[float] = None
    file_count: Optional[int] = None
    branches: Optional[List[str]] = None


@app.post("/github/search", response_model=List[GitHubRepoInfo])
def search_github_repositories(request: GitHubSearchRequest):
    """
    Search for repositories on GitHub.
    
    Args:
        request: Search request with query and max results
        
    Returns:
        List of repository information
    """
    try:
        cloner = get_github_cloner()
        repos = cloner.search_repositories(request.query, request.max_results)
        return repos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/github/repo/{owner}/{repo_name}", response_model=GitHubRepoInfo)
def get_repository_info(owner: str, repo_name: str):
    """
    Get detailed information about a specific repository.
    
    Args:
        owner: Repository owner
        repo_name: Repository name
        
    Returns:
        Repository information
    """
    try:
        cloner = get_github_cloner()
        info = cloner.get_repository_info(owner, repo_name)
        return info
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/github/clone", response_model=CloneProgressResponse)
def clone_repository(request: CloneRequest):
    """
    Clone a GitHub repository.
    
    Args:
        request: Clone request with repo URL and optional branch/depth
        
    Returns:
        Clone progress response with clone ID
    """
    try:
        cloner = get_github_cloner()
        clone_id = cloner.clone_repository(
            repo_url=request.repo_url,
            branch=request.branch,
            depth=request.depth
        )
        
        # Get initial progress
        progress = cloner.get_progress(clone_id)
        if not progress:
            raise HTTPException(status_code=500, detail="Failed to start clone")
        
        return CloneProgressResponse(
            clone_id=clone_id,
            repo_url=progress.repo_url,
            status=progress.status.value,
            progress_percent=progress.progress_percent,
            message=progress.message,
            clone_path=progress.clone_path,
            start_time=progress.start_time.isoformat(),
            end_time=progress.end_time.isoformat() if progress.end_time else None,
            error=progress.error,
            size_mb=progress.size_mb,
            file_count=progress.file_count,
            branches=progress.branches
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/github/clone/{clone_id}/progress", response_model=CloneProgressResponse)
def get_clone_progress(clone_id: str):
    """
    Get the progress of a clone operation.
    
    Args:
        clone_id: Clone operation ID
        
    Returns:
        Clone progress information
    """
    cloner = get_github_cloner()
    progress = cloner.get_progress(clone_id)
    
    if not progress:
        raise HTTPException(status_code=404, detail="Clone operation not found")
    
    return CloneProgressResponse(
        clone_id=clone_id,
        repo_url=progress.repo_url,
        status=progress.status.value,
        progress_percent=progress.progress_percent,
        message=progress.message,
        clone_path=progress.clone_path,
        start_time=progress.start_time.isoformat(),
        end_time=progress.end_time.isoformat() if progress.end_time else None,
        error=progress.error,
        size_mb=progress.size_mb,
        file_count=progress.file_count,
        branches=progress.branches
    )


@app.get("/github/clone/{clone_id}/tree")
def get_file_tree(clone_id: str, max_depth: int = Query(3, ge=1, le=10)):
    """
    Get the file tree of a cloned repository.
    
    Args:
        clone_id: Clone operation ID
        max_depth: Maximum depth to traverse
        
    Returns:
        File tree as nested JSON
    """
    cloner = get_github_cloner()
    tree = cloner.get_file_tree(clone_id, max_depth)
    
    if tree is None:
        raise HTTPException(status_code=404, detail="Clone not found or not completed")
    
    return tree


@app.delete("/github/clone/{clone_id}")
def cleanup_clone(clone_id: str):
    """
    Clean up a cloned repository.
    
    Args:
        clone_id: Clone operation ID
        
    Returns:
        Success message
    """
    cloner = get_github_cloner()
    success = cloner.cleanup_clone(clone_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Clone not found or cleanup failed")
    
    return {"message": "Clone cleaned up successfully"}


@app.get("/github/clones", response_model=List[CloneProgressResponse])
def list_clones():
    """
    List all tracked clone operations.
    
    Returns:
        List of clone progress information
    """
    cloner = get_github_cloner()
    clones = cloner.list_clones()
    
    return [
        CloneProgressResponse(
            clone_id=f"{int(progress.start_time.timestamp())}_{hash(progress.repo_url)}",
            repo_url=progress.repo_url,
            status=progress.status.value,
            progress_percent=progress.progress_percent,
            message=progress.message,
            clone_path=progress.clone_path,
            start_time=progress.start_time.isoformat(),
            end_time=progress.end_time.isoformat() if progress.end_time else None,
            error=progress.error,
            size_mb=progress.size_mb,
            file_count=progress.file_count,
            branches=progress.branches
        )
        for progress in clones
    ]


def _is_port_available(port: int, host: str = "0.0.0.0") -> bool:
    """Check if a port is available for binding."""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
            return True
    except OSError:
        return False


def _find_available_port(start_port: int, max_attempts: int = 10, host: str = "0.0.0.0") -> int:
    """Find an available port, starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        if _is_port_available(port, host):
            return port
    raise RuntimeError(f"No available port found in range {start_port}-{start_port + max_attempts - 1}")


if __name__ == "__main__":
    requested_port = int(os.environ.get("PROMPT_API_PORT", "8000"))
    host = os.environ.get("PROMPT_API_HOST", "127.0.0.1")
    
    # Check if port is available, find alternative if not
    if _is_port_available(requested_port, host):
        port = requested_port
    else:
        print(f"Port {requested_port} is already in use, searching for available port...")
        try:
            port = _find_available_port(requested_port + 1, max_attempts=10, host=host)
            print(f"Using alternative port: {port}")
        except RuntimeError as e:
            print(f"Error: {e}")
            print("Please free up port 8000 or set PROMPT_API_PORT to an available port.")
            sys.exit(1)
    
    print(f"Starting server on {host}:{port}")
    uvicorn.run("app:app", host=host, port=port, reload=True)
### END FILE



