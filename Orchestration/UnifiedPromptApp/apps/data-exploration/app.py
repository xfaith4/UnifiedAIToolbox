"""
Data Exploration Service
------------------------

FastAPI worker that accepts dataset uploads, stores metadata alongside the unified
toolbox, and emits runbooks/reviews whenever analysts trigger a prompt-driven analysis.

The service does not call an LLM directly; instead it coordinates with the Prompt API
(`services/prompt-api`) to render analysis prompts and log review telemetry so Prompt Hub
and Prompt Workbench show the same runbook history.
"""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DATA_EXP_", env_file=".env", extra="ignore")

    data_dir: Path = Path(__file__).resolve().parent / "data"
    prompt_api_base: str = "http://localhost:5050"


settings = ServiceSettings()
DATASETS_DIR = settings.data_dir / "datasets"
UPLOADS_DIR = settings.data_dir / "uploads"
RUNBOOK_DIR = settings.data_dir / "runbooks"
for path in (DATASETS_DIR, UPLOADS_DIR, RUNBOOK_DIR):
    path.mkdir(parents=True, exist_ok=True)

DATASET_INDEX = DATASETS_DIR / "index.json"


class DatasetMetadata(BaseModel):
    id: str
    filename: str
    content_type: Optional[str] = None
    size_bytes: int
    uploaded_at: str
    description: Optional[str] = None
    path: str


class AnalysisRequest(BaseModel):
    prompt_id: str = Field(..., description="Prompt registry identifier.")
    variables: Dict[str, Any] = Field(default_factory=dict)
    summary: Optional[str] = Field(default=None, description="Optional user-provided summary.")


def _read_datasets() -> Dict[str, DatasetMetadata]:
    if not DATASET_INDEX.exists():
        return {}
    try:
        raw = json.loads(DATASET_INDEX.read_text(encoding="utf-8"))
        return {item["id"]: DatasetMetadata(**item) for item in raw}
    except Exception:
        return {}


def _write_datasets(items: Dict[str, DatasetMetadata]) -> None:
    DATASET_INDEX.write_text(
        json.dumps([meta.model_dump() for meta in items.values()], indent=2),
        encoding="utf-8",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prompt_api_client() -> httpx.Client:
    return httpx.Client(base_url=settings.prompt_api_base.rstrip("/"), timeout=15)


app = FastAPI(title="Data Exploration Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "time": _now_iso()}


@app.get("/datasets", response_model=List[DatasetMetadata])
def list_datasets():
    return list(_read_datasets().values())


@app.post("/datasets/upload", response_model=DatasetMetadata)
def upload_dataset(file: UploadFile = File(...), description: Optional[str] = None):
    dataset_id = str(uuid.uuid4())
    upload_folder = UPLOADS_DIR / dataset_id
    upload_folder.mkdir(parents=True, exist_ok=True)
    target = upload_folder / file.filename
    with target.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)

    metadata = DatasetMetadata(
        id=dataset_id,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=target.stat().st_size,
        uploaded_at=_now_iso(),
        description=description,
        path=str(target),
    )
    index = _read_datasets()
    index[dataset_id] = metadata
    _write_datasets(index)
    return metadata


@app.post("/datasets/{dataset_id}/analyze")
def analyze_dataset(dataset_id: str, req: AnalysisRequest):
    datasets = _read_datasets()
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    dataset = datasets[dataset_id]

    rendered_prompt = None
    with _prompt_api_client() as client:
        try:
            resp = client.post(
                "/prompts/render",
                json={"prompt_id": req.prompt_id, "variables": req.variables},
            )
            resp.raise_for_status()
            rendered_prompt = resp.json()
        except Exception as exc:
            rendered_prompt = {"error": f"Failed to render prompt: {exc}"}

    runbook = {
        "dataset_id": dataset.id,
        "dataset_path": dataset.path,
        "prompt_id": req.prompt_id,
        "timestamp": _now_iso(),
        "summary": req.summary
        or f"Exploration queued for dataset '{dataset.filename}' using prompt {req.prompt_id}.",
        "references": [
            {"type": "dataset", "value": dataset.path},
            {"type": "prompt", "value": req.prompt_id},
        ],
        "reasoning": [
            "Uploaded dataset stored in the unified data directory.",
            "Rendered analysis prompt via Prompt API.",
            "Analyst requested follow-up actions captured below.",
        ],
        "next_steps": [
            "Review rendered prompt blocks and execute a generation via Prompt Workbench or Prompt API.",
            "Document conclusions in Prompt Hub runbooks once the analysis is complete.",
        ],
        "rendered_prompt": rendered_prompt,
    }
    runbook_path = RUNBOOK_DIR / f"{dataset.id}-{req.prompt_id}-{uuid.uuid4().hex}.json"
    runbook_path.write_text(json.dumps(runbook, indent=2), encoding="utf-8")

    try:
        payload = {
            "status": "pending",
            "reviewers": ["DataExplorationService"],
            "notes": runbook["summary"],
            "manifest": dataset.path,
            "runbook": runbook,
        }
        with _prompt_api_client() as client:
            client.post(f"/prompts/{req.prompt_id}/reviews", json=payload)
    except Exception:
        pass  # Non-blocking

    return {"runbook": runbook, "runbook_path": str(runbook_path)}
