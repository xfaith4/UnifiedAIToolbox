### BEGIN FILE: app.py
import os, json, hashlib, sqlite3, datetime, textwrap, pathlib, sys, subprocess, re, uuid
from dataclasses import dataclass
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any, Tuple

from fastapi import FastAPI, HTTPException, Path, Query, Header # pyright: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field, field_validator # pyright: ignore[reportMissingImports]
from pydantic_settings import BaseSettings, SettingsConfigDict
import uvicorn # pyright: ignore[reportMissingImports]
import yaml # pyright: ignore[reportMissingModuleSource]
import requests # pyright: ignore[reportMissingModuleSource]

# ----------------------------
# Configuration
# ----------------------------
BASE_DIR = pathlib.Path(__file__).parent.resolve()
ROOT_DIR = BASE_DIR.parent.parent


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
    openai_model: str = os.environ.get("OPENAI_MODEL", "gpt-5")  # fallback for legacy env var
    openai_api_key: Optional[str] = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY"))
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
PROMPT_SYNC_FILE = DATA_DIR / "prompt-library.json"
AGENT_SYNC_FILE = DATA_DIR / "agent-library.json"

BRIDGE_DIR = settings.bridge_dir
BRIDGE_RUN_DIR = BRIDGE_DIR / "runs"
BRIDGE_RUN_DIR.mkdir(parents=True, exist_ok=True)
PS_REFINER = BRIDGE_DIR / "OpenAI_Refiner.ps1"

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

def audit_log(template_id: str, model: str, input_json: str, output: Optional[Dict[str, Any]], cached: bool, status: str, token_prompt: Optional[int], token_completion: Optional[int]) -> int:
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
        INSERT INTO audit(template_id, model, input_json, output_json, cached, status, created_at, token_prompt, token_completion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (template_id, model, input_json, json.dumps(output) if output else None, 1 if cached else 0, status, now_iso(), token_prompt, token_completion))
        conn.commit()
        return c.lastrowid

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
        return
    if header_token != expected:
        raise HTTPException(status_code=401, detail="Admin token missing or invalid.")


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
def call_openai_chat(model: str, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.2
    }
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    if resp.status_code != 200:
        _raise_openai_error(resp)

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    # Expecting pure JSON
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        # Fallback: try to extract JSON blob
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(content[start:end+1])
        else:
            raise HTTPException(status_code=500, detail="Model did not return valid JSON.")

    return parsed, usage


def _raise_openai_error(resp: requests.Response) -> None:
    error_id = uuid.uuid4().hex[:8]
    snippet = (resp.text or "")[:500]
    print(f"[prompt-api] OpenAI error {error_id} ({resp.status_code}): {snippet}")
    raise HTTPException(status_code=502, detail=f"Upstream provider error (id: {error_id})")

# ----------------------------
# FastAPI app
# ----------------------------

# Security Headers Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
def create_app() -> FastAPI:
    fastapi_app = FastAPI(title="AI Prompt Workbench", version="1.0.0")

    # Add security headers middleware
    fastapi_app.add_middleware(SecurityHeadersMiddleware)

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://localhost:8501",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        init_db()
        yield

    fastapi_app.router.lifespan_context = lifespan
    return fastapi_app


app = create_app()

@app.get("/health")
def health():
    return {"ok": True, "time": now_iso()}

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
        audit_id = audit_log(req.template_id, model, input_json, cached_output, True, "ok", None, None)
        return GenerateResponse(
            cached=True,
            cache_key=cache_key,
            template_id=req.template_id,
            model=model,
            output=cached_output,
            audit_id=audit_id
        )

    # Build messages & call OpenAI
    messages = build_messages(tpl, req)
    try:
        output, usage = call_openai_chat(model, messages)
        # Cache + audit
        cache_put(cache_key, req.template_id, model, input_json, output)
        audit_id = audit_log(
            req.template_id, model, input_json, output, False, "ok",
            usage.get("prompt_tokens"), usage.get("completion_tokens")
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
        audit_id = audit_log(req.template_id, model, input_json, None, False, f"error:{e.detail}", None, None)
        raise e

if __name__ == "__main__":
    port = int(os.environ.get("PROMPT_API_PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
### END FILE


