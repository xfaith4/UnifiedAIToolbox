### BEGIN FILE: app.py
import os, json, hashlib, sqlite3, datetime, textwrap, pathlib

# ### BEGIN: RootAndFavicon-Imports
from fastapi.responses import RedirectResponse, Response
# ### END: RootAndFavicon-Imports

from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException # pyright: ignore[reportMissingImports]
from pydantic import BaseModel, Field, validator # pyright: ignore[reportMissingImports]
import uvicorn # pyright: ignore[reportMissingImports]
import yaml # pyright: ignore[reportMissingModuleSource]
import requests # pyright: ignore[reportMissingModuleSource]

# ----------------------------
# Configuration
# ----------------------------
BASE_DIR = pathlib.Path(__file__).parent.resolve()
DB_PATH = BASE_DIR / "workbench.db"
TEMPLATE_DIR = BASE_DIR / "templates"
DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")  # Adjust as needed
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

if not TEMPLATE_DIR.exists():
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

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

    @validator("desired_output")
    def at_least_one_output(cls, v):
        if not v:
            raise ValueError("desired_output must have at least one item")
        return v

class GenerateResponse(BaseModel):
    cached: bool
    cache_key: str
    template_id: str
    model: str
    output: Dict[str, Any]
    audit_id: int

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
        conn.commit()

def now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

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
        "InputData": req.input_data.dict()
    }

    user_content = f"""\
You are acting as: {req.role}
Task: {req.task}
Context: {json.dumps(req.context, ensure_ascii=False)}
Modes: {", ".join(req.modes)}
DesiredOutput: {", ".join(req.desired_output)}

InputData (JSON):
{json.dumps(req.input_data.dict(), ensure_ascii=False, indent=2)}

{contract}

Return ONLY the JSON. No extra text.
"""
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
        raise HTTPException(status_code=502, detail=f"OpenAI error {resp.status_code}: {resp.text}")

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

# ----------------------------
# FastAPI app
# ----------------------------
app = FastAPI(title="AI Prompt Workbench", version="1.0.0")
# ### BEGIN: RootAndFavicon-Routes
@app.get("/", include_in_schema=False)
def root():
    # Send humans to the interactive docs; avoids 404 on GET /
    return RedirectResponse(url="/docs")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Return empty 204 to silence browser favicon requests without 404 noise
    return Response(status_code=204, media_type="image/x-icon")
# ### END: RootAndFavicon-Routes

@app.on_event("startup")
def _startup():
    init_db()

@app.get("/health")
def health():
    return {"ok": True, "time": now_iso()}

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
from fastapi.responses import HTMLResponse, RedirectResponse, Response

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
# --- Utilities to reload & inspect templates, and to dry-run prompt assembly ---
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Path, Query
from fastapi.responses import HTMLResponse

# Minimal CORS now; expand origins if/when you add a front-end
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    templates = read_templates()
    if req.template_id not in templates:
        raise HTTPException(status_code=404, detail=f"Template not found: {req.template_id}")
    tpl = templates[req.template_id]
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
    templates = read_templates()
    if req.template_id not in templates:
        raise HTTPException(status_code=404, detail=f"Template not found: {req.template_id}")
    tpl = templates[req.template_id]

    model = req.model or DEFAULT_MODEL
    payload_for_hash = {
        "template_id": req.template_id,
        "role": req.role,
        "task": req.task,
        "context": req.context,
        "input_data": req.input_data.dict(),
        "desired_output": req.desired_output,
        "modes": req.modes,
        "model": model,
        "tpl_version": tpl.get("id", "")
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
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
### END FILE
